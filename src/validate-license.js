import jwt from "jsonwebtoken";

// Función para añadir headers CORS
function getCorsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

// Generar token JWT para autenticación
async function getAccessToken(email, privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };
  const token = jwt.sign(payload, privateKey, { algorithm: "RS256" });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: token,
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Error obteniendo token: ${data.error_description || data.error}`);
  }
  return data.access_token;
}

// Función principal
export async function validateLicense(request, env) {
  const headers = getCorsHeaders();

  // Manejar preflight (OPTIONS)
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 200, headers });
  }

  // Acceder a las variables de entorno
  const SHEET_ID = env.GOOGLE_SHEET_ID;
  const GOOGLE_SERVICE_ACCOUNT_EMAIL = env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const GOOGLE_PRIVATE_KEY = env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
  }

  try {
    console.log("Parsing request body...");
    const body = await request.json();
    const { licencia, hash_tienda, action } = body;
    console.log("Request body:", { licencia, hash_tienda, action });

    if (!licencia) {
      return new Response(JSON.stringify({ valid: false, error: "Falta el parámetro licencia" }), { status: 400, headers });
    }

    // Verificar variables de entorno
    if (!SHEET_ID || !GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_PRIVATE_KEY) {
      throw new Error("Faltan variables de entorno: GOOGLE_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL o GOOGLE_PRIVATE_KEY");
    }

    // Obtener token de acceso
    const accessToken = await getAccessToken(GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY);
    console.log("Access token obtained");

    // Consulta a Google Sheets
    const googleSheetsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Licencias!A:Z`;
    console.log("Fetching Google Sheets URL:", googleSheetsUrl);
    const response = await fetch(googleSheetsUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Error en la solicitud a Google Sheets: ${response.status} ${response.statusText} - ${errorText}`);
    }
    const data = await response.json();
    console.log("Google Sheets data:", data);
    const rows = data.values || [];
    console.log("Rows from Google Sheets:", rows.length);

    if (rows.length === 0) {
      throw new Error("No se encontraron filas en la hoja Licencias");
    }

    // Obtener encabezados y mapear a índices
    const headers = rows[0];
    const licenciaIndex = headers.indexOf("licencia");
    const hashTiendaIndex = headers.indexOf("hash_tienda");
    const statusIndex = headers.indexOf("status");
    const ultimaVerificacionIndex = headers.indexOf("última_verificación");
    if (licenciaIndex === -1 || hashTiendaIndex === -1 || statusIndex === -1 || ultimaVerificacionIndex === -1) {
      throw new Error("Faltan columnas requeridas en la hoja: licencia, hash_tienda, status o última_verificación");
    }

    // Buscar la licencia
    const licenseRow = rows.slice(1).find((row) => row[licenciaIndex] && row[licenciaIndex].trim() === licencia.trim());
    console.log("Searching for licencia:", licencia, "Found row:", licenseRow);

    if (!licenseRow) {
      return new Response(JSON.stringify({ valid: false, error: "Licencia no encontrada" }), { status: 404, headers });
    }

    // Fecha actual YYYY-MM-DD
    const today = new Date().toISOString().split("T")[0];

    // Acción: clear libera la licencia
    if (action === "clear") {
      const rowIndex = rows.indexOf(licenseRow) + 1;
      const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Licencias!A${rowIndex}:Z${rowIndex}?valueInputOption=USER_ENTERED`;
      console.log("Updating Google Sheets with URL:", updateUrl);
      licenseRow[hashTiendaIndex] = "";
      licenseRow[statusIndex] = "inactiva";
      licenseRow[ultimaVerificacionIndex] = today;
      const updateResponse = await fetch(updateUrl, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ values: [licenseRow] }),
      });
      if (!updateResponse.ok) {
        const errorText = await updateResponse.text();
        throw new Error(`Error al actualizar Google Sheets: ${updateResponse.status} ${updateResponse.statusText} - ${errorText}`);
      }
      return new Response(JSON.stringify({ valid: true, message: "Licencia liberada" }), { status: 200, headers });
    }

    // Validación por defecto
    if (!hash_tienda) {
      return new Response(JSON.stringify({ valid: false, error: "Falta el parámetro hash_tienda" }), { status: 400, headers });
    }

    const currentStatus = licenseRow[statusIndex];
    const currentHashTienda = licenseRow[hashTiendaIndex];
    console.log("Current status and hash:", { currentStatus, currentHashTienda });

    // Si la licencia ya está inválida
    if (currentStatus === "inválida") {
      return new Response(JSON.stringify({ valid: false, error: "Licencia inválida" }), { status: 200, headers });
    }

    // Si ya hay un hash y es diferente al actual (licencia en uso)
    if (currentHashTienda && currentHashTienda !== hash_tienda) {
      const rowIndex = rows.indexOf(licenseRow) + 1;
      const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Licencias!A${rowIndex}:Z${rowIndex}?valueInputOption=USER_ENTERED`;
      console.log("Updating Google Sheets with URL:", updateUrl);
      licenseRow[statusIndex] = "inválida";
      licenseRow[ultimaVerificacionIndex] = today;
      const updateResponse = await fetch(updateUrl, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ values: [licenseRow] }),
      });
      if (!updateResponse.ok) {
        const errorText = await updateResponse.text();
        throw new Error(`Error al actualizar Google Sheets: ${updateResponse.status} ${updateResponse.statusText} - ${errorText}`);
      }
      return new Response(JSON.stringify({ valid: false, error: "duplicada" }), { status: 409, headers });
    }

    // Actualizar la licencia con el hash actual
    const rowIndex = rows.indexOf(licenseRow) + 1;
    const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Licencias!A${rowIndex}:Z${rowIndex}?valueInputOption=USER_ENTERED`;
    console.log("Updating Google Sheets with URL:", updateUrl);
    licenseRow[hashTiendaIndex] = hash_tienda;
    licenseRow[statusIndex] = "activa";
    licenseRow[ultimaVerificacionIndex] = today;
    const updateResponse = await fetch(updateUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values: [licenseRow] }),
    });
    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      throw new Error(`Error al actualizar Google Sheets: ${updateResponse.status} ${updateResponse.statusText} - ${errorText}`);
    }
    return new Response(JSON.stringify({ valid: true, message: "Licencia válida" }), { status: 200, headers });
  } catch (error) {
    console.error("Error validating license:", error.message, error.stack);
    return new Response(JSON.stringify({ valid: false, error: `Error interno del servidor: ${error.message}` }), { status: 500, headers });
  }
}
