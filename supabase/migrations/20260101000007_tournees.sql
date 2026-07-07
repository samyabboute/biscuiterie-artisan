-- ============================================================================
-- Tables tournees + tournee_arrets
-- ============================================================================

create table public.tournees (
  id_tournee          text primary key,
  livreur             text not null references public.employes(matricule),
  date_tournee        date not null default current_date,
  statut              public.statut_tournee_enum not null default 'planifiee',
  chargement_depart   jsonb not null default '[]'::jsonb,  -- [{reference, quantite}]
  retour              jsonb not null default '[]'::jsonb,  -- [{reference, quantite}]
  date_creation       timestamptz not null default now(),
  cree_par            text not null references public.employes(matricule),
  constraint tournees_id_format check (id_tournee ~ '^TRN-\d{8}-ART-(DIR|COM|LOG|ADV|FIN|DEP|LIV)-\d{4}$'),
  constraint tournees_livreur_unique_jour unique (livreur, date_tournee)
);

create index idx_tournees_livreur on public.tournees(livreur);
create index idx_tournees_date on public.tournees(date_tournee);

create table public.tournee_arrets (
  id            uuid primary key default gen_random_uuid(),
  tournee_id    text not null references public.tournees(id_tournee),
  commande_id   text not null references public.commandes(id_commande),
  ordre         integer not null,
  statut        public.statut_arret_enum not null default 'a_faire',
  constraint tournee_arrets_unique unique (tournee_id, commande_id)
);

create index idx_tournee_arrets_tournee on public.tournee_arrets(tournee_id, ordre);

-- ----------------------------------------------------------------------------
-- Génération de l'identifiant tournée TRN-AAAAMMJJ-[matricule livreur]
-- ----------------------------------------------------------------------------
create or replace function public.fn_generate_tournee_id(p_date date, p_matricule text)
returns text
language sql
immutable
as $$
  select format('TRN-%s-%s', to_char(p_date, 'YYYYMMDD'), p_matricule);
$$;

create trigger trg_tournees_no_delete
  before delete on public.tournees
  for each row execute function public.fn_block_hard_delete();
