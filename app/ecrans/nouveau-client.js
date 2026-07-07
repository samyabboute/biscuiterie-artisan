import * as bd from '../../src/lib/pwa/db.js';
import { position as positionGps } from '../../src/lib/pwa/gps.js';
import { icone } from '../../src/lib/icons.js';

const LIBELLES_TYPE = { GRO: 'Grossiste', SUP: 'Supérette', GMS: 'Grande surface', DET: 'Détaillant', CAF: 'Café / kiosque' };

async function rendre(conteneur, { etat, naviguer, contexte }) {
  const wilayas = await bd.toutesLesWilayas();

  const ecran = document.createElement('div');
  ecran.innerHTML = `
    <div class="ecran">
      <h2 class="grand-titre">Nouveau client</h2>
      <p class="sous-titre">La fiche sera envoyée en attente de validation par le siège.</p>
      <div class="champ-app"><label>Raison sociale *</label><input id="raison_sociale" required /></div>
      <div class="champ-app"><label>Type *</label><select id="type_client">${Object.entries(LIBELLES_TYPE).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></div>
      <div class="champ-app"><label>Gérant</label><input id="gerant" /></div>
      <div class="champ-app"><label>Téléphone</label><input id="tel_1" type="tel" /></div>
      <div class="champ-app"><label>Wilaya *</label><select id="wilaya"><option value="">—</option>${wilayas.map((w) => `<option value="${w.code}">${w.code} — ${w.nom}</option>`).join('')}</select></div>
      <div class="champ-app"><label>Commune *</label><input id="commune" required /></div>
      <div class="champ-app"><label>Adresse</label><input id="adresse" /></div>
      <div id="zone-gps" class="carte-app">Position GPS non capturée.</div>
      <button type="button" class="gros-bouton gros-bouton-blanc" id="btn-gps">${icone('mapPin', 22)}Capturer la position GPS</button>
      <button type="button" class="gros-bouton gros-bouton-orange" id="btn-enregistrer">Enregistrer le client</button>
    </div>
  `;
  conteneur.innerHTML = '';
  conteneur.appendChild(ecran);
  conteneur.appendChild(contexte.afficherNavigation('nouveau-client'));

  let coords = null;
  ecran.querySelector('#btn-gps').addEventListener('click', async () => {
    const zone = ecran.querySelector('#zone-gps');
    zone.textContent = 'Localisation en cours...';
    try {
      coords = await positionGps();
      zone.textContent = `Position capturée : ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`;
    } catch (e) {
      zone.textContent = e.message;
    }
  });

  ecran.querySelector('#btn-enregistrer').addEventListener('click', async () => {
    const raisonSociale = ecran.querySelector('#raison_sociale').value.trim();
    const wilaya = ecran.querySelector('#wilaya').value;
    const commune = ecran.querySelector('#commune').value.trim();
    if (!raisonSociale || !wilaya || !commune) { alert('Renseignez au moins la raison sociale, la wilaya et la commune.'); return; }

    const uuid = crypto.randomUUID();
    await bd.ajouterOperation('client', {
      uuid_creation: uuid,
      raison_sociale: raisonSociale,
      type_client: ecran.querySelector('#type_client').value,
      gerant: ecran.querySelector('#gerant').value.trim() || null,
      tel_1: ecran.querySelector('#tel_1').value.trim() || null,
      wilaya,
      commune,
      adresse: ecran.querySelector('#adresse').value.trim() || null,
      zone: wilaya,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      statut: 'en_attente_validation',
      cree_par: etat.profil.matricule,
      livreur_attitre: etat.profil.matricule,
    });

    alert(`Client enregistré localement (en attente de validation). Il sera envoyé à la prochaine synchronisation.`);
    naviguer('tournee');
  });
}

export default { rendre };
