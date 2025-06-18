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
    const response = await fetch(`https://licencias-cloudflare.storesilkify.workers.dev/generate-license`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Test-Webhook": "true", // Indica que es una prueba
      },
      body: JSON.stringify(testWebhookData),
    });

    const result = await response.json();

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
