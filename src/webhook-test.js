// Definición de la función getCorsHeaders que faltaba
function getCorsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Test-Webhook",
    "Access-Control-Max-Age": "86400",
  };
}

export async function webhookTest(request) {
  console.log("Request received:", request.url);
  const headers = getCorsHeaders();

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 200, headers });
  }

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
  }

  const testWebhookData = {
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

  try {
    console.log("Enviando datos:", JSON.stringify(testWebhookData));
    const response = await fetch(`https://licencias-cloudflare.storesilkify.workers.dev/generate-license`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Test-Webhook": "true", // Indica que es una prueba
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
      },
      body: JSON.stringify(testWebhookData),
    });

    console.log("Respuesta recibida:", response.status);
    const result = await response.json();
    console.log("Resultado:", JSON.stringify(result));

    return new Response(JSON.stringify({
      success: true,
      message: "Webhook de prueba ejecutado",
      result,
    }), { status: 200, headers });
  } catch (error) {
    console.error("Error en webhook test:", error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
    }), { status: 500, headers });
  }
}
