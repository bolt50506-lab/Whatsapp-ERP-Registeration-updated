ALTER TABLE public.whatsapp_connections
  ADD COLUMN IF NOT EXISTS worker_enabled boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_wa_worker_enabled
ON public.whatsapp_connections(provider, worker_enabled, status);
