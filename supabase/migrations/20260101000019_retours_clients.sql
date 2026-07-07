-- ============================================================================
-- Table retours_clients — retours de produits défectueux/périmés/cassés
-- rendus par un client, distincts des invendus fin de tournée (tournees.retour)
-- et du refus à la livraison (livraisons.motif_ecart = 'refus').
-- Une fois validé, le retour crédite automatiquement le solde du client
-- (avoir). Rien n'est jamais supprimé : un retour rejeté reste tracé.
-- ============================================================================

create type public.motif_retour_enum as enum ('defectueux', 'perime', 'casse', 'autre');
create type public.statut_retour_enum as enum ('enregistre', 'valide', 'rejete');

create table public.retours_clients (
  id              uuid primary key default gen_random_uuid(),
  client_id       text not null references public.clients(id_client),
  produit_reference text not null references public.produits(reference),
  quantite        integer not null check (quantite > 0),
  motif           public.motif_retour_enum not null,
  montant_avoir   numeric(12,2) not null default 0 check (montant_avoir >= 0),
  livraison_id    uuid references public.livraisons(id),
  tournee_id      text references public.tournees(id_tournee),
  livreur         text not null references public.employes(matricule),
  photo_url       text,
  note            text,
  statut          public.statut_retour_enum not null default 'enregistre',
  date_creation   timestamptz not null default now(),
  cree_par        text not null references public.employes(matricule),
  uuid_creation   uuid unique not null   -- idempotence : écriture terrain
);

create index idx_retours_clients_client on public.retours_clients(client_id);
create index idx_retours_clients_livreur on public.retours_clients(livreur);
create index idx_retours_clients_statut on public.retours_clients(statut);

create trigger trg_retours_clients_no_delete
  before delete on public.retours_clients
  for each row execute function public.fn_block_hard_delete();

create trigger trg_audit_retours_clients
  after insert or update or delete on public.retours_clients
  for each row execute function public.fn_audit_generic();

-- ----------------------------------------------------------------------------
-- Crédite le solde client dès que le retour passe au statut 'valide'
-- (une seule fois — protégé par la condition sur l'ancien statut).
-- SECURITY DEFINER : un comptable peut valider un retour sans avoir le droit
-- de modifier directement la table clients.
-- ----------------------------------------------------------------------------
create or replace function public.fn_trg_retours_credit_solde()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.statut = 'valide' and old.statut is distinct from 'valide' then
    update public.clients
    set solde = solde - new.montant_avoir
    where id_client = new.client_id;
  end if;
  return new;
end;
$$;

create trigger trg_retours_credit_solde
  after update on public.retours_clients
  for each row execute function public.fn_trg_retours_credit_solde();

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table public.retours_clients enable row level security;

create policy retours_clients_select on public.retours_clients
  for select to authenticated
  using (
    public.fn_has_role(array['super_admin', 'comptable', 'resp_logistique', 'agent_adv']::public.role_enum[])
    or (public.fn_has_role(array['superviseur_zone']::public.role_enum[]) and exists (
          select 1 from public.clients c where c.id_client = retours_clients.client_id
          and public.fn_zone_in_scope(c.zone, public.fn_current_zones())))
    or (public.fn_has_role(array['livreur']::public.role_enum[]) and livreur = public.fn_current_matricule())
  );

create policy retours_clients_insert on public.retours_clients
  for insert to authenticated
  with check (
    public.fn_has_role(array['super_admin', 'resp_logistique', 'agent_adv']::public.role_enum[])
    or (public.fn_has_role(array['livreur']::public.role_enum[]) and livreur = public.fn_current_matricule())
  );

-- Seuls les rôles de contrôle peuvent valider/rejeter un retour (impact solde).
create policy retours_clients_update on public.retours_clients
  for update to authenticated
  using (public.fn_has_role(array['super_admin', 'comptable']::public.role_enum[]))
  with check (public.fn_has_role(array['super_admin', 'comptable']::public.role_enum[]));
