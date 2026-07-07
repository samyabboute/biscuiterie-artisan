-- ============================================================================
-- Correctif : un encaissement espèces/chèque ne doit réduire le solde que
-- pour les clients en conditions "crédit" (le solde n'a de sens que comme
-- encours de crédit ; pour un client "comptant" il doit toujours rester à 0).
-- ============================================================================

create or replace function public.fn_trg_encaissement_maj_solde()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conditions public.conditions_paiement_enum;
begin
  if new.mode in ('especes', 'cheque') then
    select conditions_paiement into v_conditions from public.clients where id_client = new.client_id;
    if v_conditions = 'credit' then
      update public.clients set solde = solde - new.montant where id_client = new.client_id;
    end if;
  end if;
  return new;
end;
$$;
