-- ============================================================================
-- Colonnes updated_at + déclencheur générique, nécessaires à la synchro delta
-- de la PWA livreur sur le référentiel (clients, produits) : on ne retélécharge
-- que ce qui a changé depuis la dernière synchro (updated_at > dernier_sync).
-- ============================================================================

create or replace function public.fn_trg_maj_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

alter table public.clients add column updated_at timestamptz not null default now();
alter table public.produits add column updated_at timestamptz not null default now();

create trigger trg_clients_updated_at
  before update on public.clients
  for each row execute function public.fn_trg_maj_updated_at();

create trigger trg_produits_updated_at
  before update on public.produits
  for each row execute function public.fn_trg_maj_updated_at();

create index idx_clients_updated_at on public.clients(updated_at);
create index idx_produits_updated_at on public.produits(updated_at);
