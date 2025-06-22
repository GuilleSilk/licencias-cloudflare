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
  const GOOGLE_API_KEY = env.GOOGLE_API_KEY;

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
  }

  try {
    const body = await request.json();
    const { licencia, hash_tienda, action } = body;

    if (!licencia) {
      return new Response(JSON.stringify({ valid: false, error: "Falta el parámetro licencia" }), { status: 400, headers });
    }

    // Verificar que las variables de entorno estén definidas
    if (!SHEET_ID || !GOOGLE_API_KEY) {
      throw new Error("Faltan variables de entorno: GOOGLE_SHEET_ID o GOOGLE_API_KEY");
    }

    // Simulación de consulta a Google Sheets con API REST
    const googleSheetsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Licencias!A:Z?key=${GOOGLE_API_KEY}`;
    const response = await fetch(googleSheetsUrl);
    if (!response.ok) {
      throw new Error(`Error en la solicitud a Google Sheets: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    const rows = data.values || [];

    // Buscar la licencia
    const licenseRow = rows.find(row => row[3] === licencia); // Asume que "licencia" está en la columna D (índice 3)

    if (!licenseRow) {
      return new Response(JSON.stringify({ valid: false, error: "Licencia no encontrada" }), { status: 404, headers });
    }

    const [order_number, customer_email, customer_name, licencia_value, hash_tienda_value, license_number, status, ultima_verificacion, fecha_creacion, order_total, currency] = licenseRow;

    // Fecha actual YYYY-MM-DD
    const today = new Date().toISOString().split("T")[0];

    // Acción: clear libera la licencia
    if (action === 'clear') {
      const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Licencias!A${rows.indexOf(licenseRow) + 2}:Z${rows.indexOf(licenseRow) + 2}?valueInputOption=USER_ENTERED&key=${GOOGLE_API_KEY}`;
      const updateResponse = await fetch(updateUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          values: [[order_number, customer_email, customer_name, licencia_value, "", license_number, "inactiva", today, fecha_creacion, order_total, currency]],
        }),
      });
      if (!updateResponse.ok) {
        throw new Error(`Error al actualizar Google Sheets: ${updateResponse.status} ${updateResponse.statusText}`);
      }
      return new Response(JSON.stringify({ valid: true, message: "Licencia liberada" }), { status: 200, headers });
    }

    // Validación por defecto
    if (!hash_tienda) {
      return new Response(JSON.stringify({ valid: false, error: "Falta el parámetro hash_tienda" }), { status: 400, headers });
    }

    const currentStatus = status;
    const currentHashTienda = hash_tienda_value;

    // Si la licencia ya está inválida
    if (currentStatus === "inválida") {
      return new Response(JSON.stringify({ valid: false, error: "Licencia inválida" }), { status: 200, headers });
    }

    // Si ya hay un hash y es diferente al actual (licencia en uso)
    if (currentHashTienda && currentHashTienda !== hash_tienda) {
      const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Licencias!A${rows.indexOf(licenseRow) + 2}:Z${rows.indexOf(licenseRow) + 2}?valueInputOption=USER_ENTERED&key=${GOOGLE_API_KEY}`;
      const updateResponse = await fetch(updateUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          values: [[order_number, customer_email, customer_name, licencia_value, currentHashTienda, license_number, "inválida", today, fecha_creacion, order_total, currency]],
        }),
      });
      if (!updateResponse.ok) {
        throw new Error(`Error al actualizar Google Sheets: ${updateResponse.status} ${updateResponse.statusText}`);
      }
      return new Response(JSON.stringify({ valid: false, error: "duplicada" }), { status: 409, headers });
    }

    // Actualizar la licencia con el hash actual
    const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Licencias!A${rows.indexOf(licenseRow) + 2}:Z${rows.indexOf(licenseRow) + 2}?valueInputOption=USER_ENTERED&key=${GOOGLE_API_KEY}`;
    const updateResponse = await fetch(updateUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        values: [[order_number, customer_email, customer_name, licencia_value, hash_tienda, license_number, "activa", today, fecha_creacion, order_total, currency]],
      }),
    });
    if (!updateResponse.ok) {
      throw new Error(`Error al actualizar Google Sheets: ${updateResponse.status} ${updateResponse.statusText}`);
    }

    return new Response(JSON.stringify({ valid: true, message: "Licencia válida" }), { status: 200, headers });
  } catch (error) {
    console.error("Error validating license:", error.message, error.stack);
    return new Response(JSON.stringify({ valid: false, error: `Error interno del servidor: ${error.message}` }), { status: 500, headers });
  }
}
