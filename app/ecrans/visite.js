import * as bd from '../../src/lib/pwa/db.js';
import { position as positionGps } from '../../src/lib/pwa/gps.js';
import { demarrerScan } from '../../src/lib/pwa/qr-scan.js';
import { compresserPhoto } from '../../src/lib/pwa/photo.js';
import { creerPadSignature } from '../../src/lib/pwa/signature.js';
import { icone } from '../../src/lib/icons.js';

const LIBELLES_MOTIF = { rupture: 'Rupture de stock', refus: 'Client refuse', ferme: 'Point fermé', dlc: 'DLC dépassée' };

// Repère visuel "étape X sur 4" affiché en haut de chaque écran de la visite —
// répond directement au sentiment "trop d'étapes, je ne sais pas où j'en suis".
const ETAPES_VISITE = [
  { id: 'arrivee', label: 'Arrivée' },
  { id: 'livraison', label: 'Livraison' },
  { id: 'preuve', label: 'Preuve' },
  { id: 'encaissement', label: 'Paiement' },
];
function indicateurEtapes(etapeActuelle) {
  const index = ETAPES_VISITE.findIndex((e) => e.id === etapeActuelle);
  return `
    <div class="indicateur-etapes">
      ${ETAPES_VISITE.map((e, i) => `
        <div class="indicateur-etape ${i < index ? 'fait' : ''} ${i === index ? 'actuel' : ''}">
          <span class="indicateur-etape-point">${i < index ? icone('checkCircle', 13) : i + 1}</span>
          <span class="indicateur-etape-label">${e.label}</span>
        </div>
        ${i < ETAPES_VISITE.length - 1 ? '<span class="indicateur-etape-trait"></span>' : ''}
      `).join('')}
    </div>
  `;
}

async function rendre(conteneur, { etat, naviguer }) {
  const visite = etat.visite;
  if (!visite) { naviguer('tournee'); return; }

  const etapes = { arrivee: dessinerArrivee, livraison: dessinerLivraison, preuve: dessinerPreuve, encaissement: dessinerEncaissement };
  (etapes[visite.etape] || dessinerArrivee)(conteneur, etat, naviguer, visite);
}

// Passe à l'étape suivante SANS dépendre d'un changement de hash (le hash
// reste "visite" pendant tout le parcours arrivée→livraison→preuve→encaissement) :
// on redessine directement l'étape courante au lieu d'appeler naviguer().
function etapeSuivante(conteneur, etat, naviguer) {
  rendre(conteneur, { etat, naviguer });
}

// ============================================================================
// 1) Arrivée client — scan QR (contrôle bon client/bon arrêt) ou saisie de secours
// ============================================================================
function dessinerArrivee(conteneur, etat, naviguer, visite) {
  const client = visite.client;
  conteneur.innerHTML = `
    <div class="entete-app"><button class="retour" id="btn-retour">${icone('chevronLeft', 20)}</button><h1>Arrivée client</h1><span class="entete-espace"></span></div>
    <div class="ecran">
      ${indicateurEtapes('arrivee')}
      <div class="carte-app">
        <div class="grand-titre" style="font-size:1.15rem;">${client?.raison_sociale || visite.commande.client_id}</div>
        <div class="sous-titre" style="margin:0;">${visite.commande.id_commande} — zone ${client?.zone || '—'}</div>
      </div>
      <video id="video-scan" class="camera-scan" playsinline muted style="display:none;"></video>
      <canvas id="canvas-scan" style="display:none;"></canvas>
      <div id="zone-message"></div>
      <button class="gros-bouton gros-bouton-orange" id="btn-scanner">${icone('camera', 22)}Scanner le QR du client</button>
      <button class="gros-bouton gros-bouton-blanc" id="btn-manuel">Saisie manuelle (QR illisible)</button>
    </div>
  `;
  document.getElementById('btn-retour').addEventListener('click', () => naviguer('tournee'));

  document.getElementById('btn-scanner').addEventListener('click', async () => {
    const video = document.getElementById('video-scan');
    const canvas = document.getElementById('canvas-scan');
    const zoneMessage = document.getElementById('zone-message');
    video.style.display = 'block';

    const arreter = await demarrerScan(video, canvas, async (texte) => {
      arreter();
      video.style.display = 'none';
      await validerToken(texte, zoneMessage);
    }, (erreur) => { zoneMessage.innerHTML = `<div class="message-erreur">${erreur.message}</div>`; });
  });

  document.getElementById('btn-manuel').addEventListener('click', () => {
    const idSaisi = prompt('Entrez l\'identifiant du client (ex. CL-16-SUP-00042) :');
    if (!idSaisi) return;
    if (idSaisi.trim().toUpperCase() !== visite.commande.client_id) {
      document.getElementById('zone-message').innerHTML = `<div class="message-erreur">Cet identifiant ne correspond pas au client attendu pour cet arrêt.</div>`;
      return;
    }
    if (!confirm(`Confirmez-vous être bien chez ${client?.raison_sociale} (${visite.commande.client_id}) ?`)) return;
    finaliserArrivee(conteneur, null, etat, naviguer, visite);
  });

  async function validerToken(texte, zoneMessage) {
    // Contrôle « bon client / bon arrêt » : le token scanné doit correspondre
    // à l'identifiant client attendu pour cet arrêt (structure id.version.signature).
    const idScanne = texte.split('.')[0];
    if (idScanne !== visite.commande.client_id) {
      zoneMessage.innerHTML = `<div class="message-erreur">QR scanné ne correspond pas au client de cet arrêt !</div>`;
      return;
    }
    await finaliserArrivee(conteneur, texte, etat, naviguer, visite);
  }
}

async function finaliserArrivee(conteneur, tokenScanne, etat, naviguer, visite) {
  visite.scanQrToken = tokenScanne;
  visite.scanQrHeure = new Date().toISOString();
  try {
    visite.position = await positionGps();
  } catch {
    visite.position = null; // pas de GPS disponible : la livraison sera quand même enregistrée
  }
  visite.etape = 'livraison';
  etapeSuivante(conteneur, etat, naviguer);
}

// ============================================================================
// 2) Livraison — quantités livrées vs commandées + motif d'écart
// ============================================================================
function dessinerLivraison(conteneur, etat, naviguer, visite) {
  const lignes = visite.commande.commande_lignes || [];
  if (!visite.quantitesLivrees) {
    visite.quantitesLivrees = Object.fromEntries(lignes.map((l) => [l.produit_reference, l.quantite_commandee]));
  }

  conteneur.innerHTML = `
    <div class="entete-app"><span class="entete-espace"></span><h1>Livraison</h1><span class="entete-espace"></span></div>
    <div class="ecran">
      ${indicateurEtapes('livraison')}
      <p class="sous-titre">Ajustez les quantités réellement livrées.</p>
      <div id="liste-lignes"></div>
      <div id="zone-motif" style="display:none;">
        <div class="champ-app"><label>Motif de l'écart</label></div>
        <div class="motif-grille" id="grille-motif">
          ${Object.entries(LIBELLES_MOTIF).map(([v, l]) => `<button type="button" class="motif-bouton" data-motif="${v}">${l}</button>`).join('')}
        </div>
      </div>
      <button class="gros-bouton gros-bouton-orange" id="btn-continuer">Continuer</button>
    </div>
  `;

  const conteneurLignes = document.getElementById('liste-lignes');
  function dessinerLignes() {
    conteneurLignes.innerHTML = lignes.map((l) => `
      <div class="ligne-quantite">
        <span class="nom-produit">${l.produits?.designation || l.produit_reference}<br/><small style="color:#7A8299;">Commandé : ${l.quantite_commandee}</small></span>
        <div class="selecteur-nb">
          <button type="button" data-moins="${l.produit_reference}">−</button>
          <span>${visite.quantitesLivrees[l.produit_reference]}</span>
          <button type="button" data-plus="${l.produit_reference}">+</button>
        </div>
      </div>
    `).join('');
    conteneurLignes.querySelectorAll('[data-moins]').forEach((b) => b.addEventListener('click', () => ajuster(b.dataset.moins, -1)));
    conteneurLignes.querySelectorAll('[data-plus]').forEach((b) => b.addEventListener('click', () => ajuster(b.dataset.plus, 1)));
  }
  function ajuster(ref, delta) {
    const ligne = lignes.find((l) => l.produit_reference === ref);
    const nouvelle = Math.max(0, Math.min(ligne.quantite_commandee, visite.quantitesLivrees[ref] + delta));
    visite.quantitesLivrees[ref] = nouvelle;
    dessinerLignes();
    verifierEcart();
  }
  function verifierEcart() {
    const ecart = lignes.some((l) => visite.quantitesLivrees[l.produit_reference] < l.quantite_commandee);
    document.getElementById('zone-motif').style.display = ecart ? 'block' : 'none';
    if (!ecart) visite.motifEcart = null;
  }
  document.getElementById('grille-motif').addEventListener('click', (e) => {
    const bouton = e.target.closest('[data-motif]');
    if (!bouton) return;
    visite.motifEcart = bouton.dataset.motif;
    document.querySelectorAll('#grille-motif .motif-bouton').forEach((b) => b.classList.toggle('selectionne', b === bouton));
  });

  dessinerLignes();
  verifierEcart();

  document.getElementById('btn-continuer').addEventListener('click', () => {
    const ecart = lignes.some((l) => visite.quantitesLivrees[l.produit_reference] < l.quantite_commandee);
    if (ecart && !visite.motifEcart) { alert('Sélectionnez un motif pour l\'écart constaté.'); return; }
    visite.etape = 'preuve';
    etapeSuivante(conteneur, etat, naviguer);
  });
}

// ============================================================================
// 3) Preuve — photo compressée + signature + bon de livraison numéroté
// ============================================================================
async function dessinerPreuve(conteneur, etat, naviguer, visite) {
  if (!visite.numeroBL) visite.numeroBL = await prochainNumeroBL(etat.profil.matricule);

  conteneur.innerHTML = `
    <div class="entete-app"><span class="entete-espace"></span><h1>Preuve de livraison</h1><span class="entete-espace"></span></div>
    <div class="ecran">
      ${indicateurEtapes('preuve')}
      <div class="carte-app" style="text-align:center;">
        <div class="sous-titre" style="margin:0;">Bon de livraison n°</div>
        <div class="grand-titre">${visite.numeroBL}</div>
      </div>

      <div class="champ-app">
        <label>Photo (preuve de dépôt)</label>
        <input type="file" accept="image/*" capture="environment" id="champ-photo" />
        <div id="apercu-photo"></div>
      </div>

      <div class="champ-app">
        <label>Signature du client</label>
        <canvas id="pad-signature" class="pad-signature" width="600" height="240"></canvas>
        <button type="button" class="gros-bouton gros-bouton-blanc" id="btn-effacer-signature" style="margin-top:8px;">Effacer la signature</button>
      </div>

      <button class="gros-bouton gros-bouton-orange" id="btn-continuer">Continuer</button>
    </div>
  `;

  document.getElementById('champ-photo').addEventListener('change', async (e) => {
    const fichier = e.target.files[0];
    if (!fichier) return;
    visite.photoBlob = await compresserPhoto(fichier);
    document.getElementById('apercu-photo').innerHTML = `<p style="color:#1E7B3D; font-weight:700;">Photo capturée (${Math.round(visite.photoBlob.size / 1024)} Ko)</p>`;
  });

  const pad = creerPadSignature(document.getElementById('pad-signature'));
  document.getElementById('btn-effacer-signature').addEventListener('click', () => pad.effacer());

  document.getElementById('btn-continuer').addEventListener('click', async () => {
    if (!pad.estVide()) visite.signatureBlob = await pad.versBlob();
    visite.etape = 'encaissement';
    etapeSuivante(conteneur, etat, naviguer);
  });
}

async function prochainNumeroBL(matricule) {
  const cle = `compteur_bl_${new Date().toISOString().slice(0, 10)}_${matricule}`;
  const actuel = (await bd.lireMeta(cle)) || 0;
  const suivant = actuel + 1;
  await bd.ecrireMeta(cle, suivant);
  return `${matricule}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(suivant).padStart(3, '0')}`;
}

// ============================================================================
// 4) Encaissement — espèces / chèque / crédit
// ============================================================================
function dessinerEncaissement(conteneur, etat, naviguer, visite) {
  const lignes = visite.commande.commande_lignes || [];
  const total = lignes.reduce((s, l) => s + (visite.quantitesLivrees[l.produit_reference] || 0) * l.prix_unitaire, 0);

  conteneur.innerHTML = `
    <div class="entete-app"><span class="entete-espace"></span><h1>Paiement</h1><span class="entete-espace"></span></div>
    <div class="ecran">
      ${indicateurEtapes('encaissement')}
      <div class="carte-app" style="text-align:center;">
        <div class="sous-titre" style="margin:0;">Montant à encaisser</div>
        <div class="grand-titre">${total.toLocaleString('fr-FR')} DA</div>
      </div>
      <div class="motif-grille" id="grille-mode" style="grid-template-columns: repeat(3, 1fr);">
        <button type="button" class="motif-bouton" data-mode="especes">Espèces</button>
        <button type="button" class="motif-bouton" data-mode="cheque">Chèque</button>
        <button type="button" class="motif-bouton" data-mode="credit">Crédit</button>
      </div>
      <div class="champ-app">
        <label>Montant encaissé (DA)</label>
        <input type="number" id="champ-montant" value="${total}" min="0" step="1" />
      </div>
      <button class="gros-bouton gros-bouton-vert" id="btn-terminer">Terminer la livraison</button>
    </div>
  `;

  let mode = 'especes';
  document.getElementById('grille-mode').addEventListener('click', (e) => {
    const b = e.target.closest('[data-mode]');
    if (!b) return;
    mode = b.dataset.mode;
    document.querySelectorAll('#grille-mode .motif-bouton').forEach((x) => x.classList.toggle('selectionne', x === b));
  });
  document.querySelector('[data-mode="especes"]').classList.add('selectionne');

  document.getElementById('btn-terminer').addEventListener('click', async () => {
    const bouton = document.getElementById('btn-terminer');
    bouton.disabled = true;
    bouton.textContent = 'Enregistrement...';

    const montant = Number(document.getElementById('champ-montant').value) || 0;
    const matricule = etat.profil.matricule;
    const livraisonId = crypto.randomUUID();

    await bd.ajouterOperation('livraison', {
      id: livraisonId,
      uuid_creation: livraisonId,
      commande_id: visite.commande.id_commande,
      horodatage: new Date().toISOString(),
      lat: visite.position?.lat ?? null,
      lng: visite.position?.lng ?? null,
      scan_qr_token: visite.scanQrToken,
      scan_qr_heure: visite.scanQrHeure,
      quantites_livrees: Object.entries(visite.quantitesLivrees).map(([reference, quantite]) => ({ reference, quantite })),
      quantites_commandees: lignes.map((l) => ({ reference: l.produit_reference, quantite: l.quantite_commandee })),
      motif_ecart: visite.motifEcart || null,
      photo_blob: visite.photoBlob || null,
      signature_blob: visite.signatureBlob || null,
      livreur: matricule,
    });

    await bd.ajouterOperation('encaissement', {
      uuid_creation: crypto.randomUUID(),
      livraison_id: livraisonId,
      client_id: visite.commande.client_id,
      montant,
      mode,
      livreur: matricule,
    });

    await bd.ajouterOperation('maj_arret', { tournee_arret_id: visite.arret.id, statut: 'fait' });

    etat.visite = null;
    naviguer('tournee');
  });
}

export default { rendre };
