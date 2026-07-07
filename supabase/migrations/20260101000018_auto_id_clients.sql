-- ============================================================================
-- Auto-génération de l'id_client à l'insertion (si non fourni), et durcissement
-- des permissions sur les fonctions de génération d'identifiants/QR : seuls
-- les utilisateurs authentifiés peuvent les appeler (pas le rôle anon).
-- ============================================================================

create or replace function public.fn_trg_clients_auto_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.id_client is null then
    new.id_client := public.fn_generate_client_id(new.wilaya, new.type_client);
  end if;
  return new;
end;
$$;

create trigger trg_clients_auto_id
  before insert on public.clients
  for each row execute function public.fn_trg_clients_auto_id();

-- Le trigger d'ID doit s'exécuter avant celui du QR (qui a besoin de
-- l'id_client final). L'ordre des triggers BEFORE INSERT suit l'ordre
-- alphabétique du nom : "trg_clients_auto_id" < "trg_clients_qr" < "trg_clients_no_delete" (n/a ici) — OK.

revoke execute on function public.fn_generate_matricule(public.departement_enum) from public;
revoke execute on function public.fn_generate_client_id(text, public.type_client_enum) from public;
revoke execute on function public.fn_generate_commande_id(date) from public;
revoke execute on function public.fn_generate_qr_token(text, integer) from public;
revoke execute on function public.fn_verify_qr_token(text) from public;
revoke execute on function public.fn_next_counter(text, text) from public;

grant execute on function public.fn_generate_matricule(public.departement_enum) to authenticated;
grant execute on function public.fn_generate_client_id(text, public.type_client_enum) to authenticated;
grant execute on function public.fn_generate_commande_id(date) to authenticated;
grant execute on function public.fn_verify_qr_token(text) to authenticated;
-- fn_generate_qr_token et fn_next_counter restent internes (appelées uniquement
-- par des triggers SECURITY DEFINER) : aucun grant à authenticated nécessaire.
