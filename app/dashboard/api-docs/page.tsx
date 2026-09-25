'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Code2, Copy, Check, Terminal, Webhook, FileText, Key, AlertCircle } from 'lucide-react';

function CodeBlock({ code, language = 'json' }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative group">
      <pre className="rounded-lg bg-slate-900 dark:bg-slate-950 text-slate-100 p-4 text-xs overflow-x-auto scrollbar-thin">
        <code>{code}</code>
      </pre>
      <Button
        size="icon"
        variant="ghost"
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7 text-slate-400 hover:text-slate-100"
        onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      >
        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      </Button>
    </div>
  );
}

function Section({ title, description, children, icon: Icon }: { title: string; description?: string; children: React.ReactNode; icon: any }) {
  return (
    <Card className="border-border/40">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Icon className="w-4 h-4 text-emerald-500" />
          {title}
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}

export default function ApiDocsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">API Documentation</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Complete reference for integrating any ERP with the WhatsApp ERP Gateway.
        </p>
      </div>

      <Section title="Base URL" icon={Terminal}>
        <p className="text-sm text-muted-foreground">
          All API endpoints are relative to your gateway base URL. In production, this is your deployed domain.
        </p>
        <CodeBlock code={`https://your-gateway-domain.com/api/v1`} />
      </Section>

      <Section title="Authentication" icon={Key} description="All API requests require a Bearer API key.">
        <p className="text-sm">Create an API key from the Integrations page. Include it in every request:</p>
        <CodeBlock code={`Authorization: Bearer weg_your_api_key_here`} />
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-400">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>API keys are shown only once when created. Store them securely. Only a hash is kept in the database.</span>
        </div>
      </Section>

      <Section title="Send Message" icon={Code2} description="POST /api/v1/messages — Generic endpoint for all events.">
        <p className="text-sm font-medium">Request:</p>
        <CodeBlock code={`POST /api/v1/messages
Authorization: Bearer weg_your_api_key
Content-Type: application/json

{
  "event": "patient_registered",
  "recipient": "+923001234567",
  "customer_name": "Ali Ahmed",
  "patient_id": "PAT-10025",
  "invoice_pdf_url": "https://erp.example.com/invoices/123.pdf",
  "idempotency_key": "PAT-10025-REGISTER"
}`} />
        <p className="text-sm font-medium mt-3">Response (200):</p>
        <CodeBlock code={`{
  "success": true,
  "message_id": "uuid-here",
  "status": "queued"
}`} />
      </Section>

      <Section title="Event-Specific Endpoints" icon={Webhook}>
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2"><Badge variant="outline">POST</Badge><code className="text-xs">/api/v1/events/patient-registered</code></div>
          <div className="flex items-center gap-2"><Badge variant="outline">POST</Badge><code className="text-xs">/api/v1/events/invoice-created</code></div>
          <div className="flex items-center gap-2"><Badge variant="outline">POST</Badge><code className="text-xs">/api/v1/events/report-ready</code></div>
          <div className="flex items-center gap-2"><Badge variant="outline">POST</Badge><code className="text-xs">/api/v1/events/custom</code></div>
        </div>
        <p className="text-xs text-muted-foreground">These accept the same body as /messages but with the event pre-set.</p>
      </Section>

      <Section title="Report Ready (Lab/Radiology)" icon={FileText} description="Distinguish laboratory and radiology reports.">
        <p className="text-sm font-medium">Laboratory Report:</p>
        <CodeBlock code={`{
  "event": "report_ready",
  "report_type": "laboratory",
  "recipient": "+923001234567",
  "patient_name": "Ali Ahmed",
  "patient_id": "PAT-10025",
  "report_number": "LAB-2026-00125",
  "report_pdf_url": "https://erp.example.com/reports/125.pdf",
  "secure_link": "https://gateway.example.com/r/tk123abc"
}`} />
        <p className="text-sm font-medium mt-3">Radiology Report:</p>
        <CodeBlock code={`{
  "event": "report_ready",
  "report_type": "radiology",
  "recipient": "+923001234567",
  "patient_name": "Ali Ahmed",
  "patient_id": "PAT-10025",
  "report_number": "RAD-2026-00126",
  "report_pdf_url": "https://erp.example.com/reports/126.pdf",
  "secure_link": "https://gateway.example.com/r/tk456def"
}`} />
      </Section>

      <Section title="PDF Document Sending" icon={FileText}>
        <p className="text-sm">The gateway downloads PDFs server-side, validates content type, and sends them as WhatsApp documents.</p>
        <CodeBlock code={`{
  "event": "invoice_created",
  "recipient": "+923001234567",
  "customer_name": "Ali Ahmed",
  "invoice_number": "INV-10025",
  "invoice_pdf_url": "https://erp.example.com/invoices/123.pdf"
}`} />
        <p className="text-xs text-muted-foreground">Filenames are auto-generated: Invoice-PAT-10025.pdf, Report-PAT-10025.pdf</p>
      </Section>

      <Section title="Idempotency / Duplicate Protection" icon={AlertCircle}>
        <p className="text-sm">Include an <code className="text-xs">idempotency_key</code> to prevent duplicate sends. If the same key is received again, the existing message record is returned without sending again.</p>
        <CodeBlock code={`{
  "event": "report_ready",
  "recipient": "+923001234567",
  "idempotency_key": "PAT-10025-REPORT-READY"
}`} />
      </Section>

      <Section title="Webhook Events" icon={Webhook} description="The gateway can notify your ERP about delivery status.">
        <div className="space-y-2 text-sm">
          <p>Configure a webhook URL in your integration settings. The gateway will POST to it:</p>
          <CodeBlock code={`{
  "event": "message_sent",
  "message_id": "uuid-here",
  "recipient": "+923001234567",
  "timestamp": "2026-09-22T10:00:00Z"
}`} />
          <p className="text-xs text-muted-foreground">Events: message_queued, message_sent, message_delivered, message_failed, whatsapp_connected, whatsapp_disconnected</p>
        </div>
      </Section>

      <Section title="Health & Status" icon={Terminal}>
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2"><Badge variant="outline">GET</Badge><code className="text-xs">/api/v1/health</code> — Service health check</div>
          <div className="flex items-center gap-2"><Badge variant="outline">GET</Badge><code className="text-xs">/api/v1/whatsapp/status</code> — WhatsApp connection status</div>
          <div className="flex items-center gap-2"><Badge variant="outline">GET</Badge><code className="text-xs">/api/v1/whatsapp/qr</code> — Get QR code data</div>
        </div>
      </Section>

      <Section title="Error Codes" icon={AlertCircle}>
        <div className="space-y-2 text-sm">
          <div className="grid grid-cols-3 gap-2">
            <Badge variant="destructive">401</Badge><span className="col-span-2">Invalid or missing API key</span>
            <Badge variant="destructive">403</Badge><span className="col-span-2">API key not authorized for this organization</span>
            <Badge variant="destructive">400</Badge><span className="col-span-2">Invalid request body (Zod validation failed)</span>
            <Badge variant="destructive">404</Badge><span className="col-span-2">Integration or connection not found</span>
            <Badge variant="destructive">429</Badge><span className="col-span-2">Rate limit exceeded</span>
            <Badge variant="destructive">500</Badge><span className="col-span-2">Internal server error</span>
          </div>
        </div>
      </Section>

      <Section title="Quick Start Example" icon={Code2} description="Connect any ERP in minutes.">
        <p className="text-sm font-medium">1. Create an integration and get your API key</p>
        <p className="text-sm font-medium mt-2">2. Send your first event:</p>
        <CodeBlock code={`curl -X POST https://your-gateway.com/api/v1/messages \\
  -H "Authorization: Bearer weg_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "event": "patient_registered",
    "recipient": "+923001234567",
    "customer_name": "Ali Ahmed",
    "patient_id": "PAT-10025",
    "invoice_pdf_url": "https://erp.example.com/invoices/123.pdf"
  }'`} language="bash" />
      </Section>
    </div>
  );
}
