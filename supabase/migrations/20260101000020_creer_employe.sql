-- ============================================================================
-- fn_creer_employe — crée un compte employé complet (auth.users + identities
-- + fiche employes) en une seule opération, avec matricule auto-généré et
-- mot de passe provisoire aléatoire. Nécessaire car la création d'un compte
-- d'authentification ne peut pas se faire depuis le navigateur (clé anonyme).
-- Autorisation vérifiée manuellement dans la fonction (SECURITY DEFINER
-- contourne la RLS, donc le contrôle d'accès doit être fait ici) :
--   - super_admin : peut créer n'importe quel département/rôle
--   - resp_logistique : peut uniquement créer des livreurs (département LIV)
-- ============================================================================

create or replace function public.fn_creer_employe(
  p_nom text,
  p_prenom text,
  p_departement public.departement_enum,
  p_role public.role_enum,
  p_telephone text default null,
  p_zones_assignees text[] default '{}'
)
returns table (matricule text, mot_de_passe_provisoire text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role_appelant public.role_enum;
  v_matricule text;
  v_email text;
  v_mdp text;
  v_user_id uuid;
begin
  v_role_appelant := public.fn_current_role();

  if v_role_appelant = 'super_admin' then
    -- autorisé pour tout département
  elsif v_role_appelant = 'resp_logistique' and p_departement = 'LIV' then
    -- autorisé uniquement pour créer des livreurs
  else
    raise exception 'Non autorisé à créer un employé de ce département.';
  end if;

  v_matricule := public.fn_generate_matricule(p_departement);
  v_email := lower(replace(v_matricule, '-', '')) || '@interne.biscuiterie-artisan.dz';
  -- Mot de passe provisoire lisible (8 caractères alphanumériques) — à changer
  -- par l'employé dès sa première connexion (fonctionnalité à ajouter côté app).
  v_mdp := substr(replace(encode(extensions.gen_random_bytes(8), 'base64'), '/', 'x'), 1, 10);

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
    v_email, extensions.crypt(v_mdp, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', jsonb_build_object('matricule', v_matricule),
    now(), now(), '', '', '', ''
  )
  returning id into v_user_id;

  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_user_id, v_user_id::text,
    jsonb_build_object('sub', v_user_id::text, 'email', v_email), 'email', now(), now(), now()
  );

  insert into public.employes (
    matricule, auth_user_id, nom, prenom, departement, role, telephone, statut, zones_assignees, cree_par
  ) values (
    v_matricule, v_user_id, p_nom, p_prenom, p_departement, p_role, p_telephone, 'actif', p_zones_assignees,
    public.fn_current_matricule()
  );

  return query select v_matricule, v_mdp;
end;
$$;

revoke execute on function public.fn_creer_employe(text, text, public.departement_enum, public.role_enum, text, text[]) from public;
grant execute on function public.fn_creer_employe(text, text, public.departement_enum, public.role_enum, text, text[]) to authenticated;
