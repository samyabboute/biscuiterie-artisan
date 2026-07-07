-- ============================================================================
-- Fonctions d'aide à l'authentification / autorisation (utilisées par la RLS)
-- Toutes STABLE + SECURITY DEFINER pour pouvoir lire public.employes quel que
-- soit l'appelant, sans exposer la table elle-même.
-- ============================================================================

-- Matricule de l'employé actuellement authentifié (null si inconnu ou suspendu/archivé).
create or replace function public.fn_current_matricule()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select matricule from public.employes
  where auth_user_id = auth.uid() and statut = 'actif'
  limit 1;
$$;

create or replace function public.fn_current_role()
returns public.role_enum
language sql
stable
security definer
set search_path = public
as $$
  select role from public.employes
  where auth_user_id = auth.uid() and statut = 'actif'
  limit 1;
$$;

create or replace function public.fn_current_departement()
returns public.departement_enum
language sql
stable
security definer
set search_path = public
as $$
  select departement from public.employes
  where auth_user_id = auth.uid() and statut = 'actif'
  limit 1;
$$;

create or replace function public.fn_current_zones()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select zones_assignees from public.employes
  where auth_user_id = auth.uid() and statut = 'actif'
  limit 1;
$$;

-- Vrai si le rôle courant fait partie de la liste donnée.
create or replace function public.fn_has_role(p_roles public.role_enum[])
returns boolean
language sql
stable
as $$
  select public.fn_current_role() = any(p_roles);
$$;

-- Vrai si une zone client est couverte par les zones assignées d'un agent
-- (correspondance exacte ou préfixe : une zone wilaya '16' couvre '16-ROUIBA').
create or replace function public.fn_zone_in_scope(p_zone_client text, p_zones_agent text[])
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from unnest(p_zones_agent) as z
    where p_zone_client = z or p_zone_client like z || '-%'
  );
$$;

comment on function public.fn_zone_in_scope is
  'Vérifie si la zone d''un client est couverte par les zones assignées à un agent (superviseur ou livreur).';
