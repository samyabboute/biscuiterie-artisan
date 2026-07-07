-- ============================================================================
-- Biscuiterie L'Artisan — Extensions PostgreSQL nécessaires
-- ============================================================================

create extension if not exists "pgcrypto";   -- gen_random_uuid(), hmac(), crypt()
create extension if not exists "citext";     -- comparaisons insensibles à la casse (emails)

-- ----------------------------------------------------------------------------
-- Table technique : compteurs séquentiels pour la génération d'identifiants
-- métier (matricule, id client, commande, tournée...).
-- Accès exclusivement via des fonctions SECURITY DEFINER : jamais de RLS
-- directe nécessaire, la table n'est pas exposée à PostgREST.
-- ----------------------------------------------------------------------------
create table if not exists public.id_counters (
  categorie   text not null,
  cle         text not null,
  valeur      integer not null default 0,
  primary key (categorie, cle)
);

revoke all on public.id_counters from anon, authenticated;

-- Incrémente et renvoie le compteur (catégorie, clé) de façon atomique.
create or replace function public.fn_next_counter(p_categorie text, p_cle text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_valeur integer;
begin
  insert into public.id_counters(categorie, cle, valeur)
  values (p_categorie, p_cle, 1)
  on conflict (categorie, cle)
  do update set valeur = public.id_counters.valeur + 1
  returning valeur into v_valeur;

  return v_valeur;
end;
$$;

-- ----------------------------------------------------------------------------
-- Table technique : configuration applicative sensible (ex. secret de
-- signature des QR codes). Jamais accessible via l'API publique.
-- ----------------------------------------------------------------------------
create table if not exists public.app_config (
  cle    text primary key,
  valeur text not null
);

revoke all on public.app_config from anon, authenticated;

-- Secret initial de signature QR (à remplacer en production via
-- `update public.app_config set valeur = '...' where cle = 'qr_secret';`)
insert into public.app_config(cle, valeur)
values ('qr_secret', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (cle) do nothing;
