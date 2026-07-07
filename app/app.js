import { supabase } from '../src/lib/supabaseClient.js';
import { matriculeVersEmail, matriculeValide } from '../src/lib/auth.js';
import * as bd from '../src/lib/pwa/db.js';
import { pinDejaConfigure, configurerPin, verifierPin } from '../src/lib/pwa/crypto.js';
import { synchroniser } from '../src/lib/pwa/sync.js';
import { icone } from '../src/lib/icons.js';

import ecranConnexion from './ecrans/connexion.js';
import ecranPin from './ecrans/pin.js';
import ecranTournee from './ecrans/tournee.js';
import ecranVisite from './ecrans/visite.js';
import ecranNouvelleCommande from './ecrans/nouvelle-commande.js';
import ecranNouveauClient from './ecrans/nouveau-client.js';
import ecranIncidents from './ecrans/incidents.js';
import ecranFinJournee from './ecrans/fin-journee.js';

// ----------------------------------------------------------------------------
// État global de l'application (en mémoire — la clé de chiffrement ne doit
// jamais être persistée : elle est redérivée à chaque déverrouillage par PIN).
// ----------------------------------------------------------------------------
export const etat = {
  profil: null,
  cleChiffrement: null,
  visite: null, // { arret, commande, client, etape, ... } — parcours arrivée→livraison→preuve→encaissement
};

const conteneur = document.getElementById('vue');

export function naviguer(route) {
  window.location.hash = route;
}

async function demarrer() {
  if ('serviceWorker' in navigator) {
    const base = import.meta.env.BASE_URL; // '/' en dev, '/biscuiterie-artisan/' en production
    navigator.serviceWorker.register(`${base}app/service-worker.js`, { scope: `${base}app/` }).catch(() => {});
  }

  window.addEventListener('hashchange', rendre);
  await rendre();
}

async function rendre() {
  const route = window.location.hash.slice(1) || 'tournee';

  // 1) Session Supabase (fonctionne offline : simple lecture du token local).
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { afficherEcran(ecranConnexion); return; }

  // 2) Profil employé : whoami si en ligne, sinon copie locale mise en cache.
  if (!etat.profil) {
    etat.profil = await recupererProfil();
    if (!etat.profil) { afficherEcran(ecranConnexion); return; }
    if (etat.profil.statut !== 'actif' || etat.profil.role !== 'livreur') {
      await purgerEtDeconnecter("Ce compte n'est plus actif ou n'est pas un compte livreur. Les données locales ont été effacées.");
      return;
    }
  }

  // 3) Verrouillage par PIN.
  if (!etat.cleChiffrement) {
    const configure = await pinDejaConfigure();
    afficherEcran(ecranPin, { modeConfiguration: !configure });
    return;
  }

  // 4) Navigation entre écrans principaux.
  const ecrans = {
    tournee: ecranTournee,
    visite: ecranVisite,
    'nouvelle-commande': ecranNouvelleCommande,
    'nouveau-client': ecranNouveauClient,
    incidents: ecranIncidents,
    'fin-journee': ecranFinJournee,
  };
  afficherEcran(ecrans[route] || ecranTournee, {}, route);
}

function afficherEcran(module, params = {}, routeActive = null) {
  conteneur.innerHTML = '';
  module.rendre(conteneur, { etat, naviguer, contexte: { params, routeActive, afficherNavigation, gererConnexionReussie, gererPinValide } });
}

function afficherNavigation(routeActive) {
  const items = [
    { id: 'tournee', icone: 'truck', label: 'Tournée' },
    { id: 'nouvelle-commande', icone: 'package', label: 'Commande' },
    { id: 'nouveau-client', icone: 'store', label: 'Client' },
    { id: 'incidents', icone: 'alertTriangle', label: 'Incident' },
    { id: 'fin-journee', icone: 'moon', label: 'Fin journée' },
  ];
  const nav = document.createElement('nav');
  nav.className = 'pastille-navigation';
  nav.innerHTML = items.map((it) => `
    <button type="button" data-route="${it.id}" class="${routeActive === it.id ? 'actif' : ''}">
      <span class="icone">${icone(it.icone, 22)}</span><span>${it.label}</span>
    </button>
  `).join('');
  nav.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => naviguer(b.dataset.route)));
  return nav;
}

async function recupererProfil() {
  if (navigator.onLine) {
    try {
      const { data, error } = await supabase.rpc('fn_whoami');
      if (!error && data?.[0]) {
        await bd.ecrireMeta('profil', data[0]);
        return data[0];
      }
    } catch { /* on retombe sur la copie locale */ }
  }
  return bd.lireMeta('profil');
}

async function purgerEtDeconnecter(message) {
  await bd.purgerTout();
  await supabase.auth.signOut();
  etat.profil = null;
  etat.cleChiffrement = null;
  conteneur.innerHTML = `<div class="ecran"><div class="carte-app"><p>${message}</p>
    <button class="gros-bouton gros-bouton-bleu" onclick="window.location.reload()">Retour à la connexion</button></div></div>`;
}

async function gererConnexionReussie() {
  etat.profil = null;
  window.location.hash = 'tournee';
  await rendre();
}

async function gererPinValide(cle) {
  etat.cleChiffrement = cle;
  await rendre();
}

// Exposées pour les écrans (import direct plus simple que de tout redescendre en props).
export { matriculeVersEmail, matriculeValide, synchroniser };
export { supabase };

demarrer();
