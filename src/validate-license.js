
// Función para añadir headers CORS
function getCorsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  }
}

// Validador de licencias simple y directo
export default {
  async fetch(request, env) {
    // CORS headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    }

    // Manejar OPTIONS (preflight)
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 200, headers: corsHeaders })
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Solo POST permitido" }), { status: 405, headers: corsHeaders })
    }

    try {
      // 1. Obtener datos del request
      const { licencia, hash_tienda, action } = await request.json()

      if (!licencia) {
        return new Response(JSON.stringify({ valid: false, error: "Falta licencia" }), {
          status: 400,
          headers: corsHeaders,
        })
      }

      // 2. Obtener token de Google
      const token = await getGoogleToken(env)

      // 3. Leer Google Sheets
      const sheetData = await readGoogleSheet(env.GOOGLE_SHEET_ID, token)

      // 4. Buscar la licencia
      const licenseInfo = findLicense(sheetData, licencia)

      if (!licenseInfo) {
        return new Response(JSON.stringify({ valid: false, error: "Licencia no encontrada" }), {
          status: 404,
          headers: corsHeaders,
        })
      }

      // 5. Procesar según la acción
      if (action === "clear") {
        // Liberar licencia
        await updateLicense(env.GOOGLE_SHEET_ID, token, licenseInfo.row, {
          hash_tienda: "",
          status: "inactiva",
          ultima_verificacion: getTodayDate(),
        })

        return new Response(JSON.stringify({ valid: true, message: "Licencia liberada" }), {
          status: 200,
          headers: corsHeaders,
        })
      }

      // 6. Validación normal
      if (!hash_tienda) {
        return new Response(JSON.stringify({ valid: false, error: "Falta hash_tienda" }), {
          status: 400,
          headers: corsHeaders,
        })
      }

      // Si ya está inválida
      if (licenseInfo.status === "inválida") {
        return new Response(JSON.stringify({ valid: false, error: "Licencia inválida" }), {
          status: 200,
          headers: corsHeaders,
        })
      }

      // Si ya tiene otro hash (está en uso)
      if (licenseInfo.hash_tienda && licenseInfo.hash_tienda !== hash_tienda) {
        // Marcar como inválida
        await updateLicense(env.GOOGLE_SHEET_ID, token, licenseInfo.row, {
          status: "inválida",
          ultima_verificacion: getTodayDate(),
        })

        return new Response(JSON.stringify({ valid: false, error: "duplicada" }), { status: 409, headers: corsHeaders })
      }

      // Activar licencia
      await updateLicense(env.GOOGLE_SHEET_ID, token, licenseInfo.row, {
        hash_tienda: hash_tienda,
        status: "activa",
        ultima_verificacion: getTodayDate(),
      })

      return new Response(JSON.stringify({ valid: true, message: "Licencia válida" }), {
        status: 200,
        headers: corsHeaders,
      })
    } catch (error) {
      return new Response(
        JSON.stringify({
          valid: false,
          error: error.message,
          debug: error.stack,
        }),
        { status: 500, headers: corsHeaders },
      )
    }
  },
}

// Obtener token de Google (simple)
async function getGoogleToken(env) {
  const jwt = await createJWT(env)

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  })

  if (!response.ok) {
    throw new Error(`Error OAuth: ${response.status}`)
  }

  const data = await response.json()
  return data.access_token
}

// Crear JWT simple
async function createJWT(env) {
  const header = {
    alg: "RS256",
    typ: "JWT",
  }

  const now = Math.floor(Date.now() / 1000)
  const payload = {
    iss: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  }

  // Usar la librería jwt que ya tienes
  const jwt = require("jsonwebtoken")
  return jwt.sign(payload, env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"), { algorithm: "RS256" })
}

// Leer Google Sheets
async function readGoogleSheet(sheetId, token) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Licencias!A:Z`

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!response.ok) {
    throw new Error(`Error leyendo sheet: ${response.status}`)
  }

  const data = await response.json()
  return data.values || []
}

// Buscar licencia en los datos
function findLicense(sheetData, licencia) {
  if (sheetData.length === 0) return null

  const headers = sheetData[0]
  const rows = sheetData.slice(1)

  // Encontrar índices de columnas
  const licenciaCol = headers.indexOf("licencia")
  const hashCol = headers.indexOf("hash_tienda")
  const statusCol = headers.indexOf("status")
  const fechaCol = headers.indexOf("última_verificación")

  if (licenciaCol === -1) {
    throw new Error('No se encontró columna "licencia"')
  }

  // Buscar la fila
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (row[licenciaCol] === licencia) {
      return {
        row: i + 2, // +2 porque: +1 por header, +1 por índice base 1 de Google
        licencia: row[licenciaCol],
        hash_tienda: row[hashCol] || "",
        status: row[statusCol] || "",
        ultima_verificacion: row[fechaCol] || "",
        data: row,
      }
    }
  }

  return null
}

// Actualizar licencia
async function updateLicense(sheetId, token, rowNumber, updates) {
  // Primero leer la fila actual
  const readUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Licencias!A${rowNumber}:Z${rowNumber}`

  const readResponse = await fetch(readUrl, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!readResponse.ok) {
    throw new Error(`Error leyendo fila: ${readResponse.status}`)
  }

  const readData = await readResponse.json()
  const currentRow = readData.values?.[0] || []

  // Leer headers para saber qué columna actualizar
  const headersUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Licencias!A1:Z1`
  const headersResponse = await fetch(headersUrl, {
    headers: { Authorization: `Bearer ${token}` },
  })

  const headersData = await headersResponse.json()
  const headers = headersData.values?.[0] || []

  // Actualizar los valores necesarios
  const newRow = [...currentRow]

  Object.keys(updates).forEach((key) => {
    const colIndex = headers.indexOf(key)
    if (colIndex !== -1) {
      newRow[colIndex] = updates[key]
    }
  })

  // Escribir la fila actualizada
  const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Licencias!A${rowNumber}:Z${rowNumber}?valueInputOption=USER_ENTERED`

  const updateResponse = await fetch(updateUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      values: [newRow],
    }),
  })

  if (!updateResponse.ok) {
    throw new Error(`Error actualizando: ${updateResponse.status}`)
  }
}

// Obtener fecha de hoy
function getTodayDate() {
  return new Date().toISOString().split("T")[0]
}
