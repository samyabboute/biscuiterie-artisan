-- ============================================================================
-- Table produits — catalogue et tarifs
-- ============================================================================

create table public.produits (
  reference        text primary key,
  designation      text not null,
  format_carton    text,
  prix_grossiste   numeric(10,2) not null check (prix_grossiste >= 0),
  prix_detaillant  numeric(10,2) not null check (prix_detaillant >= 0),
  tva              numeric(5,2) not null default 19,
  lot              text,
  dlc              date,
  statut           public.statut_produit_enum not null default 'actif',
  date_creation    timestamptz not null default now(),
  cree_par         text references public.employes(matricule)
);

create index idx_produits_statut on public.produits(statut);

create trigger trg_produits_no_delete
  before delete on public.produits
  for each row execute function public.fn_block_hard_delete();
