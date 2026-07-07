import { defineConfig } from 'vite';
import { resolve } from 'path';

// Application multi-pages : vitrine (/), CRM (/management), app livreur (/app).
// base : uniquement en production, car le site est publié dans le sous-dossier
// /biscuiterie-artisan/ sur GitHub Pages (samyabboute.github.io/biscuiterie-artisan/).
// En développement local (npm run dev), le site reste servi à la racine.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/biscuiterie-artisan/' : '/',
  build: {
    // es2022 nécessaire : plusieurs écrans utilisent `await` en haut de
    // fichier (top-level await), pris en charge par tous les navigateurs
    // mobiles/desktop modernes mais pas par la cible par défaut d'esbuild.
    target: 'es2022',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        managementLogin: resolve(__dirname, 'management/login.html'),
        managementIndex: resolve(__dirname, 'management/index.html'),
        managementClients: resolve(__dirname, 'management/clients.html'),
        managementProduits: resolve(__dirname, 'management/produits.html'),
        managementDistribution: resolve(__dirname, 'management/distribution.html'),
        managementUtilisateurs: resolve(__dirname, 'management/utilisateurs.html'),
        managementCommandes: resolve(__dirname, 'management/commandes.html'),
        managementTournees: resolve(__dirname, 'management/tournees.html'),
        managementRetours: resolve(__dirname, 'management/retours.html'),
        managementCarte: resolve(__dirname, 'management/carte.html'),
        managementEncaissements: resolve(__dirname, 'management/encaissements.html'),
        managementArchives: resolve(__dirname, 'management/archives.html'),
        managementAudit: resolve(__dirname, 'management/audit.html'),
        appIndex: resolve(__dirname, 'app/index.html'),
      },
    },
  },
}));
