// Verrouillage par code PIN local + chiffrement des données sensibles dans
// IndexedDB (Web Crypto — PBKDF2 pour dériver une clé AES-GCM à partir du PIN).
import { lireMeta, ecrireMeta } from './db.js';

const ITERATIONS_PBKDF2 = 150000;
const CANARI = 'biscuiterie-artisan-ok';

function versBase64(buffer) { return btoa(String.fromCharCode(...new Uint8Array(buffer))); }
function depuisBase64(base64) { return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)); }

async function deriverCle(pin, selBase64) {
  const sel = depuisBase64(selBase64);
  const materiau = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: sel, iterations: ITERATIONS_PBKDF2, hash: 'SHA-256' },
    materiau,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function pinDejaConfigure() {
  return !!(await lireMeta('sel_pin'));
}

// Première configuration du PIN local (après la première connexion réussie).
export async function configurerPin(pin) {
  const sel = crypto.getRandomValues(new Uint8Array(16));
  const selBase64 = versBase64(sel);
  const cle = await deriverCle(pin, selBase64);

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const chiffre = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cle, new TextEncoder().encode(CANARI));

  await ecrireMeta('sel_pin', selBase64);
  await ecrireMeta('verif_pin', { iv: versBase64(iv), data: versBase64(chiffre) });
  return cle;
}

// Vérifie le PIN saisi ; renvoie la clé de chiffrement si correct, sinon null.
export async function verifierPin(pin) {
  const selBase64 = await lireMeta('sel_pin');
  const verif = await lireMeta('verif_pin');
  if (!selBase64 || !verif) return null;

  try {
    const cle = await deriverCle(pin, selBase64);
    const dechiffre = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: depuisBase64(verif.iv) },
      cle,
      depuisBase64(verif.data)
    );
    const texte = new TextDecoder().decode(dechiffre);
    return texte === CANARI ? cle : null;
  } catch {
    return null; // PIN incorrect : échec de déchiffrement (GCM authentifié)
  }
}

// Chiffre un objet JS quelconque (JSON) avec la clé dérivée du PIN.
export async function chiffrerObjet(cle, objet) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const donnees = new TextEncoder().encode(JSON.stringify(objet));
  const chiffre = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cle, donnees);
  return { iv: versBase64(iv), data: versBase64(chiffre) };
}

export async function dechiffrerObjet(cle, { iv, data }) {
  const dechiffre = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: depuisBase64(iv) },
    cle,
    depuisBase64(data)
  );
  return JSON.parse(new TextDecoder().decode(dechiffre));
}
