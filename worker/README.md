# WhatsApp ERP Gateway Worker

This is the long-running Baileys process. The Next.js dashboard/API must not host Baileys itself because serverless request lifetimes are not suitable for a persistent WhatsApp Web session.

## Run locally

1. Copy `.env.example` to `.env`.
2. Set Supabase URL, service-role key, and a strong worker secret.
3. Run `npm install`.
4. Run `npm start`.
5. Open the dashboard and create a WhatsApp connection.
6. Click Generate QR and scan it from WhatsApp > Linked Devices.

The worker persists Baileys auth state under `AUTH_DIR/<connection-id>`. Back up this directory if you need to preserve sessions.

Baileys is an unofficial WhatsApp Web automation library. It is not the official WhatsApp Business Platform and may be disconnected or restricted by WhatsApp.
