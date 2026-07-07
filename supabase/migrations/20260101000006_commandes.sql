-- ============================================================================
-- Tables commandes + commande_lignes
-- ============================================================================

create table public.commandes (
  id_commande     text primary key,
  client_id       text not null references public.clients(id_client),
  statut          public.statut_commande_enum not null default 'brouillon',
  origine         public.origine_commande_enum not null,
  date_commande   date not null default current_date,
  date_creation   timestamptz not null default now(),
  cree_par        text not null references public.employes(matricule),
  uuid_creation   uuid unique not null,   -- idempotence : écriture terrain
  constraint commandes_id_format check (id_commande ~ '^CMD-\d{8}-\d{4}$')
);

create index idx_commandes_client on public.commandes(client_id);
create index idx_commandes_statut on public.commandes(statut);
create index idx_commandes_date on public.commandes(date_commande);

create table public.commande_lignes (
  id                    uuid primary key default gen_random_uuid(),
  commande_id           text not null references public.commandes(id_commande),
  produit_reference     text not null references public.produits(reference),
  quantite_commandee    integer not null check (quantite_commandee > 0),
  prix_unitaire         numeric(10,2) not null check (prix_unitaire >= 0)
);

create index idx_commande_lignes_commande on public.commande_lignes(commande_id);

-- ----------------------------------------------------------------------------
-- Génération de l'identifiant commande CMD-AAAAMMJJ-XXXX (séquence du jour)
-- ----------------------------------------------------------------------------
create or replace function public.fn_generate_commande_id(p_date date default current_date)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seq integer;
  v_jour text;
begin
  v_jour := to_char(p_date, 'YYYYMMDD');
  v_seq := public.fn_next_counter('commande', v_jour);
  return format('CMD-%s-%s', v_jour, lpad(v_seq::text, 4, '0'));
end;
$$;

create trigger trg_commandes_no_delete
  before delete on public.commandes
  for each row execute function public.fn_block_hard_delete();
