-- ============================================================================
-- Table livraisons — preuve de livraison terrain (scan, GPS, photo, signature)
-- ============================================================================

create table public.livraisons (
  id                    uuid primary key default gen_random_uuid(),
  commande_id           text not null references public.commandes(id_commande),
  horodatage            timestamptz not null default now(),
  lat                   numeric(9,6),
  lng                   numeric(9,6),
  scan_qr_token         text,
  scan_qr_heure         timestamptz,
  quantites_livrees     jsonb not null default '[]'::jsonb,  -- [{reference, quantite}]
  quantites_commandees  jsonb not null default '[]'::jsonb,  -- copie figée au moment de la livraison
  motif_ecart           public.motif_ecart_enum,
  photo_url             text,
  signature_url         text,
  distance_gps_m        numeric(10,2),
  flag_a_controler       boolean not null default false,
  livreur               text not null references public.employes(matricule),
  date_creation         timestamptz not null default now(),
  uuid_creation          uuid unique not null   -- idempotence : écriture terrain
);

create index idx_livraisons_commande on public.livraisons(commande_id);
create index idx_livraisons_livreur on public.livraisons(livreur);
create index idx_livraisons_date on public.livraisons(date_creation);
create index idx_livraisons_a_controler on public.livraisons(flag_a_controler) where flag_a_controler;

-- ----------------------------------------------------------------------------
-- Distance haversine (mètres) entre deux points GPS — sans dépendance PostGIS.
-- ----------------------------------------------------------------------------
create or replace function public.fn_distance_metres(
  p_lat1 numeric, p_lng1 numeric, p_lat2 numeric, p_lng2 numeric
) returns numeric
language sql
immutable
as $$
  select case
    when p_lat1 is null or p_lng1 is null or p_lat2 is null or p_lng2 is null then null
    else (
      6371000 * acos(
        least(1.0, greatest(-1.0,
          cos(radians(p_lat1)) * cos(radians(p_lat2)) * cos(radians(p_lng2) - radians(p_lng1))
          + sin(radians(p_lat1)) * sin(radians(p_lat2))
        ))
      )
    )::numeric
  end;
$$;

-- ----------------------------------------------------------------------------
-- Calcule automatiquement la distance scan↔fiche client et le flag à contrôler
-- (seuil : 300 mètres) à chaque insertion de livraison.
-- ----------------------------------------------------------------------------
create or replace function public.fn_trg_livraisons_controle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_lat numeric;
  v_client_lng numeric;
begin
  select c.lat, c.lng into v_client_lat, v_client_lng
  from public.commandes cmd
  join public.clients c on c.id_client = cmd.client_id
  where cmd.id_commande = new.commande_id;

  new.distance_gps_m := public.fn_distance_metres(new.lat, new.lng, v_client_lat, v_client_lng);
  new.flag_a_controler := (new.distance_gps_m is not null and new.distance_gps_m > 300);

  return new;
end;
$$;

create trigger trg_livraisons_controle
  before insert on public.livraisons
  for each row execute function public.fn_trg_livraisons_controle();

create trigger trg_livraisons_no_delete
  before delete on public.livraisons
  for each row execute function public.fn_block_hard_delete();
