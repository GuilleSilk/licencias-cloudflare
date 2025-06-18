# Sistema de Licencias para Silkify Theme

Sistema completo para gestionar licencias de temas Shopify, con validación en tiempo real, protección contra uso no autorizado y generación automática de licencias.

## 🚀 Características

- ✅ **Validación de licencias** en tiempo real
- ✅ **Generación automática** de licencias con webhook de Shopify
- ✅ **Envío de emails** con licencias al cliente
- ✅ **Protección contra piratería** con múltiples capas
- ✅ **Soporte para múltiples licencias** por compra
- ✅ **Almacenamiento** en Google Sheets
- ✅ **Detección específica** de productos Silkify

## 📋 Requisitos

- Cuenta en [Vercel](https://vercel.com)
- Cuenta en [Google Cloud](https://console.cloud.google.com)
- Cuenta en [Resend](https://resend.com) para emails
- Tienda Shopify con acceso a edición de temas

## 🔧 Configuración

### 1. Google Sheets

1. Crear proyecto en [Google Cloud Console](https://console.cloud.google.com)
2. Habilitar Google Sheets API
3. Crear Service Account con rol Editor
4. Descargar archivo JSON de credenciales
5. Crear hoja de cálculo y compartirla con el Service Account

### 2. Vercel

1. Importar este repositorio
2. Configurar variables de entorno:
   - `GOOGLE_SHEET_ID`: ID de tu hoja de Google Sheets
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL`: Email del Service Account
   - `GOOGLE_PRIVATE_KEY`: Clave privada del Service Account
   - `RESEND_API_KEY`: API Key de Resend
   - `FROM_EMAIL`: Email de remitente
   - `SHOPIFY_WEBHOOK_SECRET`: (Opcional) Secret del webhook

3. Desplegar el proyecto
4. Ejecutar script de setup: `scripts/setup-google-sheets-simple.js`

### 3. Shopify

1. Subir archivos al tema:
   - `assets/license-check.js.liquid`
   - `snippets/license-protection.liquid`
   - `snippets/theme-utilities.liquid`
   - `snippets/product-data-manager.liquid`
   - `snippets/analytics-helper.liquid`
   - `snippets/performance-monitor.liquid`
   - `snippets/seo-optimizer.liquid`

2. Modificar `theme.liquid` para incluir los scripts
3. Configurar webhook en Shopify Admin > Configuración > Notificaciones

## 📁 Estructura del Proyecto

\`\`\`
├── api/
│   ├── generate-license.js    # Genera licencias automáticamente
│   ├── validate-license.js    # Valida licencias existentes
│   └── webhook-test.js        # Endpoint para pruebas
├── scripts/
│   └── setup-google-sheets-simple.js  # Configura Google Sheets
├── package.json               # Dependencias
└── vercel.json                # Configuración de Vercel
\`\`\`

## 🔄 Flujo de Trabajo

1. **Compra**: Cliente compra el tema en Shopify
2. **Webhook**: Se activa el webhook que llama a `generate-license.js`
3. **Generación**: Se generan licencias únicas
4. **Almacenamiento**: Se guardan en Google Sheets
5. **Email**: Se envía email al cliente con las licencias
6. **Activación**: Cliente activa el tema con una licencia
7. **Validación**: El tema valida la licencia contra la API

## 📊 Estructura de Google Sheets

La hoja "Licencias" contiene:
- `order_number`: Número de pedido
- `customer_email`: Email del cliente
- `customer_name`: Nombre del cliente
- `licencia`: Código único de licencia
- `hash_tienda`: Identificador único de la tienda
- `license_number`: Número de licencia (ej: "2/3")
- `status`: Estado (activa/inválida)
- `última_verificación`: Fecha de última validación
- `fecha_creacion`: Fecha de creación
- `order_total`: Total del pedido
- `currency`: Moneda

## 🛠️ Tecnologías Utilizadas

- **Backend**: Node.js en Vercel Serverless Functions
- **Base de datos**: Google Sheets API
- **Emails**: Resend API
- **Frontend**: JavaScript, Liquid (Shopify)
- **Integración**: Shopify Webhooks

## 📝 Licencia

Este proyecto es privado y para uso exclusivo de Silkify.

## 🆘 Soporte

Para soporte, contacta a [tu-email@ejemplo.com](mailto:tu-email@ejemplo.com)
