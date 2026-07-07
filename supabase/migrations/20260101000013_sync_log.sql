-- ============================================================================
-- Table sync_log — alimente l'indicateur « synchronisé avant 17h00 »
-- ============================================================================

create table public.sync_log (
  id                  bigserial primary key,
  matricule_livreur   text not null references public.employes(matricule),
  date_sync           date not null default current_date,
  heure_sync          timestamptz not null default now(),
  nb_enregistrements  integer not null default 0,
  statut              public.statut_sync_enum not null default 'succes'
);

create index idx_sync_log_livreur_date on public.sync_log(matricule_livreur, date_sync);
create index idx_sync_log_heure on public.sync_log(heure_sync);

revoke all on public.sync_log from anon, authenticated;
grant select, insert on public.sync_log to authenticated;

-- Vue pratique pour le CRM : dernière synchro du jour par livreur, avec
-- pastille de discipline (vert avant 17h00, orange jusqu'à 17h05, rouge après).
create or replace view public.v_discipline_sync as
select
  e.matricule,
  e.nom,
  e.prenom,
  s.date_sync,
  max(s.heure_sync) as derniere_sync,
  case
    when max(s.heure_sync) is null then 'rouge'
    when (max(s.heure_sync)::time) <= time '17:00:00' then 'vert'
    when (max(s.heure_sync)::time) <= time '17:05:00' then 'orange'
    else 'rouge'
  end as pastille
from public.employes e
left join public.sync_log s on s.matricule_livreur = e.matricule and s.date_sync = current_date
where e.role = 'livreur'
group by e.matricule, e.nom, e.prenom, s.date_sync;
