import { GoogleSpreadsheet } from "google-spreadsheet";
import { JWT } from "google-auth-library";

// Función para añadir headers CORS
function getCorsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
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
    console.log("Environment variables:", {
      SHEET_ID,
      GOOGLE_SERVICE_ACCOUNT_EMAIL,
      GOOGLE_PRIVATE_KEY: GOOGLE_PRIVATE_KEY ? "Defined" : "Undefined",
    });

    // Configurar autenticación con Google Sheets
    const serviceAccountAuth = new JWT({
      email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: GOOGLE_PRIVATE_KEY,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    // Conectar a Google Sheets
    const doc = new GoogleSpreadsheet(SHEET_ID, serviceAccountAuth);
    await doc.loadInfo();
    console.log("Google Spreadsheet loaded:", doc.title);

    const sheet = doc.sheetsByTitle["Licencias"];
    if (!sheet) {
      throw new Error("Hoja de licencias no encontrada");
    }
    console.log("Sheet found:", sheet.title);

    // Obtener todas las filas
    const rows = await sheet.getRows();
    console.log("Rows from Google Sheets:", rows.length);

    // Buscar la licencia
    const licenseRow = rows.find((row) => row.get("licencia") === licencia);
    console.log("Searching for licencia:", licencia, "Found row:", licenseRow ? licenseRow.get("licencia") : "Not found");

    if (!licenseRow) {
      return new Response(JSON.stringify({ valid: false, error: "Licencia no encontrada" }), { status: 404, headers });
    }

    // Fecha actual YYYY-MM-DD
    const today = new Date().toISOString().split("T")[0];

    // Acción: clear libera la licencia
    if (action === "clear") {
      licenseRow.set("hash_tienda", "");
      licenseRow.set("status", "inactiva");
      licenseRow.set("última_verificación", today);
      await licenseRow.save();
      return new Response(JSON.stringify({ valid: true, message: "Licencia liberada" }), { status: 200, headers });
    }

    // Validación por defecto
    if (!hash_tienda) {
      return new Response(JSON.stringify({ valid: false, error: "Falta el parámetro hash_tienda" }), { status: 400, headers });
    }

    const currentStatus = licenseRow.get("status");
    const currentHashTienda = licenseRow.get("hash_tienda");
    console.log("Current status and hash:", { currentStatus, currentHashTienda });

    // Si la licencia ya está inválida
    if (currentStatus === "inválida") {
      return new Response(JSON.stringify({ valid: false, error: "Licencia inválida" }), { status: 200, headers });
    }

    // Si ya hay un hash y es diferente al actual (licencia en use)
    if (currentHashTienda && currentHashTienda !== hash_tienda) {
      licenseRow.set("status", "inválida");
      licenseRow.set("última_verificación", today);
      await licenseRow.save();
      return new Response(JSON.stringify({ valid: false, error: "duplicada" }), { status: 409, headers });
    }

    // Actualizar la licencia con el hash actual
    licenseRow.set("hash_tienda", hash_tienda);
    licenseRow.set("status", "activa");
    licenseRow.set("última_verificación", today);
    await licenseRow.save();

    return new Response(JSON.stringify({ valid: true, message: "Licencia válida" }), { status: 200, headers });
  } catch (error) {
    console.error("Error validating license:", error.message, error.stack);
    return new Response(JSON.stringify({ valid: false, error: `Error interno del servidor: ${error.message}` }), { status: 500, headers });
  }
}
