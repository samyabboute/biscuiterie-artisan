-- ============================================================================
-- Table clients — fiche point de vente, géolocalisation, QR signé
-- ============================================================================

create table public.clients (
  id_client            text primary key,
  raison_sociale       text not null,
  enseigne             text,
  type_client          public.type_client_enum not null,
  rc                   text,
  nif                  text,
  ai                   text,
  gerant               text,
  tel_1                text,
  tel_2                text,
  email                citext,
  wilaya               text not null references public.wilayas(code),
  commune              text not null,
  adresse              text,
  lat                  numeric(9,6),
  lng                  numeric(9,6),
  zone                 text not null,               -- code de zone, ex. '16' ou '16-ROUIBA'
  livreur_attitre      text references public.employes(matricule),
  jours_passage        text[] not null default '{}', -- ex. {'lundi','jeudi'}
  conditions_paiement  public.conditions_paiement_enum not null default 'comptant',
  plafond_credit       numeric(12,2) not null default 0,
  solde                numeric(12,2) not null default 0,
  remise               numeric(5,2) not null default 0,
  qr_token             text unique,
  qr_version           integer not null default 1,
  statut               public.statut_client_enum not null default 'en_attente_validation',
  date_creation        timestamptz not null default now(),
  cree_par             text references public.employes(matricule),
  uuid_creation         uuid unique,                  -- UUID client (idempotence création terrain)
  constraint clients_id_format check (
    id_client ~ '^CL-\d{2}-(GRO|SUP|GMS|DET|CAF)-\d{5}$'
  ),
  constraint clients_plafond_positif check (plafond_credit >= 0)
);

create index idx_clients_wilaya on public.clients(wilaya);
create index idx_clients_zone on public.clients(zone);
create index idx_clients_statut on public.clients(statut);
create index idx_clients_livreur on public.clients(livreur_attitre);

-- ----------------------------------------------------------------------------
-- Génération de l'identifiant client CL-[Wilaya]-[Type]-[Séquence 5 chiffres]
-- ----------------------------------------------------------------------------
create or replace function public.fn_generate_client_id(p_wilaya text, p_type public.type_client_enum)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seq integer;
begin
  if p_wilaya !~ '^\d{2}$' or p_wilaya < '01' or p_wilaya > '69' then
    raise exception 'Code wilaya invalide: %', p_wilaya;
  end if;

  v_seq := public.fn_next_counter('client', p_wilaya || '-' || p_type::text);
  return format('CL-%s-%s-%s', p_wilaya, p_type::text, lpad(v_seq::text, 5, '0'));
end;
$$;

comment on function public.fn_generate_client_id is
  'Génère le prochain identifiant client séquentiel par wilaya+type (CL-WW-TYP-NNNNN).';

-- ----------------------------------------------------------------------------
-- Génération / signature du token QR client (HMAC-SHA256, versionné).
-- Le token encode id_client + version, signé avec le secret app_config.
-- Format: <id_client>.<version>.<signature hex>
-- ----------------------------------------------------------------------------
create or replace function public.fn_generate_qr_token(p_id_client text, p_version integer)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret text;
  v_payload text;
  v_sig text;
begin
  select valeur into v_secret from public.app_config where cle = 'qr_secret';
  v_payload := p_id_client || '.' || p_version::text;
  v_sig := encode(extensions.hmac(v_payload, v_secret, 'sha256'), 'hex');
  return v_payload || '.' || v_sig;
end;
$$;

-- Vérifie la validité d'un token QR scanné (signature + correspondance id_client).
create or replace function public.fn_verify_qr_token(p_token text)
returns table(valide boolean, id_client text, version integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parts text[];
  v_id text;
  v_version integer;
  v_sig text;
  v_expected text;
begin
  v_parts := string_to_array(p_token, '.');
  if array_length(v_parts, 1) <> 3 then
    return query select false, null::text, null::integer;
    return;
  end if;

  v_id := v_parts[1];
  v_version := v_parts[2]::integer;
  v_sig := v_parts[3];
  v_expected := public.fn_generate_qr_token(v_id, v_version);

  return query select (v_expected = p_token), v_id, v_version;
end;
$$;

-- Déclencheur : (re)génère le token QR à la création et à chaque bump de version.
create or replace function public.fn_trg_clients_qr()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.qr_token is null or (tg_op = 'UPDATE' and new.qr_version <> old.qr_version) then
    new.qr_token := public.fn_generate_qr_token(new.id_client, new.qr_version);
  end if;
  return new;
end;
$$;

create trigger trg_clients_qr
  before insert or update on public.clients
  for each row execute function public.fn_trg_clients_qr();

-- ----------------------------------------------------------------------------
-- Interdiction de suppression physique — cf. politique de soft delete globale
-- ----------------------------------------------------------------------------
create or replace function public.fn_block_hard_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Suppression physique interdite sur %. Utiliser le statut archivé.', tg_table_name;
end;
$$;

create trigger trg_clients_no_delete
  before delete on public.clients
  for each row execute function public.fn_block_hard_delete();
