-- ============================================================================
-- Auto-génération de l'id_commande et de l'id_tournee à l'insertion, sur le
-- même principe que clients (simplifie le code CRM : un seul insert).
-- ============================================================================

create or replace function public.fn_trg_commandes_auto_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.id_commande is null then
    new.id_commande := public.fn_generate_commande_id(new.date_commande);
  end if;
  return new;
end;
$$;

create trigger trg_commandes_auto_id
  before insert on public.commandes
  for each row execute function public.fn_trg_commandes_auto_id();

create or replace function public.fn_trg_tournees_auto_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.id_tournee is null then
    new.id_tournee := public.fn_generate_tournee_id(new.date_tournee, new.livreur);
  end if;
  return new;
end;
$$;

create trigger trg_tournees_auto_id
  before insert on public.tournees
  for each row execute function public.fn_trg_tournees_auto_id();
