-- ============================================================================
-- Correctif : le CASE de fn_trg_livraison_maj_commande produisait un texte
-- brut au lieu d'un statut_commande_enum, ce qui faisait échouer la mise à
-- jour du statut de la commande (et par ricochet l'encaissement, qui
-- référence la livraison jamais créée).
-- ============================================================================

create or replace function public.fn_trg_livraison_maj_commande()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.commandes
  set statut = (case when new.motif_ecart is null then 'livree' else 'partielle' end)::public.statut_commande_enum
  where id_commande = new.commande_id;
  return new;
end;
$$;
