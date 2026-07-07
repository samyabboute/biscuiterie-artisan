-- ============================================================================
-- Jeu de données de démonstration — Biscuiterie L'Artisan
-- 5 employés (dont 2 livreurs), 30 clients (plusieurs wilayas dont > 58),
-- 15 produits, 2 tournées du jour.
-- Mot de passe provisoire de tous les comptes de démo : Artisan2026!
-- (à changer immédiatement en production — jamais réutiliser ce seed en prod)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Employés + comptes Supabase Auth associés
-- ----------------------------------------------------------------------------
do $$
declare
  emp record;
  v_matricule text;
  v_email text;
  v_user_id uuid;
  v_cree_par text;
begin
  for emp in
    select * from (values
      ('DIR', 'super_admin',         'Bouchenak', 'Nadia',    '0555100001', array[]::text[]),
      ('COM', 'directeur_commercial','Saidi',     'Karim',    '0555100002', array[]::text[]),
      ('LOG', 'resp_logistique',     'Hamdi',     'Yacine',   '0555100003', array[]::text[]),
      ('LIV', 'livreur',             'Brahimi',   'Sofiane',  '0555100004', array['16','09','35']),
      ('LIV', 'livreur',             'Kaddour',   'Amine',    '0555100005', array['31','61','69'])
    ) as t(departement, role, nom, prenom, telephone, zones)
  loop
    v_matricule := public.fn_generate_matricule(emp.departement::public.departement_enum);
    v_email := lower(replace(v_matricule, '-', '')) || '@interne.biscuiterie-artisan.dz';

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
      v_email, extensions.crypt('Artisan2026!', extensions.gen_salt('bf')), now(),
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

    v_cree_par := case when v_matricule = 'ART-DIR-0001' then null else 'ART-DIR-0001' end;

    insert into public.employes (
      matricule, auth_user_id, nom, prenom, departement, role, telephone, statut, zones_assignees, cree_par
    ) values (
      v_matricule, v_user_id, emp.nom, emp.prenom, emp.departement::public.departement_enum,
      emp.role::public.role_enum, emp.telephone, 'actif', emp.zones, v_cree_par
    );
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 2. Produits (15 références)
-- ----------------------------------------------------------------------------
insert into public.produits (reference, designation, format_carton, prix_grossiste, prix_detaillant, tva, lot, dlc, statut, cree_par)
values
  ('BIS-SAB-001','Sablés Beurre Artisan',       'Carton 24x200g', 380.00, 450.00, 19, 'L2607A', '2026-12-01','actif','ART-COM-0001'),
  ('BIS-FOU-002','Fourrés Fraise Artisan',      'Carton 20x150g', 340.00, 410.00, 19, 'L2607B', '2026-11-15','actif','ART-COM-0001'),
  ('BIS-FOU-003','Fourrés Chocolat Artisan',    'Carton 20x150g', 350.00, 420.00, 19, 'L2607C', '2026-11-15','actif','ART-COM-0001'),
  ('BIS-GAL-004','Galettes Nature Artisan',     'Carton 30x180g', 300.00, 360.00, 19, 'L2607D', '2026-10-20','actif','ART-COM-0001'),
  ('BIS-PET-005','Petit Beurre Artisan',        'Carton 24x300g', 420.00, 500.00, 19, 'L2607E', '2026-12-10','actif','ART-COM-0001'),
  ('BIS-WAF-006','Gaufrettes Vanille Artisan',  'Carton 18x100g', 260.00, 320.00, 19, 'L2607F', '2026-09-30','actif','ART-COM-0001'),
  ('BIS-WAF-007','Gaufrettes Cacao Artisan',    'Carton 18x100g', 265.00, 325.00, 19, 'L2607G', '2026-09-30','actif','ART-COM-0001'),
  ('BIS-CRA-008','Crackers Salés Artisan',      'Carton 24x200g', 310.00, 375.00, 19, 'L2607H', '2026-10-05','actif','ART-COM-0001'),
  ('BIS-MIE-009','Biscuits Miel Artisan',       'Carton 20x180g', 355.00, 425.00, 19, 'L2607I', '2026-11-01','actif','ART-COM-0001'),
  ('BIS-AMD-010','Biscuits Amande Artisan',     'Carton 20x180g', 400.00, 480.00, 19, 'L2607J', '2026-11-01','actif','ART-COM-0001'),
  ('BIS-DIG-011','Digestifs Complet Artisan',   'Carton 24x250g', 390.00, 465.00, 19, 'L2607K', '2026-12-15','actif','ART-COM-0001'),
  ('BIS-COC-012','Biscuits Coco Artisan',       'Carton 20x150g', 345.00, 415.00, 19, 'L2607L', '2026-10-25','actif','ART-COM-0001'),
  ('BIS-ORG-013','Biscuits Orange Artisan',     'Carton 20x150g', 345.00, 415.00, 19, 'L2607M', '2026-10-25','actif','ART-COM-0001'),
  ('BIS-MIX-014','Assortiment Fête Artisan',    'Carton 12x400g', 480.00, 570.00, 19, 'L2607N', '2026-12-20','actif','ART-COM-0001'),
  ('BIS-KID-015','Biscuits Enfants Artisan',    'Carton 24x120g', 290.00, 350.00, 19, 'L2607O', '2026-09-15','actif','ART-COM-0001');

-- ----------------------------------------------------------------------------
-- 3. Clients (30, répartis sur plusieurs wilayas dont des codes > 58)
-- ----------------------------------------------------------------------------
insert into public.clients (
  id_client, raison_sociale, enseigne, type_client, wilaya, commune, adresse, lat, lng,
  gerant, tel_1, zone, livreur_attitre, jours_passage, conditions_paiement, plafond_credit, remise, statut, cree_par
)
select
  public.fn_generate_client_id(t.wilaya, t.type_client::public.type_client_enum),
  t.raison_sociale, t.enseigne, t.type_client::public.type_client_enum, t.wilaya, t.commune, t.adresse,
  t.lat, t.lng, t.gerant, t.tel_1, t.wilaya, t.livreur_attitre, t.jours_passage,
  t.conditions_paiement::public.conditions_paiement_enum, t.plafond_credit, t.remise, t.statut::public.statut_client_enum, 'ART-DIR-0001'
from (values
  ('SARL Distribution El Djazair','El Djazair','GRO','16','Bab Ezzouar','Zone Indus. Lot 12',36.7180,3.1870,'Rachid Amrani','0661000001','ART-LIV-0001',array['lundi','jeudi'],'credit',200000,5,'actif'),
  ('Supérette Nour','Nour','SUP','16','Kouba','Rue des Frères Bouadou 3',36.7280,3.0810,'Nour Belkacem','0661000002','ART-LIV-0001',array['lundi','mercredi'],'comptant',0,0,'actif'),
  ('Supérette Amel','Amel','SUP','16','Hussein Dey','Bd Colonel Amirouche 45',36.7420,3.1120,'Amel Ziani','0661000003','ART-LIV-0001',array['mardi','vendredi'],'comptant',0,0,'actif'),
  ('GMS Ardis Alger','Ardis','GMS','16','Chéraga','Route Nationale 11',36.7690,2.9490,'Sami Bouzid','0661000004','ART-LIV-0001',array['lundi'],'credit',500000,8,'actif'),
  ('Détaillant Kiosque Riad','Kiosque Riad','DET','16','El Harrach','Place du 1er Novembre',36.7180,3.1390,'Riad Meziane','0661000005','ART-LIV-0001',array['mercredi'],'comptant',0,0,'actif'),
  ('Café Central Alger','Central','CAF','16','Alger Centre','Rue Larbi Ben M''hidi 8',36.7755,3.0597,'Farid Cherif','0661000006','ART-LIV-0001',array['jeudi'],'comptant',0,0,'en_attente_validation'),
  ('SARL Grossiste Blida','Blida Gros','GRO','09','Blida Centre','Zone Indus. El Affroun',36.4700,2.6100,'Omar Taleb','0662000001','ART-LIV-0001',array['mardi'],'credit',180000,5,'actif'),
  ('Supérette Essalam','Essalam','SUP','09','Boufarik','Av. de l''Indépendance 21',36.5730,2.9110,'Salim Rahmani','0662000002','ART-LIV-0001',array['lundi','jeudi'],'comptant',0,0,'actif'),
  ('Détaillant Ain Chibane','Ain Chibane','DET','09','Mouzaia','Route de la gare',36.3480,2.7930,'Hakim Belaid','0662000003','ART-LIV-0001',array['vendredi'],'comptant',0,0,'actif'),
  ('Supérette Zeralda Plage','Zeralda','SUP','35','Boumerdès Centre','Bd du 5 Juillet 10',36.7663,3.4772,'Nadir Kaci','0663000001','ART-LIV-0001',array['mercredi'],'comptant',0,0,'actif'),
  ('GMS Boumerdès Market','BM Market','GMS','35','Boudouaou','Zone Activité Boudouaou',36.7280,3.4020,'Yassine Ferhat','0663000002','ART-LIV-0001',array['lundi'],'credit',350000,6,'actif'),
  ('SARL Grossiste Oran','Oran Gros','GRO','31','Es Senia','Zone Indus. Es Senia',35.6350,-0.6120,'Belkacem Haddad','0664000001','ART-LIV-0002',array['lundi','jeudi'],'credit',220000,5,'actif'),
  ('Supérette Bir El Djir','Bir El Djir','SUP','31','Bir El Djir','Cité 800 Logts',35.7150,-0.5650,'Fatiha Meddah','0664000002','ART-LIV-0002',array['mardi'],'comptant',0,0,'actif'),
  ('GMS Uno Oran','Uno','GMS','31','Oran Centre','Bd Front de Mer',35.6969,-0.6331,'Karim Bensalem','0664000003','ART-LIV-0002',array['lundi'],'credit',600000,8,'actif'),
  ('Détaillant Kiosque Sidi Maarouf','Kiosque SM','DET','31','Sidi Maarouf','Rue Ibn Badis 5',35.6820,-0.6490,'Mounir Aliouat','0664000004','ART-LIV-0002',array['mercredi'],'comptant',0,0,'actif'),
  ('Café Oran Vue Mer','Vue Mer','CAF','31','Oran Centre','Bd Front de Mer 2',35.6980,-0.6350,'Djamel Kadi','0664000005','ART-LIV-0002',array['jeudi'],'comptant',0,0,'actif'),
  ('Supérette Sidi Bel Abbès','SBA Market','SUP','22','Sidi Bel Abbès Centre','Rue Emir AEK 12',35.1878,-0.6309,'Ahcene Boudia','0665000001','ART-LIV-0002',array['mardi','vendredi'],'comptant',0,0,'actif'),
  ('Détaillant El Hacaiba','El Hacaiba','DET','22','Ben Badis','Route Principale',35.2400,-0.4600,'Rabah Guendouz','0665000002','ART-LIV-0002',array['vendredi'],'comptant',0,0,'actif'),
  ('Supérette Ain Témouchent','AT Market','SUP','46','Ain Témouchent Centre','Rue des Martyrs 9',35.2979,-1.1400,'Abdelkader Slimani','0666000001','ART-LIV-0002',array['mercredi'],'comptant',0,0,'actif'),
  ('SARL Grossiste Constantine','Constantine Gros','GRO','25','Constantine Centre','Zone Indus. Palma',36.3650,6.6147,'Toufik Bendjedid','0667000001',null,array['lundi'],'credit',210000,5,'actif'),
  ('Supérette Didouche','Didouche','SUP','25','El Khroub','Av. Didouche Mourad 14',36.2600,6.6900,'Amina Boukhris','0667000002',null,array['jeudi'],'comptant',0,0,'actif'),
  ('GMS Sétif Market','Sétif Market','GMS','19','Sétif Centre','Route de Constantine',36.1911,5.4137,'Lyes Khaldi','0668000001',null,array['lundi'],'credit',400000,6,'actif'),
  ('Détaillant Ain Arnat','Ain Arnat','DET','19','Ain Arnat','Route Nationale 9',36.1500,5.3300,'Nacer Djebbari','0668000002',null,array['mercredi'],'comptant',0,0,'actif'),
  ('Supérette Béjaïa Port','Béjaïa Port','SUP','06','Béjaïa Centre','Bd de la Liberté 6',36.7509,5.0567,'Samir Ould Ali','0669000001',null,array['mardi'],'comptant',0,0,'actif'),
  ('Café Béjaïa Vieille Ville','Vieille Ville','CAF','06','Béjaïa Centre','Rue Ibn Khaldoun 3',36.7530,5.0600,'Hocine Amrouche','0669000002',null,array['jeudi'],'comptant',0,0,'en_attente_validation'),
  ('Supérette Tizi Ouzou','TO Market','SUP','15','Tizi Ouzou Centre','Rue Larbi Ben M''hidi 22',36.7169,4.0497,'Idir Mammeri','0670000001',null,array['lundi'],'comptant',0,0,'actif'),
  ('Détaillant Ouargla Sud','Ouargla Sud','DET','30','Ouargla Centre','Route de Touggourt',31.9539,5.3250,'Belkheir Mansouri','0671000001',null,array['vendredi'],'comptant',0,0,'actif'),
  ('Supérette El Oued Oasis','Oasis','SUP','39','El Oued Centre','Rue des Palmiers 7',33.3680,6.8673,'Abdelhak Guerfi','0672000001',null,array['mercredi'],'comptant',0,0,'actif'),
  ('Supérette Wilaya 61 Centre','W61 Market','SUP','61','Chef-lieu W61','Avenue Centrale 1',29.2000,0.3000,'Moussa Belarbi','0673000001','ART-LIV-0002',array['mardi'],'comptant',0,0,'actif'),
  ('Détaillant Wilaya 69 Sud','W69 Détail','DET','69','Chef-lieu W69','Piste Principale',25.0000,2.5000,'Salah Boughrara','0674000001','ART-LIV-0002',array['jeudi'],'comptant',0,0,'en_attente_validation')
) as t(raison_sociale, enseigne, type_client, wilaya, commune, adresse, lat, lng, gerant, tel_1, livreur_attitre, jours_passage, conditions_paiement, plafond_credit, remise, statut);

-- ----------------------------------------------------------------------------
-- 4. Tournées du jour (2) + arrêts + commandes + lignes
-- ----------------------------------------------------------------------------
do $$
declare
  v_tournee_1 text := public.fn_generate_tournee_id(current_date, 'ART-LIV-0001');
  v_tournee_2 text := public.fn_generate_tournee_id(current_date, 'ART-LIV-0002');
  v_client record;
  v_ordre integer;
  v_commande_id text;
begin
  insert into public.tournees (id_tournee, livreur, date_tournee, statut, chargement_depart, cree_par)
  values
    (v_tournee_1, 'ART-LIV-0001', current_date, 'planifiee',
     '[{"reference":"BIS-SAB-001","quantite":40},{"reference":"BIS-FOU-002","quantite":30}]'::jsonb, 'ART-LOG-0001'),
    (v_tournee_2, 'ART-LIV-0002', current_date, 'planifiee',
     '[{"reference":"BIS-PET-005","quantite":25},{"reference":"BIS-GAL-004","quantite":35}]'::jsonb, 'ART-LOG-0001');

  v_ordre := 1;
  for v_client in
    select id_client from public.clients where livreur_attitre = 'ART-LIV-0001' and statut = 'actif' order by id_client limit 3
  loop
    v_commande_id := public.fn_generate_commande_id(current_date);
    insert into public.commandes (id_commande, client_id, statut, origine, date_commande, cree_par, uuid_creation)
    values (v_commande_id, v_client.id_client, 'en_tournee', 'admin', current_date, 'ART-LOG-0001', gen_random_uuid());

    insert into public.commande_lignes (commande_id, produit_reference, quantite_commandee, prix_unitaire)
    values
      (v_commande_id, 'BIS-SAB-001', 5, 450.00),
      (v_commande_id, 'BIS-FOU-002', 3, 410.00);

    insert into public.tournee_arrets (tournee_id, commande_id, ordre, statut)
    values (v_tournee_1, v_commande_id, v_ordre, 'a_faire');

    v_ordre := v_ordre + 1;
  end loop;

  v_ordre := 1;
  for v_client in
    select id_client from public.clients where livreur_attitre = 'ART-LIV-0002' and statut = 'actif' order by id_client limit 3
  loop
    v_commande_id := public.fn_generate_commande_id(current_date);
    insert into public.commandes (id_commande, client_id, statut, origine, date_commande, cree_par, uuid_creation)
    values (v_commande_id, v_client.id_client, 'en_tournee', 'admin', current_date, 'ART-LOG-0001', gen_random_uuid());

    insert into public.commande_lignes (commande_id, produit_reference, quantite_commandee, prix_unitaire)
    values
      (v_commande_id, 'BIS-PET-005', 4, 500.00),
      (v_commande_id, 'BIS-GAL-004', 6, 360.00);

    insert into public.tournee_arrets (tournee_id, commande_id, ordre, statut)
    values (v_tournee_2, v_commande_id, v_ordre, 'a_faire');

    v_ordre := v_ordre + 1;
  end loop;
end $$;
