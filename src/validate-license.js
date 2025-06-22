import jwt from "jsonwebtoken"

// Función para añadir headers CORS
function getCorsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  }
}

// Generar token JWT para autenticación
async function getAccessToken(email, privateKey) {
  try {
    const now = Math.floor(Date.now() / 1000)
    const payload = {
      iss: email,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    }

    const token = jwt.sign(payload, privateKey, { algorithm: "RS256" })

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: token,
      }),
    })

    // Verificar si la respuesta es válida antes de parsear
    if (!response.ok) {
      const errorText = await response.text()
      console.error("Error response from Google OAuth:", errorText)
      throw new Error(`Error obteniendo token: ${response.status} ${response.statusText} - ${errorText}`)
    }

    const responseText = await response.text()
    console.log("OAuth response text:", responseText)

    if (!responseText.trim()) {
      throw new Error("Respuesta vacía del servidor de OAuth")
    }

    const data = JSON.parse(responseText)
    return data.access_token
  } catch (error) {
    console.error("Error in getAccessToken:", error)
    throw error
  }
}

// Función para hacer request a Google Sheets con retry
async function fetchGoogleSheets(url, accessToken, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`Intento ${i + 1} - Fetching Google Sheets URL:`, url)

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`Error en Google Sheets (intento ${i + 1}):`, response.status, errorText)

        if (i === retries - 1) {
          throw new Error(`Error en Google Sheets: ${response.status} ${response.statusText} - ${errorText}`)
        }
        continue
      }

      const responseText = await response.text()
      console.log("Google Sheets response text length:", responseText.length)

      if (!responseText.trim()) {
        if (i === retries - 1) {
          throw new Error("Respuesta vacía de Google Sheets")
        }
        continue
      }

      const data = JSON.parse(responseText)
      return data
    } catch (error) {
      console.error(`Error en intento ${i + 1}:`, error.message)
      if (i === retries - 1) {
        throw error
      }
      // Esperar un poco antes del siguiente intento
      await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)))
    }
  }
}

// Función para actualizar Google Sheets
async function updateGoogleSheets(url, accessToken, data, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`Intento ${i + 1} - Updating Google Sheets:`, url)

      const response = await fetch(url, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`Error actualizando Google Sheets (intento ${i + 1}):`, response.status, errorText)

        if (i === retries - 1) {
          throw new Error(`Error al actualizar Google Sheets: ${response.status} ${response.statusText} - ${errorText}`)
        }
        continue
      }

      const responseText = await response.text()
      if (responseText.trim()) {
        JSON.parse(responseText) // Verificar que es JSON válido
      }

      return true
    } catch (error) {
      console.error(`Error en actualización intento ${i + 1}:`, error.message)
      if (i === retries - 1) {
        throw error
      }
      await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)))
    }
  }
}

// Función principal
export async function validateLicense(request, env) {
  const headers = getCorsHeaders()

  // Manejar preflight (OPTIONS)
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 200, headers })
  }

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers })
  }

  try {
    console.log("=== INICIO VALIDACIÓN LICENCIA ===")

    // Acceder a las variables de entorno
    const SHEET_ID = env.GOOGLE_SHEET_ID
    const GOOGLE_SERVICE_ACCOUNT_EMAIL = env.GOOGLE_SERVICE_ACCOUNT_EMAIL
    const GOOGLE_PRIVATE_KEY = env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n")

    // Verificar variables de entorno
    if (!SHEET_ID || !GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_PRIVATE_KEY) {
      throw new Error("Faltan variables de entorno: GOOGLE_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL o GOOGLE_PRIVATE_KEY")
    }

    console.log("Variables de entorno verificadas")

    // Parsear request body
    const requestText = await request.text()
    console.log("Request body text:", requestText)

    if (!requestText.trim()) {
      return new Response(JSON.stringify({ valid: false, error: "Request body vacío" }), { status: 400, headers })
    }

    const body = JSON.parse(requestText)
    const { licencia, hash_tienda, action } = body
    console.log("Request body parsed:", { licencia, hash_tienda, action })

    if (!licencia) {
      return new Response(JSON.stringify({ valid: false, error: "Falta el parámetro licencia" }), {
        status: 400,
        headers,
      })
    }

    // Obtener token de acceso
    console.log("Obteniendo access token...")
    const accessToken = await getAccessToken(GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY)
    console.log("Access token obtenido exitosamente")

    // Consulta a Google Sheets con retry
    const googleSheetsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Licencias!A:Z`
    const data = await fetchGoogleSheets(googleSheetsUrl, accessToken)

    console.log("Google Sheets data obtenida:", data ? "✓" : "✗")
    const rows = data.values || []
    console.log("Número de filas:", rows.length)

    if (rows.length === 0) {
      throw new Error("No se encontraron filas en la hoja Licencias")
    }

    // Obtener encabezados y mapear a índices
    const headersRow = rows[0]
    console.log("Headers encontrados:", headersRow)

    const licenciaIndex = headersRow.indexOf("licencia")
    const hashTiendaIndex = headersRow.indexOf("hash_tienda")
    const statusIndex = headersRow.indexOf("status")
    const ultimaVerificacionIndex = headersRow.indexOf("última_verificación")

    console.log("Índices de columnas:", { licenciaIndex, hashTiendaIndex, statusIndex, ultimaVerificacionIndex })

    if (licenciaIndex === -1 || hashTiendaIndex === -1 || statusIndex === -1 || ultimaVerificacionIndex === -1) {
      throw new Error("Faltan columnas requeridas en la hoja: licencia, hash_tienda, status o última_verificación")
    }

    // Buscar la licencia
    const licenseRow = rows.slice(1).find((row) => row[licenciaIndex] && row[licenciaIndex].trim() === licencia.trim())
    console.log("Licencia encontrada:", licenseRow ? "✓" : "✗")

    if (!licenseRow) {
      return new Response(JSON.stringify({ valid: false, error: "Licencia no encontrada" }), { status: 404, headers })
    }

    // Fecha actual YYYY-MM-DD
    const today = new Date().toISOString().split("T")[0]

    // Acción: clear libera la licencia
    if (action === "clear") {
      const rowIndex = rows.indexOf(licenseRow) + 1
      const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Licencias!A${rowIndex}:Z${rowIndex}?valueInputOption=USER_ENTERED`

      licenseRow[hashTiendaIndex] = ""
      licenseRow[statusIndex] = "inactiva"
      licenseRow[ultimaVerificacionIndex] = today

      await updateGoogleSheets(updateUrl, accessToken, { values: [licenseRow] })

      return new Response(JSON.stringify({ valid: true, message: "Licencia liberada" }), { status: 200, headers })
    }

    // Validación por defecto
    if (!hash_tienda) {
      return new Response(JSON.stringify({ valid: false, error: "Falta el parámetro hash_tienda" }), {
        status: 400,
        headers,
      })
    }

    const currentStatus = licenseRow[statusIndex]
    const currentHashTienda = licenseRow[hashTiendaIndex]
    console.log("Estado actual:", { currentStatus, currentHashTienda })

    // Si la licencia ya está inválida
    if (currentStatus === "inválida") {
      return new Response(JSON.stringify({ valid: false, error: "Licencia inválida" }), { status: 200, headers })
    }

    // Si ya hay un hash y es diferente al actual (licencia en uso)
    if (currentHashTienda && currentHashTienda !== hash_tienda) {
      const rowIndex = rows.indexOf(licenseRow) + 1
      const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Licencias!A${rowIndex}:Z${rowIndex}?valueInputOption=USER_ENTERED`

      licenseRow[statusIndex] = "inválida"
      licenseRow[ultimaVerificacionIndex] = today

      await updateGoogleSheets(updateUrl, accessToken, { values: [licenseRow] })

      return new Response(JSON.stringify({ valid: false, error: "duplicada" }), { status: 409, headers })
    }

    // Actualizar la licencia con el hash actual
    const rowIndex = rows.indexOf(licenseRow) + 1
    const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Licencias!A${rowIndex}:Z${rowIndex}?valueInputOption=USER_ENTERED`

    licenseRow[hashTiendaIndex] = hash_tienda
    licenseRow[statusIndex] = "activa"
    licenseRow[ultimaVerificacionIndex] = today

    await updateGoogleSheets(updateUrl, accessToken, { values: [licenseRow] })

    console.log("=== VALIDACIÓN EXITOSA ===")
    return new Response(JSON.stringify({ valid: true, message: "Licencia válida" }), { status: 200, headers })
  } catch (error) {
    console.error("=== ERROR EN VALIDACIÓN ===")
    console.error("Error message:", error.message)
    console.error("Error stack:", error.stack)

    return new Response(
      JSON.stringify({
        valid: false,
        error: `Error interno del servidor: ${error.message}`,
        timestamp: new Date().toISOString(),
      }),
      { status: 500, headers },
    )
  }
}
