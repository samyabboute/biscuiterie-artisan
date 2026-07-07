-- ============================================================================
-- Mise à jour automatique du solde crédit client (clients.solde) :
--  - une livraison chez un client en conditions "crédit" augmente le solde
--    (dette) de la valeur réellement livrée (quantites_livrees × prix des
--    lignes de la commande).
--  - un encaissement espèces/chèque réduit le solde (paiement collecté).
--    Un encaissement "crédit" est un paiement différé : il ne modifie pas
--    le solde (rien n'a été réellement encaissé).
-- SECURITY DEFINER : un livreur peut déclencher ces mises à jour sans avoir
-- de droit d'écriture direct sur la table clients.
-- ============================================================================

create or replace function public.fn_trg_livraison_maj_solde()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id text;
  v_conditions public.conditions_paiement_enum;
  v_valeur numeric := 0;
  v_item jsonb;
  v_prix numeric;
begin
  select cmd.client_id, cl.conditions_paiement into v_client_id, v_conditions
  from public.commandes cmd
  join public.clients cl on cl.id_client = cmd.client_id
  where cmd.id_commande = new.commande_id;

  if v_conditions = 'credit' then
    for v_item in select * from jsonb_array_elements(coalesce(new.quantites_livrees, '[]'::jsonb))
    loop
      select prix_unitaire into v_prix
      from public.commande_lignes
      where commande_id = new.commande_id and produit_reference = v_item->>'reference'
      limit 1;

      v_valeur := v_valeur + coalesce(v_prix, 0) * coalesce((v_item->>'quantite')::numeric, 0);
    end loop;

    update public.clients set solde = solde + v_valeur where id_client = v_client_id;
  end if;

  return new;
end;
$$;

create trigger trg_livraison_maj_solde
  after insert on public.livraisons
  for each row execute function public.fn_trg_livraison_maj_solde();

create or replace function public.fn_trg_encaissement_maj_solde()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.mode in ('especes', 'cheque') then
    update public.clients set solde = solde - new.montant where id_client = new.client_id;
  end if;
  return new;
end;
$$;

create trigger trg_encaissement_maj_solde
  after insert on public.encaissements
  for each row execute function public.fn_trg_encaissement_maj_solde();

-- ----------------------------------------------------------------------------
-- Mise à jour automatique du statut de la commande après livraison
-- (le livreur n'a pas de droit d'écriture direct sur commandes.statut).
-- ----------------------------------------------------------------------------
create or replace function public.fn_trg_livraison_maj_commande()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.commandes
  set statut = case when new.motif_ecart is null then 'livree' else 'partielle' end
  where id_commande = new.commande_id;
  return new;
end;
$$;

create trigger trg_livraison_maj_commande
  after insert on public.livraisons
  for each row execute function public.fn_trg_livraison_maj_commande();
