CREATE TABLE IF NOT EXISTS public.whatsapp_cloud_credentials (
  connection_id uuid PRIMARY KEY REFERENCES public.whatsapp_connections(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  waba_id text,
  phone_number_id text NOT NULL,
  access_token text NOT NULL,
  verify_token text,
  app_secret text,
  api_version text NOT NULL DEFAULT 'v23.0',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_cloud_credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cloud_credentials_no_client_access" ON public.whatsapp_cloud_credentials;
CREATE POLICY "cloud_credentials_no_client_access" ON public.whatsapp_cloud_credentials
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

REVOKE ALL ON public.whatsapp_cloud_credentials FROM anon, authenticated;
GRANT ALL ON public.whatsapp_cloud_credentials TO service_role;

INSERT INTO public.whatsapp_cloud_credentials
(connection_id, organization_id, waba_id, phone_number_id, access_token, verify_token, app_secret, api_version)
SELECT id, organization_id, cloud_waba_id, cloud_phone_number_id, cloud_access_token, cloud_verify_token, cloud_app_secret, COALESCE(cloud_api_version, 'v23.0')
FROM public.whatsapp_connections
WHERE provider = 'whatsapp_cloud'
  AND cloud_phone_number_id IS NOT NULL
  AND cloud_access_token IS NOT NULL
ON CONFLICT (connection_id) DO NOTHING;

ALTER TABLE public.whatsapp_connections
  DROP COLUMN IF EXISTS cloud_waba_id,
  DROP COLUMN IF EXISTS cloud_phone_number_id,
  DROP COLUMN IF EXISTS cloud_access_token,
  DROP COLUMN IF EXISTS cloud_verify_token,
  DROP COLUMN IF EXISTS cloud_app_secret,
  DROP COLUMN IF EXISTS cloud_api_version;
