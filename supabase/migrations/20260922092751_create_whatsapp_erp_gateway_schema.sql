/*
# WhatsApp ERP Notification Gateway - Core Schema

## Overview
Creates the complete database schema for the WhatsApp ERP Notification Gateway SaaS application.
This includes organizations, users, WhatsApp connections, ERP integrations, API keys,
message templates, message queue, logs, webhook delivery, connection logs,
audit logs, report delivery tokens, and settings.

## Multi-tenant Architecture
Every table is scoped by `organization_id`. Row Level Security ensures each
organization can only access its own records. Users belong to organizations
via the `org_members` table, and RLS policies check membership.

## New Tables
1. organizations - Top-level tenant entity
2. org_members - Links auth.users to organizations with roles
3. whatsapp_connections - WhatsApp number connections (Baileys or Cloud API)
4. erp_integrations - External ERP integrations
5. api_keys - API keys for ERP authentication (stored hashed)
6. message_templates - Reusable message templates with variables
7. message_queue - Outbox queue for messages to send
8. message_logs - Delivery log for each message attempt
9. webhook_logs - Outbound webhook delivery to ERPs
10. connection_logs - WhatsApp connection lifecycle logs
11. audit_logs - Security audit trail
12. report_delivery_tokens - Secure expiring tokens for report access
13. settings - Organization-level settings (key-value)

## Security
- RLS enabled on ALL tables
- All policies check org_members membership for organization scoping
- API keys stored as hashes only
*/

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ORG MEMBERS (created first because organizations policies reference it)
-- ============================================================
CREATE TABLE IF NOT EXISTS org_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'member')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(organization_id, user_id)
);

-- ============================================================
-- ORGANIZATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL DEFAULT replace(lower(gen_random_uuid()::text), '-', ''),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add FK from org_members to organizations
DO $$ BEGIN
  ALTER TABLE org_members ADD CONSTRAINT org_members_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members_select_own" ON org_members;
CREATE POLICY "members_select_own" ON org_members FOR SELECT
  TO authenticated USING (
    organization_id IN (SELECT om.organization_id FROM org_members om WHERE om.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "members_insert_own" ON org_members;
CREATE POLICY "members_insert_own" ON org_members FOR INSERT
  TO authenticated WITH CHECK (
    organization_id IN (SELECT om.organization_id FROM org_members om WHERE om.user_id = auth.uid() AND om.role = 'admin')
  );

DROP POLICY IF EXISTS "members_update_own" ON org_members;
CREATE POLICY "members_update_own" ON org_members FOR UPDATE
  TO authenticated USING (
    organization_id IN (SELECT om.organization_id FROM org_members om WHERE om.user_id = auth.uid() AND om.role = 'admin')
  ) WITH CHECK (
    organization_id IN (SELECT om.organization_id FROM org_members om WHERE om.user_id = auth.uid() AND om.role = 'admin')
  );

DROP POLICY IF EXISTS "members_delete_own" ON org_members;
CREATE POLICY "members_delete_own" ON org_members FOR DELETE
  TO authenticated USING (
    organization_id IN (SELECT om.organization_id FROM org_members om WHERE om.user_id = auth.uid() AND om.role = 'admin')
  );

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_select_own" ON organizations;
CREATE POLICY "org_select_own" ON organizations FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM org_members WHERE org_members.organization_id = organizations.id AND org_members.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "org_update_own" ON organizations;
CREATE POLICY "org_update_own" ON organizations FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM org_members WHERE org_members.organization_id = organizations.id AND org_members.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM org_members WHERE org_members.organization_id = organizations.id AND org_members.user_id = auth.uid())
  );

-- ============================================================
-- WHATSAPP CONNECTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS whatsapp_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Default Connection',
  phone_number text,
  provider text NOT NULL DEFAULT 'baileys' CHECK (provider IN ('baileys', 'whatsapp_cloud')),
  provider_session_id text,
  status text NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected', 'connecting', 'qr_required', 'error')),
  last_connected_at timestamptz,
  last_seen_at timestamptz,
  qr_data text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE whatsapp_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wa_select_own" ON whatsapp_connections;
CREATE POLICY "wa_select_own" ON whatsapp_connections FOR SELECT
  TO authenticated USING (
    organization_id IN (SELECT om.organization_id FROM org_members om WHERE om.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "wa_insert_own" ON whatsapp_connections;
CREATE POLICY "wa_insert_own" ON whatsapp_connections FOR INSERT
  TO authenticated WITH CHECK (
    organization_id IN (SELECT om.organization_id FROM org_members om WHERE om.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "wa_update_own" ON whatsapp_connections;
CREATE POLICY "wa_update_own" ON whatsapp_connections FOR UPDATE
  TO authenticated USING (
    organization_id IN (SELECT om.organization_id FROM org_members om WHERE om.user_id = auth.uid())
  ) WITH CHECK (
    organization_id IN (SELECT om.organization_id FROM org_members om WHERE om.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "wa_delete_own" ON whatsapp_connections;
CREATE POLICY "wa_delete_own" ON whatsapp_connections FOR DELETE
  TO authenticated USING (
    organization_id IN (SELECT om.organization_id FROM org_members om WHERE om.user_id = auth.uid())
  );

-- ============================================================
-- ERP INTEGRATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS erp_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  erp_name text NOT NULL,
  whatsapp_connection_id uuid REFERENCES whatsapp_connections(id) ON DELETE SET NULL,
  webhook_url text,
  webhook_secret text,
  default_language text NOT NULL DEFAULT 'en',
  default_template_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE erp_integrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "erp_select_own" ON erp_integrations;
CREATE POLICY "erp_select_own" ON erp_integrations FOR SELECT
  TO authenticated USING (
    organization_id IN (SELECT om.organization_id FROM org_members om WHERE om.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "erp_insert_own" ON erp_integrations;
CREATE POLICY "erp_insert_own" ON erp_integrations FOR INSERT
  TO authenticated WITH CHECK (
    organization_id IN (SELECT om.organization_id FROM org_members om WHERE om.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "erp_update_own" ON erp_integrations;
CREATE POLICY "erp_update_own" ON erp_integrations FOR UPDATE
  TO authenticated USING (
    organization_id IN (SELECT om.organization_id FROM org_members om WHERE om.user_id = auth.uid())
  ) WITH CHECK (
    organization_id IN (SELECT om.organization_id FROM org_members om WHERE om.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "erp_delete_own" ON erp_integrations;
CREATE POLICY "erp_delete_own" ON erp_integrations FOR DELETE
  TO authenticated USING (
    organization_id IN (SELECT om.organization_id FROM org_members om WHERE om.user_id = auth.uid())
  );

-- ============================================================
-- API KEYS (stored hashed)
-- ============================================================
CREATE TABLE IF NOT EXISTS api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  integration_id uuid REFERENCES erp_integrations(id) ON DELETE CASCADE,
  name text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  key_prefix text NOT NULL,
  last_used_at timestamptz,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz
);

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "apikey_select_own" ON api_keys;
CREATE POLICY "apikey_select_own" ON api_keys FOR SELECT
  TO authenticated USING (
    organization_id IN (SELECT om.organization_id FROM org_members om WHERE om.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "apikey_insert_own" ON api_keys;
CREATE POLICY "apikey_insert_own" ON api_keys FOR INSERT
  TO authenticated WITH CHECK (
    organization_id IN (SELECT om.organization_id FROM org_members om WHERE om.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "apikey_update_own" ON api_keys;
CREATE POLICY "apikey_update_own" ON api_keys FOR UPDATE
  TO authenticated USING (
    organization_id IN (SELECT om.organization_id FROM org_members om WHERE om.user_id = auth.uid())
  ) WITH CHECK (
    organization_id IN (SELECT om.organization_id FROM org_members om WHERE om.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "apikey_delete_own" ON api_keys;
CREATE POLICY "apikey_delete_own" ON api_keys FOR DELETE
  TO authenticated USING (
    organization_id IN (SELECT om.organization_id FROM org_members om WHERE om.user_id = auth.uid())
  );

-- ============================================================
-- MESSAGE TEMPLATES
-- ============================================================
CREATE TABLE IF NOT EXISTS message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  event text NOT NULL,
  language text NOT NULL DEFAULT 'en',
  message text NOT NULL,
  send_pdf boolean NOT NULL DEFAULT false,
  send_document boolean NOT NULL DEFAULT false,
  send_link boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tmpl_select_own" ON message_templates;
CREATE POLICY "tmpl_select_own" ON message_templates FOR SELECT
  TO authenticated USING (
    organization_id IN (SELECT om.organization_id FROM org_members om WHERE om.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "tmpl_insert_own" ON message_templates;
CREATE POLICY "tmpl_insert_own" ON message_templates FOR INSERT
  TO authenticated WITH CHECK (
    organization_id IN (SELECT om.organization_id FROM org_members om WHERE om.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "tmpl_update_own" ON message_templates;
CREATE POLICY "tmpl_update_own" ON message_templates FOR UPDATE
  TO authenticated USING (
    organization_id IN (SELECT om.organization_id FROM org_members om WHERE om.user_id = auth.uid())
  ) WITH CHECK (
    organization_id IN (SELECT om.organization_id FROM org_members om WHERE om.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "tmpl_delete_own" ON message_templates;
CREATE POLICY "tmpl_delete_own" ON message_templates FOR DELETE
  TO authenticated USING (
    organization_id IN (SELECT om.organization_id FROM org_members om WHERE om.user_id = auth.uid())
  );

-- ============================================================
-- MESSAGE QUEUE (outbox)
-- ============================================================
CREATE TABLE IF NOT EXISTS message_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  whatsapp_connection_id uuid REFERENCES whatsapp_connections(id) ON DELETE SET NULL,
  integration_id uuid REFERENCES erp_integrations(id) ON DELETE SET NULL,
  event text NOT NULL,
  recipient text NOT NULL,
  message text,
  document_url text,
  document_name text,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'sent', 'delivered', 'failed', 'cancelled')),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  last_error text,
  provider_message_id text,
  idempotency_key text,
  metadata jsonb DEFAULT '{}'::jsonb,
  queued_at timestamptz DEFAULT now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  next_retry_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE message_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mq_select_own" ON message_queue;
CREATE POLICY "mq_select_own" ON message_queue FOR SELECT
  TO authenticated USING (
    organization_id IN (SELECT om.organization_id FROM org_members om WHERE om.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "mq_insert_own" ON message_queue;
CREATE POLICY "mq_insert_own" ON message_queue FOR INSERT
  TO authenticated WITH CHECK (
    organization_id IN (SELECT om.organization_id FROM org_members om WHERE om.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "mq_update_own" ON message_queue;
CREATE POLICY "mq_update_own" ON message_queue FOR UPDATE
  TO authenticated USING (
    organization_id IN (SELECT om.organization_id FROM org_members om WHERE om.user_id = auth.uid())
  ) WITH CHECK (
    organization_id IN (SELECT om.organization_id FROM org_members om WHERE om.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "mq_delete_own" ON message_queue;
CREATE POLICY "mq_delete_own" ON message_queue FOR DELETE
  TO authenticated USING (
    organization_id IN (SELECT om.organization_id FROM org_members om WHERE om.user_id = auth.uid())
  );

-- ============================================================
-- MESSAGE LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS message_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  message_id uuid REFERENCES message_queue(id) ON DELETE CASCADE,
  status text NOT NULL,
  provider text,
  provider_message_id text,
  error text,
  attempts integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE message_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mlog_select_own" ON message_logs;
CREATE POLICY "mlog_select_own" ON message_logs FOR SELECT
  TO authenticated USING (
    organization_id IN (SELECT om.organization_id FROM org_members om WHERE om.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "mlog_insert_own" ON message_logs;
CREATE POLICY "mlog_insert_own" ON message_logs FOR INSERT
  TO authenticated WITH CHECK (
    organization_id IN (SELECT om.organization_id FROM org_members om WHERE om.user_id = auth.uid())
  );

-- ============================================================
-- WEBHOOK LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS webhook_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  integration_id uuid REFERENCES erp_integrations(id) ON DELETE CASCADE,
  event text NOT NULL,
  payload jsonb DEFAULT '{}'::jsonb,
  response_status integer,
  response_body text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "whlog_select_own" ON webhook_logs;
CREATE POLICY "whlog_select_own" ON webhook_logs FOR SELECT
  TO authenticated USING (
    organization_id IN (SELECT om.organization_id FROM org_members om WHERE om.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "whlog_insert_own" ON webhook_logs;
CREATE POLICY "whlog_insert_own" ON webhook_logs FOR INSERT
  TO authenticated WITH CHECK (
    organization_id IN (SELECT om.organization_id FROM org_members om WHERE om.user_id = auth.uid())
  );

-- ============================================================
-- CONNECTION LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS connection_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  whatsapp_connection_id uuid REFERENCES whatsapp_connections(id) ON DELETE CASCADE,
  event text NOT NULL,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE connection_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clog_select_own" ON connection_logs;
CREATE POLICY "clog_select_own" ON connection_logs FOR SELECT
  TO authenticated USING (
    organization_id IN (SELECT om.organization_id FROM org_members om WHERE om.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "clog_insert_own" ON connection_logs;
CREATE POLICY "clog_insert_own" ON connection_logs FOR INSERT
  TO authenticated WITH CHECK (
    organization_id IN (SELECT om.organization_id FROM org_members om WHERE om.user_id = auth.uid())
  );

-- ============================================================
-- AUDIT LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  details jsonb DEFAULT '{}'::jsonb,
  ip_address text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "alog_select_own" ON audit_logs;
CREATE POLICY "alog_select_own" ON audit_logs FOR SELECT
  TO authenticated USING (
    organization_id IN (SELECT om.organization_id FROM org_members om WHERE om.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "alog_insert_own" ON audit_logs;
CREATE POLICY "alog_insert_own" ON audit_logs FOR INSERT
  TO authenticated WITH CHECK (
    organization_id IN (SELECT om.organization_id FROM org_members om WHERE om.user_id = auth.uid())
  );

-- ============================================================
-- REPORT DELIVERY TOKENS
-- ============================================================
CREATE TABLE IF NOT EXISTS report_delivery_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  message_id uuid REFERENCES message_queue(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  report_url text NOT NULL,
  report_type text NOT NULL DEFAULT 'laboratory' CHECK (report_type IN ('laboratory', 'radiology', 'general')),
  expires_at timestamptz NOT NULL,
  is_one_time boolean NOT NULL DEFAULT false,
  used_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE report_delivery_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rdt_select_own" ON report_delivery_tokens;
CREATE POLICY "rdt_select_own" ON report_delivery_tokens FOR SELECT
  TO authenticated USING (
    organization_id IN (SELECT om.organization_id FROM org_members om WHERE om.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "rdt_insert_own" ON report_delivery_tokens;
CREATE POLICY "rdt_insert_own" ON report_delivery_tokens FOR INSERT
  TO authenticated WITH CHECK (
    organization_id IN (SELECT om.organization_id FROM org_members om WHERE om.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "rdt_update_own" ON report_delivery_tokens;
CREATE POLICY "rdt_update_own" ON report_delivery_tokens FOR UPDATE
  TO authenticated USING (
    organization_id IN (SELECT om.organization_id FROM org_members om WHERE om.user_id = auth.uid())
  ) WITH CHECK (
    organization_id IN (SELECT om.organization_id FROM org_members om WHERE om.user_id = auth.uid())
  );

-- ============================================================
-- SETTINGS (key-value per organization)
-- ============================================================
CREATE TABLE IF NOT EXISTS settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key text NOT NULL,
  value jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(organization_id, key)
);

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "set_select_own" ON settings;
CREATE POLICY "set_select_own" ON settings FOR SELECT
  TO authenticated USING (
    organization_id IN (SELECT om.organization_id FROM org_members om WHERE om.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "set_insert_own" ON settings;
CREATE POLICY "set_insert_own" ON settings FOR INSERT
  TO authenticated WITH CHECK (
    organization_id IN (SELECT om.organization_id FROM org_members om WHERE om.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "set_update_own" ON settings;
CREATE POLICY "set_update_own" ON settings FOR UPDATE
  TO authenticated USING (
    organization_id IN (SELECT om.organization_id FROM org_members om WHERE om.user_id = auth.uid())
  ) WITH CHECK (
    organization_id IN (SELECT om.organization_id FROM org_members om WHERE om.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "set_delete_own" ON settings;
CREATE POLICY "set_delete_own" ON settings FOR DELETE
  TO authenticated USING (
    organization_id IN (SELECT om.organization_id FROM org_members om WHERE om.user_id = auth.uid())
  );

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_org_members_user ON org_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org ON org_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_wa_conn_org ON whatsapp_connections(organization_id);
CREATE INDEX IF NOT EXISTS idx_erp_int_org ON erp_integrations(organization_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_org ON api_keys(organization_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_templates_org ON message_templates(organization_id);
CREATE INDEX IF NOT EXISTS idx_mq_org ON message_queue(organization_id);
CREATE INDEX IF NOT EXISTS idx_mq_status ON message_queue(status);
CREATE INDEX IF NOT EXISTS idx_mq_idem ON message_queue(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_mq_next_retry ON message_queue(next_retry_at) WHERE status IN ('queued', 'failed');
CREATE INDEX IF NOT EXISTS idx_mlog_org ON message_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_whlog_org ON webhook_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_clog_org ON connection_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_alog_org ON audit_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_rdt_org ON report_delivery_tokens(organization_id);
CREATE INDEX IF NOT EXISTS idx_rdt_token ON report_delivery_tokens(token);
CREATE INDEX IF NOT EXISTS idx_settings_org ON settings(organization_id);

-- ============================================================
-- UPDATED_AT TRIGGER FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER trigger_organizations_updated_at BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trigger_whatsapp_conn_updated_at BEFORE UPDATE ON whatsapp_connections FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trigger_erp_int_updated_at BEFORE UPDATE ON erp_integrations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trigger_templates_updated_at BEFORE UPDATE ON message_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trigger_mq_updated_at BEFORE UPDATE ON message_queue FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trigger_settings_updated_at BEFORE UPDATE ON settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;