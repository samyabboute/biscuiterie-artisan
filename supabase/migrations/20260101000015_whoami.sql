-- ============================================================================
-- fn_whoami — permet à un utilisateur connecté de lire SA propre fiche
-- employé (statut, rôle, zones) même si son compte vient d'être suspendu et
-- que les policies RLS bloquent déjà tout le reste. Utilisé par le CRM et la
-- PWA juste après connexion pour décider s'il faut purger/déconnecter.
-- ============================================================================

create or replace function public.fn_whoami()
returns table (
  matricule text,
  nom text,
  prenom text,
  departement public.departement_enum,
  role public.role_enum,
  statut public.statut_employe_enum,
  zones_assignees text[]
)
language sql
stable
security definer
set search_path = public
as $$
  select matricule, nom, prenom, departement, role, statut, zones_assignees
  from public.employes
  where auth_user_id = auth.uid()
  limit 1;
$$;

revoke all on function public.fn_whoami() from anon;
grant execute on function public.fn_whoami() to authenticated;
