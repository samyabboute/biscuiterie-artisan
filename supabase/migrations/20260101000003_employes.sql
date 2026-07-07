-- ============================================================================
-- Table employes — identité, matricule, rôle, zones assignées
-- ============================================================================

create table public.employes (
  matricule       text primary key,
  auth_user_id    uuid unique references auth.users(id) on delete set null,
  nom             text not null,
  prenom          text not null,
  departement     public.departement_enum not null,
  role            public.role_enum not null,
  telephone       text,
  statut          public.statut_employe_enum not null default 'actif',
  zones_assignees text[] not null default '{}',
  date_creation   timestamptz not null default now(),
  cree_par        text references public.employes(matricule),
  constraint employes_matricule_format check (matricule ~ '^ART-(DIR|COM|LOG|ADV|FIN|DEP|LIV)-\d{4}$')
);

create index idx_employes_departement on public.employes(departement);
create index idx_employes_statut on public.employes(statut);
create index idx_employes_zones on public.employes using gin(zones_assignees);

-- ----------------------------------------------------------------------------
-- Génération automatique du matricule ART-[DEPT]-[NNNN]
-- ----------------------------------------------------------------------------
create or replace function public.fn_generate_matricule(p_departement public.departement_enum)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seq integer;
begin
  v_seq := public.fn_next_counter('matricule', p_departement::text);
  return format('ART-%s-%s', p_departement::text, lpad(v_seq::text, 4, '0'));
end;
$$;

comment on function public.fn_generate_matricule is
  'Génère le prochain matricule séquentiel pour un département donné (ART-DEPT-NNNN).';
