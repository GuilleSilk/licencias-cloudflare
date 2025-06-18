import { GoogleSpreadsheet } from "google-spreadsheet"
import { JWT } from "google-auth-library"

// Configuración de Google Sheets
const SHEET_ID = process.env.GOOGLE_SHEET_ID
const GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n")

// Función para añadir headers CORS
function addCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
  res.setHeader("Access-Control-Allow-Max-Age", "86400")
}

export default async function handler(req, res) {
  // Añadir headers CORS a todas las respuestas
  addCorsHeaders(res)

  // Manejar preflight request (OPTIONS)
  if (req.method === "OPTIONS") {
    return res.status(200).end()
  }

  // Solo permitir POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  try {
    const { licencia, hash_tienda, action } = req.body

    if (!licencia) {
      return res.status(400).json({ valid: false, error: "Falta el parámetro licencia" })
    }

    // Configurar autenticación con Google Sheets
    const serviceAccountAuth = new JWT({
      email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: GOOGLE_PRIVATE_KEY,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    })

    // Conectar a Google Sheets
    const doc = new GoogleSpreadsheet(SHEET_ID, serviceAccountAuth)
    await doc.loadInfo()

    const sheet = doc.sheetsByTitle["Licencias"]
    if (!sheet) {
      return res.status(500).json({ valid: false, error: "Hoja de licencias no encontrada" })
    }

    // Obtener todas las filas
    const rows = await sheet.getRows()

    // Buscar la licencia - SÚPER SIMPLE
    const licenseRow = rows.find((row) => row.get("licencia") === licencia)

    if (!licenseRow) {
      return res.status(404).json({ valid: false, error: "Licencia no encontrada" })
    }

    // Fecha actual YYYY-MM-DD
    const today = new Date().toISOString().split("T")[0]

    // Acción: clear libera la licencia
    if (action === 'clear') {
      licenseRow.set("hash_tienda", "")
      licenseRow.set("status", "inactiva")
      licenseRow.set("última_verificación", today)
      await licenseRow.save()
      return res.json({ valid: true, message: "Licencia liberada" })
    }

    // Validación por defecto
    if (!hash_tienda) {
      return res.status(400).json({ valid: false, error: "Falta el parámetro hash_tienda" })
    }

    const currentStatus = licenseRow.get("status")
    const currentHashTienda = licenseRow.get("hash_tienda")

    // Si la licencia ya está inválida
    if (currentStatus === "inválida") {
      return res.json({ valid: false, error: "Licencia inválida" })
    }

    // Si ya hay un hash y es diferente al actual (licencia en uso)
    if (currentHashTienda && currentHashTienda !== hash_tienda) {
      // Invalidar la licencia y devolver mensaje con HTML para showError
      licenseRow.set("status", "inválida")
      licenseRow.set("última_verificación", today)
      await licenseRow.save()
      return res
        .status(409)
        .json({ valid: false, error: "duplicada" })
    }

    // Actualizar la licencia con el hash actual
    licenseRow.set("hash_tienda", hash_tienda)
    licenseRow.set("status", "activa")
    licenseRow.set("última_verificación", today)
    await licenseRow.save()

    return res.json({ valid: true, message: "Licencia válida" })
  } catch (error) {
    console.error("Error validating license:", error)
    return res.status(500).json({ valid: false, error: "Error interno del servidor" })
  }
}
