-- ============================================================================
-- Remise à zéro des données de démonstration/test.
--
-- Demande explicite du propriétaire des données : ne conserver que les
-- comptes et clients réels listés ci-dessous. Le catalogue produits et le
-- référentiel wilayas ne sont PAS concernés par cette remise à zéro.
--
-- Répartition géographique des ~30 clients de test : faute de précision sur
-- « Ouarkik » (mentionné une seule fois, sans code wilaya identifiable), on
-- applique aux 3 catégories de clients la même répartition sur les 4 zones
-- sans ambiguïté : Azazga, Tizi Ouzou, Alger, Oran.
-- ============================================================================

-- 1) Neutraliser temporairement les triggers anti-suppression physique.
--    Ils protègent normalement contre les suppressions accidentelles ; ici
--    la remise à zéro est une opération volontaire et unique.
alter table public.clients disable trigger trg_clients_no_delete;
alter table public.commandes disable trigger trg_commandes_no_delete;
alter table public.tournees disable trigger trg_tournees_no_delete;
alter table public.livraisons disable trigger trg_livraisons_no_delete;
alter table public.encaissements disable trigger trg_encaissements_no_delete;
alter table public.incidents disable trigger trg_incidents_no_delete;
alter table public.retours_clients disable trigger trg_retours_clients_no_delete;

-- 2) Purge des données transactionnelles de démo, dans l'ordre des
--    dépendances (enfants avant parents). Le catalogue produits reste
--    intact : il n'est pas concerné par la demande de remise à zéro.
delete from public.sync_log;
delete from public.retours_clients;
delete from public.incidents;
delete from public.encaissements;
delete from public.livraisons;
delete from public.tournee_arrets;
delete from public.tournees;
delete from public.commande_lignes;
delete from public.commandes;
delete from public.clients;
delete from public.journal_audit;
delete from public.id_counters;

-- 3) Purge des comptes employés de démo (table applicative + comptes auth
--    associés, reconnaissables à leur domaine d'e-mail interne fixe).
delete from auth.identities
  where user_id in (select id from auth.users where email like '%@interne.biscuiterie-artisan.dz');
delete from auth.users where email like '%@interne.biscuiterie-artisan.dz';
-- Le catalogue produits est conservé mais référence des employés de démo
-- via cree_par : on efface cette référence (simple métadonnée, pas de valeur
-- historique à préserver) pour pouvoir purger la table employes.
update public.produits set cree_par = null;
delete from public.employes;

-- 4) Réactiver les triggers de protection.
alter table public.clients enable trigger trg_clients_no_delete;
alter table public.commandes enable trigger trg_commandes_no_delete;
alter table public.tournees enable trigger trg_tournees_no_delete;
alter table public.livraisons enable trigger trg_livraisons_no_delete;
alter table public.encaissements enable trigger trg_encaissements_no_delete;
alter table public.incidents enable trigger trg_incidents_no_delete;
alter table public.retours_clients enable trigger trg_retours_clients_no_delete;

-- 5) Création des 3 employés réels. Reproduit manuellement ce que fait
--    fn_creer_employe(), car cette fonction exige un appelant déjà
--    authentifié en super_admin — inexistant lors d'une migration exécutée
--    directement sur la base.
do $$
declare
  v_user_id   uuid;
  v_matricule text;
  v_email     text;
begin
  -- Sadoudi Nassim — Super Admin
  v_matricule := public.fn_generate_matricule('DIR');
  v_email := lower(replace(v_matricule, '-', '')) || '@interne.biscuiterie-artisan.dz';
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
    v_email, extensions.crypt('Sadoudi@2026', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', jsonb_build_object('matricule', v_matricule),
    now(), now(), '', '', '', ''
  ) returning id into v_user_id;
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_user_id, v_user_id::text, jsonb_build_object('sub', v_user_id::text, 'email', v_email), 'email', now(), now(), now());
  insert into public.employes (matricule, auth_user_id, nom, prenom, departement, role, statut, zones_assignees)
  values (v_matricule, v_user_id, 'Sadoudi', 'Nassim', 'DIR', 'super_admin', 'actif', '{}');

  -- Bennadji Nassim — Super Admin
  v_matricule := public.fn_generate_matricule('DIR');
  v_email := lower(replace(v_matricule, '-', '')) || '@interne.biscuiterie-artisan.dz';
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
    v_email, extensions.crypt('Bennadji@2026', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', jsonb_build_object('matricule', v_matricule),
    now(), now(), '', '', '', ''
  ) returning id into v_user_id;
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_user_id, v_user_id::text, jsonb_build_object('sub', v_user_id::text, 'email', v_email), 'email', now(), now(), now());
  insert into public.employes (matricule, auth_user_id, nom, prenom, departement, role, statut, zones_assignees)
  values (v_matricule, v_user_id, 'Bennadji', 'Nassim', 'DIR', 'super_admin', 'actif', '{}');

  -- Testliv — Livreur
  v_matricule := public.fn_generate_matricule('LIV');
  v_email := lower(replace(v_matricule, '-', '')) || '@interne.biscuiterie-artisan.dz';
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
    v_email, extensions.crypt('Testliv@2026', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', jsonb_build_object('matricule', v_matricule),
    now(), now(), '', '', '', ''
  ) returning id into v_user_id;
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_user_id, v_user_id::text, jsonb_build_object('sub', v_user_id::text, 'email', v_email), 'email', now(), now(), now());
  insert into public.employes (matricule, auth_user_id, nom, prenom, departement, role, statut, zones_assignees)
  values (v_matricule, v_user_id, 'Livreur', 'Testliv', 'LIV', 'livreur', 'actif', '{}');
end $$;

-- 6) Création des ~30 clients de test, répartis sur Azazga / Tizi Ouzou
--    (wilaya 15), Alger (16) et Oran (31). Livreur attitré = Testliv (seul
--    livreur existant) ; créateur enregistré = Sadoudi Nassim.

-- GrosTest (Grossiste)
insert into public.clients (raison_sociale, type_client, wilaya, commune, adresse, lat, lng, zone, livreur_attitre, conditions_paiement, statut, cree_par)
select 'GrosTest Azazga ' || k, 'GRO'::public.type_client_enum, '15', 'Azazga', 'Adresse test, Azazga',
       36.7628 + (random() - 0.5) * 0.03, 4.5525 + (random() - 0.5) * 0.03, '15',
       (select matricule from public.employes where role = 'livreur' limit 1), 'comptant'::public.conditions_paiement_enum, 'actif'::public.statut_client_enum,
       (select matricule from public.employes where role = 'super_admin' order by matricule limit 1)
from generate_series(1, 2) as g(k);

insert into public.clients (raison_sociale, type_client, wilaya, commune, adresse, lat, lng, zone, livreur_attitre, conditions_paiement, statut, cree_par)
select 'GrosTest Tizi Ouzou ' || k, 'GRO'::public.type_client_enum, '15', 'Tizi Ouzou', 'Adresse test, Tizi Ouzou',
       36.7169 + (random() - 0.5) * 0.03, 4.0497 + (random() - 0.5) * 0.03, '15',
       (select matricule from public.employes where role = 'livreur' limit 1), 'comptant'::public.conditions_paiement_enum, 'actif'::public.statut_client_enum,
       (select matricule from public.employes where role = 'super_admin' order by matricule limit 1)
from generate_series(1, 2) as g(k);

insert into public.clients (raison_sociale, type_client, wilaya, commune, adresse, lat, lng, zone, livreur_attitre, conditions_paiement, statut, cree_par)
select 'GrosTest Alger ' || k, 'GRO'::public.type_client_enum, '16', 'Alger Centre', 'Adresse test, Alger',
       36.7538 + (random() - 0.5) * 0.03, 3.0588 + (random() - 0.5) * 0.03, '16',
       (select matricule from public.employes where role = 'livreur' limit 1), 'comptant'::public.conditions_paiement_enum, 'actif'::public.statut_client_enum,
       (select matricule from public.employes where role = 'super_admin' order by matricule limit 1)
from generate_series(1, 3) as g(k);

insert into public.clients (raison_sociale, type_client, wilaya, commune, adresse, lat, lng, zone, livreur_attitre, conditions_paiement, statut, cree_par)
select 'GrosTest Oran ' || k, 'GRO'::public.type_client_enum, '31', 'Oran', 'Adresse test, Oran',
       35.6969 + (random() - 0.5) * 0.03, -0.6331 + (random() - 0.5) * 0.03, '31',
       (select matricule from public.employes where role = 'livreur' limit 1), 'comptant'::public.conditions_paiement_enum, 'actif'::public.statut_client_enum,
       (select matricule from public.employes where role = 'super_admin' order by matricule limit 1)
from generate_series(1, 3) as g(k);

-- SupTest (Supérette)
insert into public.clients (raison_sociale, type_client, wilaya, commune, adresse, lat, lng, zone, livreur_attitre, conditions_paiement, statut, cree_par)
select 'SupTest Azazga ' || k, 'SUP'::public.type_client_enum, '15', 'Azazga', 'Adresse test, Azazga',
       36.7628 + (random() - 0.5) * 0.03, 4.5525 + (random() - 0.5) * 0.03, '15',
       (select matricule from public.employes where role = 'livreur' limit 1), 'comptant'::public.conditions_paiement_enum, 'actif'::public.statut_client_enum,
       (select matricule from public.employes where role = 'super_admin' order by matricule limit 1)
from generate_series(1, 2) as g(k);

insert into public.clients (raison_sociale, type_client, wilaya, commune, adresse, lat, lng, zone, livreur_attitre, conditions_paiement, statut, cree_par)
select 'SupTest Tizi Ouzou ' || k, 'SUP'::public.type_client_enum, '15', 'Tizi Ouzou', 'Adresse test, Tizi Ouzou',
       36.7169 + (random() - 0.5) * 0.03, 4.0497 + (random() - 0.5) * 0.03, '15',
       (select matricule from public.employes where role = 'livreur' limit 1), 'comptant'::public.conditions_paiement_enum, 'actif'::public.statut_client_enum,
       (select matricule from public.employes where role = 'super_admin' order by matricule limit 1)
from generate_series(1, 2) as g(k);

insert into public.clients (raison_sociale, type_client, wilaya, commune, adresse, lat, lng, zone, livreur_attitre, conditions_paiement, statut, cree_par)
select 'SupTest Alger ' || k, 'SUP'::public.type_client_enum, '16', 'Alger Centre', 'Adresse test, Alger',
       36.7538 + (random() - 0.5) * 0.03, 3.0588 + (random() - 0.5) * 0.03, '16',
       (select matricule from public.employes where role = 'livreur' limit 1), 'comptant'::public.conditions_paiement_enum, 'actif'::public.statut_client_enum,
       (select matricule from public.employes where role = 'super_admin' order by matricule limit 1)
from generate_series(1, 3) as g(k);

insert into public.clients (raison_sociale, type_client, wilaya, commune, adresse, lat, lng, zone, livreur_attitre, conditions_paiement, statut, cree_par)
select 'SupTest Oran ' || k, 'SUP'::public.type_client_enum, '31', 'Oran', 'Adresse test, Oran',
       35.6969 + (random() - 0.5) * 0.03, -0.6331 + (random() - 0.5) * 0.03, '31',
       (select matricule from public.employes where role = 'livreur' limit 1), 'comptant'::public.conditions_paiement_enum, 'actif'::public.statut_client_enum,
       (select matricule from public.employes where role = 'super_admin' order by matricule limit 1)
from generate_series(1, 3) as g(k);

-- Tabac Kiosk (Café / kiosque)
insert into public.clients (raison_sociale, type_client, wilaya, commune, adresse, lat, lng, zone, livreur_attitre, conditions_paiement, statut, cree_par)
select 'Tabac Kiosk Azazga ' || k, 'CAF'::public.type_client_enum, '15', 'Azazga', 'Adresse test, Azazga',
       36.7628 + (random() - 0.5) * 0.03, 4.5525 + (random() - 0.5) * 0.03, '15',
       (select matricule from public.employes where role = 'livreur' limit 1), 'comptant'::public.conditions_paiement_enum, 'actif'::public.statut_client_enum,
       (select matricule from public.employes where role = 'super_admin' order by matricule limit 1)
from generate_series(1, 2) as g(k);

insert into public.clients (raison_sociale, type_client, wilaya, commune, adresse, lat, lng, zone, livreur_attitre, conditions_paiement, statut, cree_par)
select 'Tabac Kiosk Tizi Ouzou ' || k, 'CAF'::public.type_client_enum, '15', 'Tizi Ouzou', 'Adresse test, Tizi Ouzou',
       36.7169 + (random() - 0.5) * 0.03, 4.0497 + (random() - 0.5) * 0.03, '15',
       (select matricule from public.employes where role = 'livreur' limit 1), 'comptant'::public.conditions_paiement_enum, 'actif'::public.statut_client_enum,
       (select matricule from public.employes where role = 'super_admin' order by matricule limit 1)
from generate_series(1, 2) as g(k);

insert into public.clients (raison_sociale, type_client, wilaya, commune, adresse, lat, lng, zone, livreur_attitre, conditions_paiement, statut, cree_par)
select 'Tabac Kiosk Alger ' || k, 'CAF'::public.type_client_enum, '16', 'Alger Centre', 'Adresse test, Alger',
       36.7538 + (random() - 0.5) * 0.03, 3.0588 + (random() - 0.5) * 0.03, '16',
       (select matricule from public.employes where role = 'livreur' limit 1), 'comptant'::public.conditions_paiement_enum, 'actif'::public.statut_client_enum,
       (select matricule from public.employes where role = 'super_admin' order by matricule limit 1)
from generate_series(1, 3) as g(k);

insert into public.clients (raison_sociale, type_client, wilaya, commune, adresse, lat, lng, zone, livreur_attitre, conditions_paiement, statut, cree_par)
select 'Tabac Kiosk Oran ' || k, 'CAF'::public.type_client_enum, '31', 'Oran', 'Adresse test, Oran',
       35.6969 + (random() - 0.5) * 0.03, -0.6331 + (random() - 0.5) * 0.03, '31',
       (select matricule from public.employes where role = 'livreur' limit 1), 'comptant'::public.conditions_paiement_enum, 'actif'::public.statut_client_enum,
       (select matricule from public.employes where role = 'super_admin' order by matricule limit 1)
from generate_series(1, 3) as g(k);
