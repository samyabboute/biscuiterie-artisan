-- ============================================================================
-- Types énumérés + table de référence des wilayas (découpage 2026, 69 wilayas)
-- ============================================================================

create type public.departement_enum as enum ('DIR','COM','LOG','ADV','FIN','DEP','LIV');

create type public.role_enum as enum (
  'super_admin',           -- DIR — accès total
  'directeur_commercial',  -- COM — KPI, carte, clients (validation), commandes, prix
  'resp_logistique',       -- LOG — tournées, livraisons, écarts, carte, chargements
  'superviseur_zone',      -- COM — ses zones uniquement
  'agent_adv',             -- ADV — commandes, fiches clients, QR
  'comptable',              -- FIN — encaissements, encours crédit, exports
  'magasinier',             -- DEP — chargements et retours
  'livreur'                 -- LIV — aucun accès CRM, app mobile uniquement
);

create type public.statut_employe_enum as enum ('actif','suspendu','archive');

create type public.type_client_enum as enum ('GRO','SUP','GMS','DET','CAF');
create type public.statut_client_enum as enum ('actif','suspendu','archive','en_attente_validation');
create type public.conditions_paiement_enum as enum ('comptant','credit');

create type public.statut_produit_enum as enum ('actif','archive');

create type public.statut_commande_enum as enum ('brouillon','validee','en_tournee','livree','partielle','annulee');
create type public.origine_commande_enum as enum ('livreur','admin');

create type public.statut_tournee_enum as enum ('planifiee','en_cours','terminee','archivee');
create type public.statut_arret_enum as enum ('a_faire','fait','reporte');

create type public.motif_ecart_enum as enum ('rupture','refus','ferme','dlc');

create type public.mode_encaissement_enum as enum ('especes','cheque','credit');

create type public.type_incident_enum as enum ('casse','avarie','litige','vehicule');

create type public.statut_sync_enum as enum ('succes','partiel','echec');

-- ----------------------------------------------------------------------------
-- Référentiel des wilayas (codes 01 à 69 — réforme administrative 2026)
-- Utilisé pour les listes déroulantes, filtres carte et validation des
-- fiches client. Les wilayas 59 à 69 sont issues du redécoupage 2026 ;
-- leurs libellés officiels devront être confirmés puis mis à jour ici.
-- ----------------------------------------------------------------------------
create table public.wilayas (
  code text primary key check (code ~ '^\d{2}$' and code between '01' and '69'),
  nom  text not null
);

revoke all on public.wilayas from anon, authenticated;
grant select on public.wilayas to authenticated;

insert into public.wilayas (code, nom) values
('01','Adrar'),('02','Chlef'),('03','Laghouat'),('04','Oum El Bouaghi'),('05','Batna'),
('06','Béjaïa'),('07','Biskra'),('08','Béchar'),('09','Blida'),('10','Bouira'),
('11','Tamanrasset'),('12','Tébessa'),('13','Tlemcen'),('14','Tiaret'),('15','Tizi Ouzou'),
('16','Alger'),('17','Djelfa'),('18','Jijel'),('19','Sétif'),('20','Saïda'),
('21','Skikda'),('22','Sidi Bel Abbès'),('23','Annaba'),('24','Guelma'),('25','Constantine'),
('26','Médéa'),('27','Mostaganem'),('28','M''Sila'),('29','Mascara'),('30','Ouargla'),
('31','Oran'),('32','El Bayadh'),('33','Illizi'),('34','Bordj Bou Arréridj'),('35','Boumerdès'),
('36','El Tarf'),('37','Tindouf'),('38','Tissemsilt'),('39','El Oued'),('40','Khenchela'),
('41','Souk Ahras'),('42','Tipaza'),('43','Mila'),('44','Aïn Defla'),('45','Naâma'),
('46','Aïn Témouchent'),('47','Ghardaïa'),('48','Relizane'),('49','Timimoun'),('50','Bordj Badji Mokhtar'),
('51','Ouled Djellal'),('52','Béni Abbès'),('53','In Salah'),('54','In Guezzam'),('55','Touggourt'),
('56','Djanet'),('57','El M''Ghair'),('58','El Meniaa'),
('59','Wilaya 59'),('60','Wilaya 60'),('61','Wilaya 61'),('62','Wilaya 62'),
('63','Wilaya 63'),('64','Wilaya 64'),('65','Wilaya 65'),('66','Wilaya 66'),
('67','Wilaya 67'),('68','Wilaya 68'),('69','Wilaya 69');
