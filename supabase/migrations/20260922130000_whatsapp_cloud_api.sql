ALTER TABLE public.whatsapp_connections
  ADD COLUMN IF NOT EXISTS cloud_waba_id text,
  ADD COLUMN IF NOT EXISTS cloud_phone_number_id text,
  ADD COLUMN IF NOT EXISTS cloud_access_token text,
  ADD COLUMN IF NOT EXISTS cloud_verify_token text,
  ADD COLUMN IF NOT EXISTS cloud_app_secret text,
  ADD COLUMN IF NOT EXISTS cloud_api_version text DEFAULT 'v23.0';

CREATE INDEX IF NOT EXISTS idx_wa_cloud_phone ON public.whatsapp_connections(cloud_phone_number_id)
WHERE provider = 'whatsapp_cloud';

CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_cloud_phone_unique
ON public.whatsapp_connections(cloud_phone_number_id)
WHERE provider = 'whatsapp_cloud' AND cloud_phone_number_id IS NOT NULL;
