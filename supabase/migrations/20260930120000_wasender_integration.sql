-- Add WasenderAPI as a managed WhatsApp provider.
-- Credentials are intentionally kept in a service-role-only table; the browser never reads them.

alter table public.whatsapp_connections
  drop constraint if exists whatsapp_connections_provider_check;

alter table public.whatsapp_connections
  add constraint whatsapp_connections_provider_check
  check (provider in ('baileys', 'whatsapp_cloud', 'wasender'));

create table if not exists public.wasender_credentials (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null unique references public.whatsapp_connections(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  session_id text not null,
  api_key text not null,
  webhook_secret text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wasender_credentials_org_idx
  on public.wasender_credentials(organization_id);

alter table public.wasender_credentials enable row level security;

revoke all on public.wasender_credentials from anon, authenticated;
grant all on public.wasender_credentials to service_role;

create or replace function public.touch_wasender_credentials_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists wasender_credentials_updated_at on public.wasender_credentials;
create trigger wasender_credentials_updated_at
before update on public.wasender_credentials
for each row execute function public.touch_wasender_credentials_updated_at();
