-- ============================================================================
-- Vue v_commandes_detail — commande + raison sociale client + total calculé
-- à partir des lignes. Vue "normale" (pas SECURITY DEFINER) : la RLS des
-- tables commandes/clients/commande_lignes s'applique normalement à travers
-- la vue, selon l'utilisateur qui interroge.
-- ============================================================================

create or replace view public.v_commandes_detail as
select
  cmd.id_commande,
  cmd.client_id,
  cl.raison_sociale,
  cl.wilaya,
  cl.zone,
  cmd.statut,
  cmd.origine,
  cmd.date_commande,
  cmd.date_creation,
  cmd.cree_par,
  coalesce(sum(l.quantite_commandee * l.prix_unitaire), 0) as total,
  count(l.id) as nb_lignes
from public.commandes cmd
join public.clients cl on cl.id_client = cmd.client_id
left join public.commande_lignes l on l.commande_id = cmd.id_commande
group by cmd.id_commande, cmd.client_id, cl.raison_sociale, cl.wilaya, cl.zone, cmd.statut, cmd.origine, cmd.date_commande, cmd.date_creation, cmd.cree_par;
