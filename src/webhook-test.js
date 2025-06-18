// Función para generar licencia aleatoria
function generateLicenseKey() {
  const part1 = crypto.getRandomValues(new Uint8Array(2)).toString(16).toUpperCase();
  const part2 = crypto.getRandomValues(new Uint8Array(2)).toString(16).toUpperCase();
  const part3 = crypto.getRandomValues(new Uint8Array(2)).toString(16).toUpperCase();
  return `LIC-${part1}-${part2}-${part3}`;
}

// Función para generar licencias únicas
async function generateUniqueLicenses(count) {
  const licenses = [];
  const existingLicenses = new Set();

  for (let i = 0; i < count; i++) {
    let newLicense;
    do {
      newLicense = generateLicenseKey();
    } while (existingLicenses.has(newLicense) || licenses.includes(newLicense));

    licenses.push(newLicense);
    existingLicenses.add(newLicense);
  }
  return licenses;
}

// Función para enviar email con múltiples licencias usando Resend API
async function sendMultipleLicensesEmail(licenseData, RESEND_API_KEY, FROM_EMAIL) {
  const { licenses, customerEmail, customerName, orderNumber, orderTotal, currency } = licenseData;

  const licensesHtml = licenses
    .map(
      (license, index) => `
      <div class="license-box">
        <h3>Licencia ${index + 1}:</h3>
        <div class="license-code">${license}</div>
      </div>
    `
    )
    .join("");

  const emailHtml = `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Silkify - Licencias</title>
    <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&family=Poppins:wght@700&display=swap" rel="stylesheet">
    <style>
        body { font-family: 'Roboto', Arial, sans-serif; background-color: #f4f6f8; color: #333; margin: 0; padding: 0; }
        .wrapper { width: 100%; padding: 20px 0; }
        .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        .header { background-color: #ffffff; display: flex; align-items: center; padding: 30px; }
        .header img { max-width: 100px; margin-right: 15px; }
        .header h1 { margin: 0; font-family: 'Poppins', sans-serif; font-size: 32px; font-weight: 700; color: #000; }
        .greeting { padding: 0 30px 30px; }
        .greeting h2 { font-size: 20px; margin: 0 0 10px; text-align: center; }
        .greeting p { margin: 0; font-size: 16px; text-align: center; }
        .summary { padding: 20px; background-color: #ffffff; }
        .summary p { margin: 8px 0; font-size: 15px; }
        .licenses { padding: 20px; background-color: rgba(227, 242, 253, 0.4); border-radius: 8px; margin: 20px; box-shadow: inset 0 4px 6px rgba(0, 0, 0, 0.1), 0 4px 10px rgba(0, 0, 0, 0.06); }
        .licenses h2 { margin-top: 0; }
        .license-box { max-width: 80%; margin: 15px auto; padding: 15px; background-color: rgba(227, 242, 253, 0.8); border-radius: 12px; text-align: center; box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3); }
        .license-code { font-size: 18px; font-weight: 700; color: #0d47a1; letter-spacing: 2px; margin: 0; }
        .instructions { padding: 20px; background-color: #ffffff; }
        .instructions h3 { margin-top: 0; font-size: 18px; }
        .instructions ol, .instructions ul { margin: 10px 0 10px 20px; }
        .instructions li { margin: 6px 0; }
        .footer { text-align: center; padding: 15px 20px; font-size: 13px; color: #888; }
        .footer a { color: #1976d2; text-decoration: none; }
        .legal { text-align: center; font-size: 12px; color: #888; padding: 10px 20px; background-color: #ffffff; }
    </style>
</head>
<body>
    <div class="wrapper">
        <div class="container">
            <div class="header">
                <img src="https://cdn.shopify.com/s/files/1/0915/1784/5839/files/ChatGPT_Image_14_may_2025_14_02_34sinfondo.png?v=1747224314" alt="Logo Silkify">
                <h1>Silkify</h1>
            </div>
            <div class="greeting">
                <h2>¡Tus ${licenses.length} licencias de Silkify están listas!</h2>
                <p>Gracias por tu compra, ${customerName || 'Cliente'}</p>
            </div>
            <div class="summary">
                <p><strong>Pedido:</strong> #${orderNumber}</p>
                <p><strong>Licencias incluidas:</strong> ${licenses.length}</p>
            </div>
            <div class="licenses">
                <h2>📋 Tus códigos de licencia:</h2>
                ${licensesHtml}
            </div>
            <div class="instructions">
                <h3>📋 Instrucciones de activación:</h3>
                <ol>
                    <li>Ve al <strong>Editor de temas</strong> de tu tienda Shopify</li>
                    <li>Busca la sección <strong>"Licencia"</strong> en la configuración del tema</li>
                    <li>Pega <strong>UNA</strong> de las licencias de arriba</li>
                    <li>Guarda los cambios</li>
                    <li>¡Tu tema ya está activado! ✅</li>
                </ol>
                <p><strong>💡 Importante:</strong></p>
                <ul>
                    <li>Cada licencia es para <strong>una tienda diferente</strong></li>
                    <li>Solo usa <strong>una licencia por tienda</strong></li>
                    <li>Guarda las licencias restantes para futuras tiendas</li>
                    <li>Cada licencia solo puede estar activa en una tienda a la vez</li>
                </ul>
            </div>
            <div class="footer">
                <p>Este es un correo automático. Si tienes alguna duda, por favor ponte en contacto a través de nuestra web.</p>
                <p>Gracias por elegir Silkify<br><a href="https://www.silkifytheme.com">www.silkifytheme.com</a></p>
            </div>
            <div class="legal">
                <p>© 2025 Silkify. Todos los derechos reservados.</p>
            </div>
        </div>
    </div>
</body>
</html>
`;

  const resendUrl = "https://api.resend.com/emails";
  const response = await fetch(resendUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [customerEmail],
      subject: `Tus ${licenses.length} licencias de Silkify - Pedido #${orderNumber}`,
      html: emailHtml,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("Error enviando email:", error);
    return { success: false, error };
  }

  const data = await response.json();
  console.log("Email enviado exitosamente:", data);
  return { success: true, data };
}

// Función principal para manejar el webhook de Shopify o pruebas
export async function generateLicense(request) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };

  // Manejar preflight (OPTIONS)
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 200, headers });
  }

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
  }

  // Acceder a las variables de entorno dentro de la función
  const SHEET_ID = env.GOOGLE_SHEET_ID;
  const GOOGLE_API_KEY = env.GOOGLE_API_KEY;
  const RESEND_API_KEY = env.RESEND_API_KEY;
  const FROM_EMAIL = env.FROM_EMAIL || "licencias@tudominio.com";

  try {
    let body;
    // Detectar si es una prueba desde webhook-test (simulación)
    const isTest = request.headers.get("X-Test-Webhook") === "true";
    if (isTest) {
      body = {
        id: 12345,
        order_number: "TEST-001",
        total_price: "89.97",
        currency: "EUR",
        customer: {
          email: "elliugpaso@gmail.com",
          first_name: "Juan",
          last_name: "Pérez",
        },
        line_items: [
          {
            title: "Silkify Theme - 3 Licencias",
            sku: "SilkifyTheme",
            quantity: 1,
            price: "89.97",
          },
        ],
        billing_address: {
          company: "Mi Tienda Online",
        },
      };
    } else {
      body = await request.json();
    }

    const { id: order_id, order_number, customer, line_items, total_price, currency, billing_address } = body;

    console.log(`Procesando ${isTest ? "prueba" : "webhook de Shopify"} - Pedido: ${order_number} para ${customer?.email}`);

    let totalLicenses = 0;
    const themeItems = [];

    line_items?.forEach((item) => {
      const isSilkifyTheme = item.sku === "SilkifyTheme" || item.title?.includes("Silkify Theme");
      if (isSilkifyTheme) {
        let licensesForThisItem = item.quantity || 1;
        const titleMatch = item.title?.match(/(\d+)\s*(licencias?|licenses?)/i);
        if (titleMatch) {
          const licensesInTitle = Number.parseInt(titleMatch[1]);
          licensesForThisItem = licensesInTitle * item.quantity;
        }

        totalLicenses += licensesForThisItem;
        themeItems.push({ ...item, licensesCount: licensesForThisItem });
        console.log(`Producto Silkify detectado: ${item.title} - ${licensesForThisItem} licencias`);
      }
    });

    if (totalLicenses === 0) {
      console.log("Pedido no incluye productos Silkify Theme, ignorando");
      return new Response(JSON.stringify({ success: true, message: "No es compra de Silkify Theme" }), { status: 200, headers });
    }

    console.log(`Generando ${totalLicenses} licencias para el pedido ${order_number}`);

    const generatedLicenses = await generateUniqueLicenses(totalLicenses);
    const today = new Date().toISOString().split("T")[0];

    const googleSheetsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Licencias!A:Z:append?valueInputOption=USER_ENTERED&key=${GOOGLE_API_KEY}`;
    for (let i = 0; i < totalLicenses; i++) {
      const row = [
        order_number || order_id,
        customer?.email || "",
        `${customer?.first_name || ""} ${customer?.last_name || ""}`.trim(),
        generatedLicenses[i],
        "",
        `${i + 1}/${totalLicenses}`,
        "nueva",
        today,
        today,
        total_price || "",
        currency || "EUR",
      ];
      await fetch(googleSheetsUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values: [row] }),
      });
    }

    console.log(`${totalLicenses} licencias guardadas en Google Sheets:`, generatedLicenses);

    if (customer?.email && RESEND_API_KEY) {
      const emailResult = await sendMultipleLicensesEmail({
        licenses: generatedLicenses,
        customerEmail: customer.email,
        customerName: `${customer.first_name || ""} ${customer.last_name || ""}`.trim(),
        orderNumber: order_number || order_id,
        orderTotal: total_price || "0",
        currency: currency || "EUR",
      }, RESEND_API_KEY, FROM_EMAIL);

      if (!emailResult.success) {
        console.error(`Error enviando email a ${customer.email}:`, emailResult.error);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      licenses: generatedLicenses,
      total_licenses: totalLicenses,
      order_number: order_number || order_id,
      email_sent: !!customer?.email && !!RESEND_API_KEY,
      is_test: isTest,
    }), { status: 200, headers });
  } catch (error) {
    console.error("Error processing Shopify webhook or test:", error);
    return new Response(JSON.stringify({
      success: false,
      error: "Error procesando el webhook o prueba",
      details: error.message,
    }), { status: 500, headers });
  }
}
