// Función para normalizar hashes de tienda
function normalizeHash(hash) {
  if (!hash) return hash
  if (hash.includes(".myshopify.com")) {
    const shopName = hash.split(".myshopify.com")[0].split(".").pop()
    return shopName + ".myshopify.com"
  }
  return hash.replace(/^https?:\/\//, "").split(":")[0]
}

// Verificar referer
function isFromShopify(request) {
  const referer = request.headers.get("Referer") || ""
  const origin = request.headers.get("Origin") || ""

  console.log("🔍 Referer:", referer)
  console.log("🔍 Origin:", origin)

  return (
    referer.includes(".myshopify.com") ||
    referer.includes("shopify.com") ||
    referer.includes("localhost") || // Para testing
    referer.includes("127.0.0.1")
  ) // Para testing local
}

// Validación rápida de licencia
async function validateLicenseQuick(licencia, hash_tienda, env) {
  try {
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
      return { valid: false, error: "No hay datos en la hoja" }
    }

    const headers = rows[0]
    const licenciaCol = headers.indexOf("licencia")
    const hashCol = headers.indexOf("hash_tienda")
    const statusCol = headers.indexOf("status")

    if (licenciaCol === -1) {
      return { valid: false, error: "Columna licencia no encontrada" }
    }

    let licenseRow = null
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][licenciaCol] === licencia) {
        licenseRow = rows[i]
        break
      }
    }

    if (!licenseRow) {
      return { valid: false, error: "Licencia no encontrada" }
    }

    const currentStatus = licenseRow[statusCol] || ""
    const currentHash = licenseRow[hashCol] || ""

    if (currentStatus === "inválida") {
      return { valid: false, error: "Licencia inválida" }
    }

    if (currentStatus === "inactiva") {
      return { valid: false, error: "Licencia inactiva" }
    }

    const normalizedHashTienda = normalizeHash(hash_tienda)
    const normalizedCurrentHash = normalizeHash(currentHash)

    if (normalizedCurrentHash && normalizedCurrentHash !== normalizedHashTienda) {
      return { valid: false, error: "Licencia en uso por otra tienda" }
    }

    return { valid: true }
  } catch (error) {
    console.error("Error validando licencia:", error)
    return { valid: false, error: "Error interno" }
  }
}

// PUNTO DE ENTRADA PRINCIPAL
export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const method = request.method

    console.log("📍 Method:", method)
    console.log("📍 Path:", url.pathname)
    console.log("📍 Search:", url.search)

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Referer, Origin",
    }

    if (method === "OPTIONS") {
      return new Response(null, { status: 200, headers: corsHeaders })
    }

    // NUEVA FUNCIONALIDAD: Servir CSS protegido
    if (method === "GET" && url.pathname === "/css") {
      const fileName = url.searchParams.get("file")
      const licencia = url.searchParams.get("license")
      const hash_tienda = url.searchParams.get("hash")

      console.log("📁 File:", fileName)
      console.log("🔑 License:", licencia)
      console.log("🏪 Hash:", hash_tienda)

      // 1. Verificar parámetros básicos
      if (!fileName) {
        return new Response("Missing file parameter", {
          status: 400,
          headers: corsHeaders,
        })
      }

      // 2. Verificar referer
      if (!isFromShopify(request)) {
        console.log("❌ Referer inválido")
        return new Response("Access denied - Invalid referer", {
          status: 403,
          headers: corsHeaders,
        })
      }

      // 3. Validar licencia (solo si se proporcionan parámetros)
      if (licencia && hash_tienda) {
        const validation = await validateLicenseQuick(licencia, hash_tienda, env)
        if (!validation.valid) {
          console.log("❌ Licencia inválida:", validation.error)
          return new Response(`License validation failed: ${validation.error}`, {
            status: 403,
            headers: corsHeaders,
          })
        }
        console.log("✅ Licencia válida")
      }

      // 4. Fetch CSS desde tu CDN
      const cdnUrl = `https://web-toolkit.pages.dev/css/${fileName}`
      console.log("🌐 Fetching:", cdnUrl)

      try {
        const cdnResponse = await fetch(cdnUrl)

        if (!cdnResponse.ok) {
          console.log("❌ CDN error:", cdnResponse.status)
          return new Response(`CDN file not found: ${cdnResponse.status}`, {
            status: 404,
            headers: corsHeaders,
          })
        }

        const cssContent = await cdnResponse.text()
        console.log("✅ CSS fetched successfully, length:", cssContent.length)

        return new Response(cssContent, {
          headers: {
            "Content-Type": "text/css",
            "Cache-Control": "public, max-age=1800",
            ...corsHeaders,
          },
        })
      } catch (error) {
        console.error("❌ Fetch error:", error)
        return new Response(`Fetch error: ${error.message}`, {
          status: 500,
          headers: corsHeaders,
        })
      }
    }

    // FUNCIONALIDAD EXISTENTE: Validación POST (mantener igual)
    if (method === "POST") {
      return validateLicense(request, env)
    }

    // Para debugging - mostrar qué se recibió
    return new Response(`Method: ${method}, Path: ${url.pathname}, Search: ${url.search}`, {
      status: 404,
      headers: corsHeaders,
    })
  },
}


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

    // 5. NORMALIZAR HASHES ANTES DE COMPARAR
    const normalizedHashTienda = normalizeHash(hash_tienda)
    const normalizedCurrentHash = normalizeHash(currentHash)

    console.log("🔧 Hash enviado original:", hash_tienda)
    console.log("🔧 Hash enviado normalizado:", normalizedHashTienda)
    console.log("🔧 Hash actual original:", currentHash)
    console.log("🔧 Hash actual normalizado:", normalizedCurrentHash)

    // 6. LÓGICA DE VALIDACIÓN CON HASHES NORMALIZADOS

    // Acción: clear (liberar licencia SOLO si el hash coincide)
    if (action === "clear") {
      // NUEVO: Solo limpiar si el hash actual coincide con el de la tienda que hace clear
      if (normalizedCurrentHash && normalizedCurrentHash !== normalizedHashTienda) {
        return new Response(
          JSON.stringify({
            valid: false,
            message: "No puedes liberar esta licencia desde esta tienda",
            error: "Esta licencia pertenece a otra tienda",
            debug: {
              currentHash: normalizedCurrentHash,
              requestHash: normalizedHashTienda,
            },
          }),
          { status: 403, headers: corsHeaders },
        )
      }

      // Solo limpiar si no hay hash (libre) o si el hash coincide
      await updateLicenseRow(env.GOOGLE_SHEET_ID, accessToken, rowIndex, headers, {
        hash_tienda: "", // Borrar hash para liberar
        status: "activa", // MANTENER ACTIVA para que otra tienda pueda usarla
        última_verificación: today,
      })

      return new Response(
        JSON.stringify({
          valid: true,
          message: "Licencia liberada y disponible para otra tienda",
          status: "activa",
        }),
        { status: 200, headers: corsHeaders },
      )
    }

    // Validación normal - necesita hash_tienda
    if (!hash_tienda) {
      return new Response(JSON.stringify({ valid: false, error: "Falta parámetro hash_tienda" }), {
        status: 400,
        headers: corsHeaders,
      })
    }

    // Si la licencia está marcada como inválida (permanentemente)
    if (currentStatus === "inválida") {
      return new Response(
        JSON.stringify({
          valid: false,
          error: "Licencia inválida permanentemente",
          status: "inválida",
        }),
        { status: 200, headers: corsHeaders },
      )
    }

    // Si la licencia está inactiva (temporalmente deshabilitada)
    if (currentStatus === "inactiva") {
      return new Response(
        JSON.stringify({
          valid: false,
          error: "Licencia temporalmente inactiva",
          status: "inactiva",
        }),
        { status: 200, headers: corsHeaders },
      )
    }

    // DETECCIÓN DE DUPLICADO MEJORADA
    if (normalizedCurrentHash && normalizedCurrentHash !== normalizedHashTienda) {
      console.log("🚨 DUPLICADO DETECTADO:", {
        currentHash: normalizedCurrentHash,
        requestHash: normalizedHashTienda,
      })

      // Marcar como inactiva
      await updateLicenseRow(env.GOOGLE_SHEET_ID, accessToken, rowIndex, headers, {
        status: "inactiva",
        última_verificación: today,
        // NO cambiar el hash existente para mantener registro
      })

      return new Response(
        JSON.stringify({
          valid: false,
          error: "duplicada", // IMPORTANTE: Este es el error que busca tu cliente
          status: "inactiva",
          message: "Esta licencia está siendo usada en otra tienda y ha sido desactivada",
          debug: {
            currentHashNormalized: normalizedCurrentHash,
            sentHashNormalized: normalizedHashTienda,
            reason: "Hash mismatch - license in use by another store",
          },
        }),
        { status: 409, headers: corsHeaders }, // Status 409 = Conflict
      )
    }

    // Si no tiene hash (libre) o tiene el mismo hash normalizado, activar/mantener activa
    await updateLicenseRow(env.GOOGLE_SHEET_ID, accessToken, rowIndex, headers, {
      hash_tienda: normalizedHashTienda, // Guardar el hash normalizado
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
          hash_tienda: normalizedHashTienda,
          ultima_verificacion: today,
        },
        debug: {
          originalHash: hash_tienda,
          normalizedHash: normalizedHashTienda,
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

// Resto de funciones auxiliares...
async function updateLicenseRow(sheetId, accessToken, rowIndex, headers, updates) {
  const readUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Licencias!A${rowIndex}:Z${rowIndex}`
  const readResponse = await fetch(readUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!readResponse.ok) {
    throw new Error(`Error leyendo fila: ${readResponse.status}`)
  }

  const readData = await readResponse.json()
  const currentRow = readData.values?.[0] || []
  const newRow = [...currentRow]

  Object.keys(updates).forEach((key) => {
    const colIndex = headers.indexOf(key)
    if (colIndex !== -1) {
      while (newRow.length <= colIndex) {
        newRow.push("")
      }
      newRow[colIndex] = updates[key]
    }
  })

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
