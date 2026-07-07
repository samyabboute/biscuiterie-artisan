-- ============================================================================
-- Vues de reporting pour la Phase 4 (KPI, carte, encaissements). Toutes en
-- security invoker (comportement par défaut) : la RLS des tables sous-
-- jacentes s'applique normalement selon le rôle de l'utilisateur connecté.
-- ============================================================================

-- v_commandes_detail enrichie : coordonnées client + livreur assigné (via la
-- tournée si affectée), nécessaires pour la carte Algérie et les KPI par livreur.
-- (DROP + CREATE et non CREATE OR REPLACE : de nouvelles colonnes sont
-- insérées au milieu de la liste existante, ce que REPLACE interdit.)
drop view if exists public.v_commandes_detail;
create view public.v_commandes_detail as
select
  cmd.id_commande,
  cmd.client_id,
  cl.raison_sociale,
  cl.wilaya,
  cl.zone,
  cl.lat,
  cl.lng,
  cmd.statut,
  cmd.origine,
  cmd.date_commande,
  cmd.date_creation,
  cmd.cree_par,
  (select ta.tournee_id from public.tournee_arrets ta where ta.commande_id = cmd.id_commande limit 1) as tournee_id,
  (select t.livreur from public.tournee_arrets ta join public.tournees t on t.id_tournee = ta.tournee_id
     where ta.commande_id = cmd.id_commande limit 1) as livreur,
  coalesce(sum(l.quantite_commandee * l.prix_unitaire), 0) as total,
  count(l.id) as nb_lignes
from public.commandes cmd
join public.clients cl on cl.id_client = cmd.client_id
left join public.commande_lignes l on l.commande_id = cmd.id_commande
group by cmd.id_commande, cmd.client_id, cl.raison_sociale, cl.wilaya, cl.zone, cl.lat, cl.lng,
         cmd.statut, cmd.origine, cmd.date_commande, cmd.date_creation, cmd.cree_par;

-- Détail des livraisons avec valeur réellement livrée + montant encaissé
-- associé — utilisé par le tableau de bord, la carte (panneau latéral) et
-- le rapprochement de caisse des encaissements.
create or replace view public.v_livraisons_detail as
select
  l.id as livraison_id,
  l.commande_id,
  l.horodatage,
  l.lat,
  l.lng,
  l.motif_ecart,
  l.flag_a_controler,
  l.distance_gps_m,
  l.photo_url,
  l.signature_url,
  l.livreur,
  cmd.client_id,
  cl.raison_sociale,
  cl.wilaya,
  cl.zone,
  cmd.date_commande,
  coalesce((
    select sum((item->>'quantite')::numeric * clg.prix_unitaire)
    from jsonb_array_elements(l.quantites_livrees) item
    join public.commande_lignes clg on clg.commande_id = l.commande_id and clg.produit_reference = item->>'reference'
  ), 0) as valeur_livree,
  (select coalesce(sum(e.montant), 0) from public.encaissements e where e.livraison_id = l.id) as montant_encaisse
from public.livraisons l
join public.commandes cmd on cmd.id_commande = l.commande_id
join public.clients cl on cl.id_client = cmd.client_id;
