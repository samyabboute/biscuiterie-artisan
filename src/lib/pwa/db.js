import { openDB } from 'idb';

const NOM_DB = 'biscuiterie-livreur';
const VERSION_DB = 1;

let promesseDb = null;

export function db() {
  if (!promesseDb) {
    promesseDb = openDB(NOM_DB, VERSION_DB, {
      upgrade(base) {
        if (!base.objectStoreNames.contains('meta')) base.createObjectStore('meta', { keyPath: 'cle' });
        if (!base.objectStoreNames.contains('clients')) base.createObjectStore('clients', { keyPath: 'id_client' });
        if (!base.objectStoreNames.contains('produits')) base.createObjectStore('produits', { keyPath: 'reference' });
        if (!base.objectStoreNames.contains('wilayas')) base.createObjectStore('wilayas', { keyPath: 'code' });
        if (!base.objectStoreNames.contains('tournee')) base.createObjectStore('tournee', { keyPath: 'id_tournee' });
        if (!base.objectStoreNames.contains('file_attente')) {
          const magasin = base.createObjectStore('file_attente', { keyPath: 'uuid' });
          magasin.createIndex('par_statut', 'statut');
          magasin.createIndex('par_type', 'type');
        }
        if (!base.objectStoreNames.contains('sync_historique')) {
          base.createObjectStore('sync_historique', { keyPath: 'id', autoIncrement: true });
        }
      },
    });
  }
  return promesseDb;
}

// ----------------------------------------------------------------------------
// meta (clé/valeur) — configuration locale non sensible (sel PIN, horodatage...)
// ----------------------------------------------------------------------------
export async function lireMeta(cle) {
  const valeur = await (await db()).get('meta', cle);
  return valeur?.valeur;
}
export async function ecrireMeta(cle, valeur) {
  return (await db()).put('meta', { cle, valeur });
}

// ----------------------------------------------------------------------------
// Référentiel local — clients : données sensibles (solde, plafond de crédit,
// coordonnées) chiffrées avec la clé dérivée du PIN (Web Crypto AES-GCM).
// Sans clé (PIN pas encore déverrouillé), les fonctions renvoient [] / undefined
// plutôt que d'exposer les données en clair.
// ----------------------------------------------------------------------------
export async function remplacerClients(clients, cleChiffrement) {
  const { chiffrerObjet } = await import('./crypto.js');
  const base = await db();
  const tx = base.transaction('clients', 'readwrite');
  for (const c of clients) {
    const chiffre = await chiffrerObjet(cleChiffrement, c);
    await tx.store.put({ id_client: c.id_client, chiffre });
  }
  await tx.done;
}
export async function tousLesClients(cleChiffrement) {
  if (!cleChiffrement) return [];
  const { dechiffrerObjet } = await import('./crypto.js');
  const enregistrements = await (await db()).getAll('clients');
  return Promise.all(enregistrements.map((e) => dechiffrerObjet(cleChiffrement, e.chiffre)));
}
export async function unClient(idClient, cleChiffrement) {
  if (!cleChiffrement) return undefined;
  const { dechiffrerObjet } = await import('./crypto.js');
  const enregistrement = await (await db()).get('clients', idClient);
  return enregistrement ? dechiffrerObjet(cleChiffrement, enregistrement.chiffre) : undefined;
}

export async function remplacerProduits(produits) {
  const base = await db();
  const tx = base.transaction('produits', 'readwrite');
  for (const p of produits) await tx.store.put(p);
  await tx.done;
}
export async function tousLesProduits() { return (await db()).getAll('produits'); }

export async function remplacerWilayas(wilayas) {
  const base = await db();
  const tx = base.transaction('wilayas', 'readwrite');
  for (const w of wilayas) await tx.store.put(w);
  await tx.done;
}
export async function toutesLesWilayas() { return (await db()).getAll('wilayas'); }

export async function enregistrerTournee(tournee) { return (await db()).put('tournee', tournee); }
export async function tourneeDuJour(idTournee) { return (await db()).get('tournee', idTournee); }
export async function toutesLesTournees() { return (await db()).getAll('tournee'); }

// ----------------------------------------------------------------------------
// File d'attente de synchronisation (opérations en attente d'envoi)
// ----------------------------------------------------------------------------
export async function ajouterOperation(type, payload) {
  const operation = {
    uuid: payload.uuid_creation || crypto.randomUUID(),
    type,
    payload,
    statut: 'en_attente',
    tentatives: 0,
    cree_le: new Date().toISOString(),
  };
  await (await db()).put('file_attente', operation);
  return operation;
}
export async function operationsEnAttente() {
  const toutes = await (await db()).getAllFromIndex('file_attente', 'par_statut', 'en_attente');
  // Traitées dans l'ordre de création : une livraison doit être envoyée avant
  // l'encaissement qui la référence (livraison_id), pas dans un ordre arbitraire.
  return toutes.sort((a, b) => a.cree_le.localeCompare(b.cree_le));
}
export async function toutesLesOperations() { return (await db()).getAll('file_attente'); }
export async function majOperation(uuid, changements) {
  const base = await db();
  const existante = await base.get('file_attente', uuid);
  if (!existante) return;
  await base.put('file_attente', { ...existante, ...changements });
}

export async function ajouterHistoriqueSync(entree) {
  return (await db()).add('sync_historique', entree);
}
export async function historiqueSync() { return (await db()).getAll('sync_historique'); }

// ----------------------------------------------------------------------------
// Purge complète (compte suspendu détecté, ou déconnexion)
// ----------------------------------------------------------------------------
export async function purgerTout() {
  const base = await db();
  const noms = ['meta', 'clients', 'produits', 'wilayas', 'tournee', 'file_attente', 'sync_historique'];
  const tx = base.transaction(noms, 'readwrite');
  await Promise.all(noms.map((n) => tx.objectStore(n).clear()));
  await tx.done;
}
