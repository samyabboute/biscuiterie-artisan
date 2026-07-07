-- ============================================================================
-- Table journal_audit + déclencheur générique
-- Rien n'est jamais supprimé physiquement : chaque INSERT/UPDATE/DELETE (les
-- DELETE étant de toute façon bloqués par fn_block_hard_delete sur les tables
-- métier) laisse une trace avant/après.
-- ============================================================================

create table public.journal_audit (
  id           bigserial primary key,
  matricule    text,
  action       text not null,   -- INSERT / UPDATE / DELETE
  entite       text not null,   -- nom de la table
  entite_id    text,
  avant        jsonb,
  apres        jsonb,
  horodatage   timestamptz not null default now(),
  terminal     text
);

create index idx_journal_audit_entite on public.journal_audit(entite, entite_id);
create index idx_journal_audit_matricule on public.journal_audit(matricule);
create index idx_journal_audit_horodatage on public.journal_audit(horodatage);

revoke all on public.journal_audit from anon, authenticated;
grant select on public.journal_audit to authenticated;

-- ----------------------------------------------------------------------------
-- Déclencheur générique d'audit — à attacher à chaque table métier.
-- Le terminal peut être transmis par le client via
-- `set_config('app.terminal', '<user-agent ou id appareil>', true)` en début
-- de transaction/requête ; sinon la colonne reste null.
-- ----------------------------------------------------------------------------
create or replace function public.fn_audit_generic()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text;
  v_matricule text;
  v_terminal text;
begin
  v_matricule := public.fn_current_matricule();
  begin
    v_terminal := current_setting('app.terminal', true);
  exception when others then
    v_terminal := null;
  end;

  if tg_op = 'DELETE' then
    v_id := coalesce(to_jsonb(old)->>'id', to_jsonb(old)->>'matricule', to_jsonb(old)->>'id_client',
                      to_jsonb(old)->>'reference', to_jsonb(old)->>'id_commande', to_jsonb(old)->>'id_tournee');
    insert into public.journal_audit(matricule, action, entite, entite_id, avant, apres, terminal)
    values (v_matricule, tg_op, tg_table_name, v_id, to_jsonb(old), null, v_terminal);
    return old;
  elsif tg_op = 'UPDATE' then
    v_id := coalesce(to_jsonb(new)->>'id', to_jsonb(new)->>'matricule', to_jsonb(new)->>'id_client',
                      to_jsonb(new)->>'reference', to_jsonb(new)->>'id_commande', to_jsonb(new)->>'id_tournee');
    insert into public.journal_audit(matricule, action, entite, entite_id, avant, apres, terminal)
    values (v_matricule, tg_op, tg_table_name, v_id, to_jsonb(old), to_jsonb(new), v_terminal);
    return new;
  else
    v_id := coalesce(to_jsonb(new)->>'id', to_jsonb(new)->>'matricule', to_jsonb(new)->>'id_client',
                      to_jsonb(new)->>'reference', to_jsonb(new)->>'id_commande', to_jsonb(new)->>'id_tournee');
    insert into public.journal_audit(matricule, action, entite, entite_id, avant, apres, terminal)
    values (v_matricule, tg_op, tg_table_name, v_id, null, to_jsonb(new), v_terminal);
    return new;
  end if;
end;
$$;

-- Attachement du déclencheur générique sur toutes les tables métier sensibles.
create trigger trg_audit_employes    after insert or update or delete on public.employes    for each row execute function public.fn_audit_generic();
create trigger trg_audit_clients     after insert or update or delete on public.clients     for each row execute function public.fn_audit_generic();
create trigger trg_audit_produits    after insert or update or delete on public.produits    for each row execute function public.fn_audit_generic();
create trigger trg_audit_commandes   after insert or update or delete on public.commandes   for each row execute function public.fn_audit_generic();
create trigger trg_audit_tournees    after insert or update or delete on public.tournees    for each row execute function public.fn_audit_generic();
create trigger trg_audit_livraisons  after insert or update or delete on public.livraisons  for each row execute function public.fn_audit_generic();
create trigger trg_audit_encaissements after insert or update or delete on public.encaissements for each row execute function public.fn_audit_generic();
create trigger trg_audit_incidents   after insert or update or delete on public.incidents   for each row execute function public.fn_audit_generic();
