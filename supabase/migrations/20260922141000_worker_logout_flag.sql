ALTER TABLE public.whatsapp_connections
  ADD COLUMN IF NOT EXISTS force_logout boolean NOT NULL DEFAULT false;
