// Definición de la función getCorsHeaders que faltaba
function getCorsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Test-Webhook",
    "Access-Control-Max-Age": "86400",
  };
}

export async function webhookTest(request, env) {
  const headers = getCorsHeaders();
  
  // Respuesta a preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 200, headers });
  }

  // Solo POST permitidos
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers
    });
  }

  // Datos de prueba
  const testWebhookData = {
    id: 12345,
    order_number: "TEST-001",
    total_price: "89.97",
    currency: "EUR",
    customer: {
      email: "elliugpaso@gmail.com",
      first_name: "Juan",
      last_name: "Pérez"
    },
    line_items: [
      {
        title: "Silkify Theme - 3 Licencias",
        sku: "SilkifyTheme",
        quantity: 1,
        price: "89.97"
      }
    ],
    billing_address: {
      company: "Mi Tienda Online"
    }
  };

  try {
    // Llamada al servicio interno usando Service Binding
 const resp = await env.LIC_SERVICE.fetch("/generate-license", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Test-Webhook": "true"
      },
      body: JSON.stringify(testWebhookData)
    });


    // Manejo de errores HTTP antes de parsear JSON
    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`HTTP ${resp.status} - ${errText}`);
    }

    const result = await resp.json();
    return new Response(
      JSON.stringify({ success: true, message: "Webhook ejecutado", result }),
      { status: 200, headers }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers }
    );
  }
}
