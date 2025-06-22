export async function validateLicense(request, env) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  }

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders })
  }

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Solo POST permitido" }), { status: 405, headers: corsHeaders })
  }

  try {
    // 1. Leer request
    const requestText = await request.text()
    if (!requestText.trim()) {
      return new Response(JSON.stringify({ valid: false, error: "Request body vacío" }), {
        status: 400,
        headers: corsHeaders,
      })
    }

    const { licencia, hash_tienda, action } = JSON.parse(requestText)

    if (!licencia) {
      return new Response(JSON.stringify({ valid: false, error: "Falta parámetro licencia" }), {
        status: 400,
        headers: corsHeaders,
      })
    }

    // 2. Obtener token OAuth
    const jwt = await createJWTSimple(env)
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    })

    if (!tokenResponse.ok) {
      throw new Error(`Error OAuth: ${tokenResponse.status}`)
    }

    const tokenData = await tokenResponse.json()
    const accessToken = tokenData.access_token

    // 3. Leer Google Sheets
    const sheetsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${env.GOOGLE_SHEET_ID}/values/Licencias!A:Z`
    const sheetsResponse = await fetch(sheetsUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!sheetsResponse.ok) {
      throw new Error(`Error Google Sheets: ${sheetsResponse.status}`)
    }

    const sheetsData = await sheetsResponse.json()
    const rows = sheetsData.values || []

    if (rows.length === 0) {
      return new Response(JSON.stringify({ valid: false, error: "No hay datos en la hoja" }), {
        status: 404,
        headers: corsHeaders,
      })
    }

    // 4. Buscar licencia
    const headers = rows[0]
    const licenciaCol = headers.indexOf("licencia")
    const hashCol = headers.indexOf("hash_tienda")
    const statusCol = headers.indexOf("status")
    const fechaCol = headers.indexOf("última_verificación")

    if (licenciaCol === -1) {
      throw new Error('No se encontró columna "licencia"')
    }

    let licenseRow = null
    let rowIndex = -1

    for (let i = 1; i < rows.length; i++) {
      if (rows[i][licenciaCol] === licencia) {
        licenseRow = rows[i]
        rowIndex = i + 1 // Para Google Sheets (base 1)
        break
      }
    }

    if (!licenseRow) {
      return new Response(JSON.stringify({ valid: false, error: "Licencia no encontrada" }), {
        status: 404,
        headers: corsHeaders,
      })
    }

    const currentStatus = licenseRow[statusCol] || ""
    const currentHash = licenseRow[hashCol] || ""
    const today = new Date().toISOString().split("T")[0]

    // 5. LÓGICA DE VALIDACIÓN ACTUALIZADA

    // Acción: clear (liberar licencia)
    if (action === "clear") {
      await updateLicenseRow(env.GOOGLE_SHEET_ID, accessToken, rowIndex, headers, {
        hash_tienda: "",
        status: "inactiva",
        última_verificación: today,
      })

      return new Response(JSON.stringify({ valid: true, message: "Licencia liberada correctamente" }), {
        status: 200,
        headers: corsHeaders,
      })
    }

    // Validación normal - necesita hash_tienda
    if (!hash_tienda) {
      return new Response(JSON.stringify({ valid: false, error: "Falta parámetro hash_tienda" }), {
        status: 400,
        headers: corsHeaders,
      })
    }

    // Si la licencia ya está marcada como inválida o inactiva
    if (currentStatus === "inválida" || currentStatus === "inactiva") {
      return new Response(
        JSON.stringify({
          valid: false,
          error: `Licencia ${currentStatus}`,
          status: currentStatus,
        }),
        { status: 200, headers: corsHeaders },
      )
    }

    // NUEVA LÓGICA: Si ya tiene un hash diferente, marcar como INACTIVA
    if (currentHash && currentHash !== hash_tienda) {
      // Marcar como INACTIVA (no inválida)
      await updateLicenseRow(env.GOOGLE_SHEET_ID, accessToken, rowIndex, headers, {
        status: "inactiva",
        última_verificación: today,
      })

      return new Response(
        JSON.stringify({
          valid: false,
          error: "Licencia en uso en otra tienda",
          status: "inactiva",
          message: "Esta licencia está siendo usada en otra tienda y ha sido desactivada",
        }),
        { status: 409, headers: corsHeaders },
      )
    }

    // Si no tiene hash o tiene el mismo hash, activar/mantener activa
    await updateLicenseRow(env.GOOGLE_SHEET_ID, accessToken, rowIndex, headers, {
      hash_tienda: hash_tienda,
      status: "activa",
      última_verificación: today,
    })

    return new Response(
      JSON.stringify({
        valid: true,
        message: "Licencia válida y actualizada",
        status: "activa",
        licenseInfo: {
          licencia,
          hash_tienda,
          ultima_verificacion: today,
        },
      }),
      { status: 200, headers: corsHeaders },
    )
  } catch (error) {
    return new Response(
      JSON.stringify({
        valid: false,
        error: `Error interno: ${error.message}`,
      }),
      { status: 500, headers: corsHeaders },
    )
  }
}

// Función para actualizar una fila en Google Sheets
async function updateLicenseRow(sheetId, accessToken, rowIndex, headers, updates) {
  // Leer fila actual
  const readUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Licencias!A${rowIndex}:Z${rowIndex}`
  const readResponse = await fetch(readUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!readResponse.ok) {
    throw new Error(`Error leyendo fila: ${readResponse.status}`)
  }

  const readData = await readResponse.json()
  const currentRow = readData.values?.[0] || []

  // Crear nueva fila con updates
  const newRow = [...currentRow]

  Object.keys(updates).forEach((key) => {
    const colIndex = headers.indexOf(key)
    if (colIndex !== -1) {
      // Asegurar que el array tenga suficientes elementos
      while (newRow.length <= colIndex) {
        newRow.push("")
      }
      newRow[colIndex] = updates[key]
    }
  })

  // Actualizar fila
  const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Licencias!A${rowIndex}:Z${rowIndex}?valueInputOption=USER_ENTERED`
  const updateResponse = await fetch(updateUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values: [newRow] }),
  })

  if (!updateResponse.ok) {
    throw new Error(`Error actualizando fila: ${updateResponse.status}`)
  }
}

// JWT simple usando Web Crypto API nativa
async function createJWTSimple(env) {
  const header = { alg: "RS256", typ: "JWT" }
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    iss: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  }

  const headerB64 = btoa(JSON.stringify(header)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")
  const payloadB64 = btoa(JSON.stringify(payload)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")
  const message = `${headerB64}.${payloadB64}`

  // Importar clave privada
  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    str2ab(
      atob(
        env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n")
          .replace(/-----BEGIN PRIVATE KEY-----/, "")
          .replace(/-----END PRIVATE KEY-----/, "")
          .replace(/\s/g, ""),
      ),
    ),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  )

  // Firmar
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(message))
  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")

  return `${message}.${signatureB64}`
}

function str2ab(str) {
  const buf = new ArrayBuffer(str.length)
  const bufView = new Uint8Array(buf)
  for (let i = 0; i < str.length; i++) {
    bufView[i] = str.charCodeAt(i)
  }
  return buf
}
