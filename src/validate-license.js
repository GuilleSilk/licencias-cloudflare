// Validador con debug detallado
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

  const debugSteps = []

  try {
    // PASO 1: Leer request body
    debugSteps.push("1. Leyendo request body...")
    const requestText = await request.text()
    debugSteps.push(`1. Request body length: ${requestText.length}`)

    if (!requestText.trim()) {
      return new Response(
        JSON.stringify({
          valid: false,
          error: "Request body vacío",
          debug: debugSteps,
        }),
        { status: 400, headers: corsHeaders },
      )
    }

    const requestData = JSON.parse(requestText)
    const { licencia, hash_tienda, action } = requestData
    debugSteps.push(`1. Datos parseados: licencia=${licencia}, hash_tienda=${hash_tienda}, action=${action}`)

    if (!licencia) {
      return new Response(
        JSON.stringify({
          valid: false,
          error: "Falta licencia",
          debug: debugSteps,
        }),
        { status: 400, headers: corsHeaders },
      )
    }

    // PASO 2: Verificar variables de entorno
    debugSteps.push("2. Verificando variables de entorno...")
    const hasSheetId = !!env.GOOGLE_SHEET_ID
    const hasEmail = !!env.GOOGLE_SERVICE_ACCOUNT_EMAIL
    const hasKey = !!env.GOOGLE_PRIVATE_KEY
    debugSteps.push(`2. Variables: SheetID=${hasSheetId}, Email=${hasEmail}, Key=${hasKey}`)

    if (!hasSheetId || !hasEmail || !hasKey) {
      return new Response(
        JSON.stringify({
          valid: false,
          error: "Faltan variables de entorno",
          debug: debugSteps,
        }),
        { status: 500, headers: corsHeaders },
      )
    }

    // PASO 3: Crear JWT
    debugSteps.push("3. Creando JWT...")
    const jwt = await createJWTSimple(env)
    debugSteps.push(`3. JWT creado, length: ${jwt.length}`)

    // PASO 4: Obtener token OAuth
    debugSteps.push("4. Obteniendo token OAuth...")
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    })

    debugSteps.push(`4. OAuth response status: ${tokenResponse.status}`)

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      debugSteps.push(`4. OAuth error: ${errorText}`)
      return new Response(
        JSON.stringify({
          valid: false,
          error: `Error OAuth: ${tokenResponse.status}`,
          debug: debugSteps,
        }),
        { status: 500, headers: corsHeaders },
      )
    }

    const tokenResponseText = await tokenResponse.text()
    debugSteps.push(`4. OAuth response length: ${tokenResponseText.length}`)

    if (!tokenResponseText.trim()) {
      return new Response(
        JSON.stringify({
          valid: false,
          error: "Respuesta OAuth vacía",
          debug: debugSteps,
        }),
        { status: 500, headers: corsHeaders },
      )
    }

    const tokenData = JSON.parse(tokenResponseText)
    const accessToken = tokenData.access_token
    debugSteps.push(`4. Token obtenido, length: ${accessToken?.length || 0}`)

    // PASO 5: Leer Google Sheets
    debugSteps.push("5. Leyendo Google Sheets...")
    const sheetsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${env.GOOGLE_SHEET_ID}/values/Licencias!A:Z`

    const sheetsResponse = await fetch(sheetsUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    debugSteps.push(`5. Sheets response status: ${sheetsResponse.status}`)

    if (!sheetsResponse.ok) {
      const errorText = await sheetsResponse.text()
      debugSteps.push(`5. Sheets error: ${errorText}`)
      return new Response(
        JSON.stringify({
          valid: false,
          error: `Error Google Sheets: ${sheetsResponse.status}`,
          debug: debugSteps,
        }),
        { status: 500, headers: corsHeaders },
      )
    }

    const sheetsResponseText = await sheetsResponse.text()
    debugSteps.push(`5. Sheets response length: ${sheetsResponseText.length}`)

    if (!sheetsResponseText.trim()) {
      return new Response(
        JSON.stringify({
          valid: false,
          error: "Respuesta Google Sheets vacía",
          debug: debugSteps,
        }),
        { status: 500, headers: corsHeaders },
      )
    }

    const sheetsData = JSON.parse(sheetsResponseText)
    const rows = sheetsData.values || []
    debugSteps.push(`5. Filas obtenidas: ${rows.length}`)

    if (rows.length === 0) {
      return new Response(
        JSON.stringify({
          valid: false,
          error: "No hay datos en la hoja",
          debug: debugSteps,
        }),
        { status: 404, headers: corsHeaders },
      )
    }

    // PASO 6: Buscar licencia
    debugSteps.push("6. Buscando licencia...")
    const headers = rows[0]
    debugSteps.push(`6. Headers: ${headers.join(", ")}`)

    const licenciaCol = headers.indexOf("licencia")
    const hashCol = headers.indexOf("hash_tienda")
    const statusCol = headers.indexOf("status")
    const fechaCol = headers.indexOf("última_verificación")

    debugSteps.push(`6. Columnas: licencia=${licenciaCol}, hash=${hashCol}, status=${statusCol}, fecha=${fechaCol}`)

    if (licenciaCol === -1) {
      return new Response(
        JSON.stringify({
          valid: false,
          error: 'No se encontró columna "licencia"',
          debug: debugSteps,
        }),
        { status: 500, headers: corsHeaders },
      )
    }

    // Buscar la licencia
    let licenseRow = null
    let rowIndex = -1

    for (let i = 1; i < rows.length; i++) {
      if (rows[i][licenciaCol] === licencia) {
        licenseRow = rows[i]
        rowIndex = i + 1 // +1 para Google Sheets (base 1)
        break
      }
    }

    debugSteps.push(`6. Licencia encontrada: ${!!licenseRow}, fila: ${rowIndex}`)

    if (!licenseRow) {
      return new Response(
        JSON.stringify({
          valid: false,
          error: "Licencia no encontrada",
          debug: debugSteps,
        }),
        { status: 404, headers: corsHeaders },
      )
    }

    // PASO 7: Procesar lógica de negocio
    debugSteps.push("7. Procesando lógica...")

    const currentStatus = licenseRow[statusCol] || ""
    const currentHash = licenseRow[hashCol] || ""

    debugSteps.push(`7. Estado actual: status=${currentStatus}, hash=${currentHash}`)

    // Aquí puedes continuar con tu lógica de negocio...
    // Por ahora solo retornamos éxito para ver si llegamos hasta aquí

    return new Response(
      JSON.stringify({
        valid: true,
        message: "Debug completado exitosamente",
        licenseInfo: {
          licencia,
          currentStatus,
          currentHash,
          rowIndex,
        },
        debug: debugSteps,
      }),
      { status: 200, headers: corsHeaders },
    )
  } catch (error) {
    debugSteps.push(`ERROR: ${error.message}`)
    return new Response(
      JSON.stringify({
        valid: false,
        error: error.message,
        debug: debugSteps,
        stack: error.stack,
      }),
      { status: 500, headers: corsHeaders },
    )
  }
}

// JWT simple sin librerías externas
async function createJWTSimple(env) {
  // Crear JWT manualmente para evitar problemas de imports
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

  // Usar Web Crypto API nativa de Cloudflare Workers
  const headerB64 = btoa(JSON.stringify(header)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")
  const payloadB64 = btoa(JSON.stringify(payload)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")

  const message = `${headerB64}.${payloadB64}`

  // Importar la clave privada
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
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
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

// Helper para convertir string a ArrayBuffer
function str2ab(str) {
  const buf = new ArrayBuffer(str.length)
  const bufView = new Uint8Array(buf)
  for (let i = 0, strLen = str.length; i < strLen; i++) {
    bufView[i] = str.charCodeAt(i)
  }
  return buf
}
