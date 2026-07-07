# Biscuiterie L'Artisan — Plateforme B2B de gestion des livraisons

Plateforme composée de trois surfaces :

- `/` — vitrine (page de présentation, à construire en Phase 1+)
- `/management` — CRM interne, protégé par connexion (matricule)
- `/app` — application livreur (PWA offline-first), protégée par connexion

Stack : HTML/CSS/JavaScript (vanilla ou Vite + JS, sans TypeScript), Supabase
(PostgreSQL, Auth, Storage, Row Level Security) comme unique backend, Leaflet
+ OpenStreetMap pour la cartographie, jsQR/BarcodeDetector pour le scan QR.

État actuel : **Phase 0** — schéma de base de données, sécurité RLS et jeu
de données de démonstration. L'interface (CRM et PWA) sera construite dans
les phases suivantes.

## Arborescence

```
supabase/
  config.toml              configuration Supabase CLI (local dev)
  migrations/               migrations SQL (tables, fonctions, RLS, storage)
  seed/seed_demo.sql        jeu de données de démonstration
docs/
  schema.md                 documentation du schéma (revue Phase 0)
management/                 CRM (à venir)
app/                         PWA livreur (à venir)
src/                          code partagé (à venir)
public/                       vitrine (à venir)
```

## Lancement en local

Prérequis : [Docker](https://www.docker.com/) et le [CLI Supabase](https://supabase.com/docs/guides/cli).

```bash
# Démarrer la stack Supabase locale (Postgres, Auth, Storage, Studio)
supabase start

# Appliquer les migrations + charger le jeu de démonstration
supabase db reset
```

`supabase db reset` exécute automatiquement toutes les migrations puis
`supabase/seed/seed_demo.sql` (convention du CLI Supabase).

Une fois démarré, `supabase start` affiche les URL locales (API, Studio,
Auth). Les comptes de démonstration sont accessibles avec :

- Matricule (converti en email technique `matriculesanstirets@interne.biscuiterie-artisan.dz`)
- Mot de passe provisoire : `Artisan2026!`

| Matricule | Rôle |
|---|---|
| `ART-DIR-0001` | Super Admin |
| `ART-COM-0001` | Directeur Commercial |
| `ART-LOG-0001` | Responsable Logistique |
| `ART-LIV-0001` | Livreur |
| `ART-LIV-0002` | Livreur |

⚠️ Ce mot de passe est réservé au développement local. Ne jamais réutiliser
ce seed tel quel dans un environnement accessible publiquement.

## Déploiement

- **Backend** : projet Supabase hébergé — `supabase link` puis
  `supabase db push` pour appliquer les migrations. Le secret de signature
  QR (`app_config.qr_secret`) doit être régénéré manuellement en production.
- **Frontend** (`/`, `/management`, `/app`) : build statique déployable sur
  n'importe quel hébergeur de fichiers statiques compatible PWA (HTTPS
  obligatoire pour Service Worker + géolocalisation + caméra).

Instructions détaillées de build/déploiement du frontend à compléter en
Phase 1 (mise en place de Vite).

## Conventions d'identifiants

- Client : `CL-[Wilaya 01→69]-[Type]-[Séquence 5 chiffres]` — types GRO,
  SUP, GMS, DET, CAF.
- Employé : `ART-[DEPT]-[NNNN]` — départements DIR, COM, LOG, ADV, FIN, DEP,
  LIV. Le matricule est l'identifiant de connexion.
- Commande : `CMD-AAAAMMJJ-XXXX`.
- Tournée : `TRN-AAAAMMJJ-[matricule livreur]`.

Voir [docs/schema.md](docs/schema.md) pour le détail complet du schéma, des
fonctions de génération d'identifiants et des règles RLS.
