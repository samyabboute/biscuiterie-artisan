-- ============================================================================
-- Table encaissements
-- ============================================================================

create table public.encaissements (
  id             uuid primary key default gen_random_uuid(),
  livraison_id   uuid references public.livraisons(id),
  client_id      text not null references public.clients(id_client),
  montant        numeric(12,2) not null check (montant >= 0),
  mode           public.mode_encaissement_enum not null,
  livreur        text not null references public.employes(matricule),
  date_creation  timestamptz not null default now(),
  uuid_creation  uuid unique not null   -- idempotence : écriture terrain
);

create index idx_encaissements_client on public.encaissements(client_id);
create index idx_encaissements_livreur on public.encaissements(livreur);
create index idx_encaissements_date on public.encaissements(date_creation);

create trigger trg_encaissements_no_delete
  before delete on public.encaissements
  for each row execute function public.fn_block_hard_delete();
