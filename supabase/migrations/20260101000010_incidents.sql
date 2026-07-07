-- ============================================================================
-- Table incidents — casse, avarie, litige, véhicule
-- ============================================================================

create table public.incidents (
  id             uuid primary key default gen_random_uuid(),
  type           public.type_incident_enum not null,
  client_id      text references public.clients(id_client),
  tournee_id     text references public.tournees(id_tournee),
  photo_url      text,
  note           text,
  livreur        text not null references public.employes(matricule),
  date_creation  timestamptz not null default now(),
  uuid_creation  uuid unique not null   -- idempotence : écriture terrain
);

create index idx_incidents_livreur on public.incidents(livreur);
create index idx_incidents_date on public.incidents(date_creation);

create trigger trg_incidents_no_delete
  before delete on public.incidents
  for each row execute function public.fn_block_hard_delete();
