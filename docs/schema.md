# Schéma de données — Biscuiterie L'Artisan

Document de revue pour la Phase 0 (⛔ à valider avant de démarrer l'UI).
Détail complet dans `supabase/migrations/`.

## Vue d'ensemble des tables

| Table | Rôle | Suppression physique |
|---|---|---|
| `wilayas` | Référentiel 69 wilayas (01–69, réforme 2026) | — (référentiel) |
| `employes` | Personnel, matricule = identifiant de connexion | Interdite (statut `archive`) |
| `clients` | Fiches points de vente, QR signé | Interdite (statut `archive`) |
| `produits` | Catalogue et tarifs | Interdite (statut `archive`) |
| `commandes` / `commande_lignes` | Commandes et leurs lignes | Interdite |
| `tournees` / `tournee_arrets` | Tournées et arrêts ordonnés | Interdite |
| `livraisons` | Preuve de livraison (scan, GPS, photo, signature) | Interdite |
| `encaissements` | Paiements terrain | Interdite |
| `incidents` | Casse / avarie / litige / véhicule | Interdite |
| `journal_audit` | Traçabilité avant/après de toute écriture | — (append-only) |
| `sync_log` | Historique des synchronisations livreur | — (append-only) |
| `id_counters`, `app_config` | Tables techniques (compteurs ID, secret QR) — jamais exposées à l'API | — |

Toute table métier possède un déclencheur `fn_block_hard_delete` qui lève une
exception sur `DELETE` : le soft delete (statut `archive`) est la seule voie.
Un déclencheur générique `fn_audit_generic` journalise chaque
`INSERT`/`UPDATE`/`DELETE` dans `journal_audit` (matricule, avant/après en
jsonb, horodatage, terminal).

## Identifiants métier générés côté base

| Entité | Format | Fonction |
|---|---|---|
| Client | `CL-WW-TYP-NNNNN` | `fn_generate_client_id(wilaya, type)` |
| Employé | `ART-DEPT-NNNN` | `fn_generate_matricule(departement)` |
| Commande | `CMD-AAAAMMJJ-XXXX` | `fn_generate_commande_id(date)` |
| Tournée | `TRN-AAAAMMJJ-matricule` | `fn_generate_tournee_id(date, matricule)` |

Compteurs séquentiels atomiques via `id_counters` (verrouillage par
`ON CONFLICT ... DO UPDATE`, aucune collision possible en concurrence).

Chaque écriture terrain (`clients`, `commandes`, `livraisons`,
`encaissements`, `incidents`) porte une colonne `uuid_creation` **unique** :
un renvoi réseau ne crée jamais de doublon (idempotence de la synchro).

## QR code client

- `fn_generate_qr_token(id_client, version)` : token `id.version.signature`
  signé HMAC-SHA256 avec un secret stocké dans `app_config` (jamais exposé à
  l'API — table sans policy RLS et révoquée pour `anon`/`authenticated`).
- `fn_verify_qr_token(token)` : vérifie la signature au scan.
- Un déclencheur régénère automatiquement le token si `qr_version` est
  incrémenté (ex. réémission d'étiquette après compromission).

## Contrôle géographique à la livraison

`fn_distance_metres(lat1,lng1,lat2,lng2)` calcule la distance haversine
(sans PostGIS). Un déclencheur `before insert` sur `livraisons` calcule la
distance entre le scan GPS et les coordonnées de la fiche client, et pose
`flag_a_controler = true` si elle dépasse **300 mètres**.

## Rôles et cloisonnement (RLS)

| Rôle | Département | Portée |
|---|---|---|
| `super_admin` | DIR | Tout |
| `directeur_commercial` | COM | Clients, commandes, prix, KPI — toutes zones |
| `resp_logistique` | LOG | Tournées, livraisons, écarts — toutes zones |
| `superviseur_zone` | COM | Clients/tournées/livraisons **de ses zones uniquement** |
| `agent_adv` | ADV | Commandes, fiches client, QR — toutes zones |
| `comptable` | FIN | Encaissements, encours crédit — toutes zones |
| `magasinier` | DEP | Chargements/retours des tournées — toutes zones |
| `livreur` | LIV | Ses tournées + clients de ses zones uniquement — **aucun accès CRM** |

Fonctions d'aide (`fn_current_matricule`, `fn_current_role`,
`fn_current_zones`, `fn_zone_in_scope`, `fn_has_role`) résolvent l'identité
via `auth.uid()` → `employes.auth_user_id`. **Un employé au statut différent
de `actif` ne résout plus de matricule** : toutes les policies RLS qui en
dépendent se ferment automatiquement (`employes_select` reste ouverte pour
que l'app puisse lire son propre statut via `fn_whoami()` et se déconnecter/
purger proprement).

Le cloisonnement par zone repose sur une correspondance exacte ou par
préfixe (`fn_zone_in_scope`) : une zone assignée `'16'` (wilaya) couvre
`'16-ROUIBA'` (commune) et toute sous-zone plus précise.

RLS activée sur toutes les tables exposées à l'API ; `id_counters` et
`app_config` sont totalement révoquées (`REVOKE ALL FROM anon, authenticated`)
et ne sont accessibles que via des fonctions `SECURITY DEFINER`.

## Storage

- Bucket `preuves` (photos/signatures livraison) : upload restreint au
  livreur propriétaire du dossier `{matricule}/...` ; lecture élargie aux
  rôles habilités (mêmes règles que `livraisons`).
- Bucket `etiquettes` (planches PDF de QR codes) : upload/lecture réservés
  au personnel commercial/ADV.

## Seed de démonstration (`supabase/seed/seed_demo.sql`)

- 5 employés (Super Admin, Directeur Commercial, Resp. Logistique, 2
  Livreurs) avec comptes Supabase Auth (`matricule` → email technique
  `artXXXNNNN@interne.biscuiterie-artisan.dz`, mot de passe provisoire
  `Artisan2026!`).
- 15 produits.
- 30 clients répartis sur 14 wilayas, dont 3 codes > 58 (61, 69) issus du
  redécoupage 2026.
- 2 tournées du jour (3 arrêts/commandes chacune).

## Points à valider avant la Phase 1

1. Le découpage rôle/département vous convient-il (notamment
   `superviseur_zone` rattaché au département `COM`) ?
2. Le format de zone `wilaya` ou `wilaya-commune` est-il suffisant, ou
   faut-il un vrai référentiel communes/secteurs en base (actuellement
   `commune` est un texte libre sur `clients`, et `zones_assignees` un
   tableau de codes libres sur `employes`) ?
3. Les libellés provisoires des wilayas 59–69 sont à corriger dès que la
   liste officielle du redécoupage 2026 est disponible.
4. Confirmez-vous le secret QR généré aléatoirement en local (à définir
   explicitement en production via `app_config`) ?
