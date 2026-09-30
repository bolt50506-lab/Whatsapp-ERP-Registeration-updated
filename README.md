# WhatsApp ERP Notification Gateway

A multi-tenant gateway that lets any ERP send registration messages, invoices, appointments, payments and ready reports through a real WhatsApp Web session.

## Architecture

ERP -> authenticated API -> Supabase queue -> long-running Baileys worker -> WhatsApp

The Next.js app is the dashboard/API. The worker is deliberately separate because WhatsApp Web sessions require a persistent process and persistent authentication files.

## Features

- Real QR pairing with Baileys (no fake QR/connected state)
- Persistent WhatsApp sessions per connection
- Multiple organizations and connections
- ERP integrations with hashed API keys
- Idempotent outbound queue with retry handling
- Text and PDF/document delivery
- Registration/invoice/report-ready event endpoints
- Expiring secure report links
- Message, connection and webhook logs
- Templates with dynamic variables
- Tenant-scoped Supabase RLS
- Docker support for the worker

## Required environment variables

Next.js:
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY
- WORKER_URL
- WORKER_SECRET
- NEXT_PUBLIC_APP_URL

Worker:
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- WORKER_SECRET
- PORT (default 3001)
- AUTH_DIR (default ./data/whatsapp-auth)

Never expose SUPABASE_SERVICE_ROLE_KEY or WORKER_SECRET to the browser. Do not use NEXT_PUBLIC_WORKER_SECRET.

## Database

Run the migrations in supabase/migrations against the gateway's own Supabase project. The queue worker requires the claim_message_queue(integer) RPC from the queue migration.

## WhatsApp setup

1. Create an organization/account in the dashboard.
2. Create a WhatsApp connection.
3. Start the worker.
4. Click Generate QR.
5. Scan it from WhatsApp -> Settings -> Linked Devices -> Link a Device.
6. Wait for the dashboard to show Connected.
7. Create an ERP Integration and copy the API key once.
8. Configure the ERP to call the event endpoints.

## API endpoints

All ERP endpoints use Authorization: Bearer <API_KEY>.

- POST /api/v1/events/patient-registered
- POST /api/v1/events/invoice-created
- POST /api/v1/events/report-ready
- POST /api/v1/documents
- POST /api/v1/messages
- GET /api/v1/health
- GET /api/v1/whatsapp/status
- GET /api/v1/whatsapp/qr

Use an idempotency_key on ERP retries so the same event is not queued twice.

### Patient registration payload

{
  "recipient": "03001234567",
  "customer_name": "Ali Ahmed",
  "patient_name": "Ali Ahmed",
  "patient_id": "PAT-10025",
  "invoice_number": "INV-10025",
  "invoice_amount": "1500",
  "invoice_date": "2026-09-22",
  "invoice_pdf_url": "https://erp.example/invoices/10025.pdf",
  "idempotency_key": "registration-PAT-10025"
}

### Report-ready payload

{
  "recipient": "03001234567",
  "patient_name": "Ali Ahmed",
  "patient_id": "PAT-10025",
  "report_number": "LAB-2026-00125",
  "report_type": "laboratory",
  "report_url": "https://erp.example/reports/125.pdf",
  "report_pdf_url": "https://erp.example/reports/125.pdf",
  "idempotency_key": "report-LAB-2026-00125"
}

For radiology use report_type: radiology.

## Important

Baileys is an unofficial WhatsApp Web automation library. It is not the official WhatsApp Business Platform and can be logged out or restricted. Keep the worker persistent and monitor connection logs.


## WasenderAPI integration

The gateway can use WasenderAPI instead of running the Baileys WhatsApp session itself.

1. Create/connect a WhatsApp session in WasenderAPI and obtain the session API key.
2. In **Dashboard -> WhatsApp Connection -> New Connection**, choose **WasenderAPI**.
3. Enter the Wasender session ID, session API key and a webhook secret.
4. The dashboard will show the HTTPS webhook URL for that connection. Add that URL in the WasenderAPI session webhook settings and subscribe to session-status and message-status/receipt events.
5. Use the **Connect WhatsApp** button in the ERP dashboard to start the QR flow.
6. The existing ERP event APIs continue to queue registration, invoice and report-ready messages. The worker sends WasenderAPI jobs through the same queue/retry system.

WasenderAPI is an external WhatsApp Web/linked-device service. It does not require the local Baileys WhatsApp socket for a Wasender connection, but the existing worker still processes the ERP outbound queue. WasenderAPI supports text and document messages, which covers the current registration/invoice/report workflow.
