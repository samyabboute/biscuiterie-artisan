import * as bd from '../../src/lib/pwa/db.js';
import { compresserPhoto } from '../../src/lib/pwa/photo.js';

const LIBELLES_TYPE = { casse: 'Casse', avarie: 'Avarie', litige: 'Litige', vehicule: 'Véhicule' };

async function rendre(conteneur, { etat, naviguer, contexte }) {
  const clients = await bd.tousLesClients(etat.cleChiffrement);

  const ecran = document.createElement('div');
  ecran.innerHTML = `
    <div class="ecran">
      <h2 class="grand-titre">Signaler un incident</h2>
      <div class="motif-grille" id="grille-type">
        ${Object.entries(LIBELLES_TYPE).map(([v, l]) => `<button type="button" class="motif-bouton" data-type="${v}">${l}</button>`).join('')}
      </div>
      <div class="champ-app">
        <label>Client concerné (optionnel)</label>
        <select id="select-client"><option value="">—</option>${clients.map((c) => `<option value="${c.id_client}">${c.raison_sociale}</option>`).join('')}</select>
      </div>
      <div class="champ-app"><label>Note</label><textarea id="note" rows="3"></textarea></div>
      <div class="champ-app">
        <label>Photo</label>
        <input type="file" accept="image/*" capture="environment" id="champ-photo" />
        <div id="apercu-photo"></div>
      </div>
      <button class="gros-bouton gros-bouton-rouge" id="btn-enregistrer">Enregistrer l'incident</button>
    </div>
  `;
  conteneur.innerHTML = '';
  conteneur.appendChild(ecran);
  conteneur.appendChild(contexte.afficherNavigation('incidents'));

  let typeChoisi = null;
  let photoBlob = null;

  ecran.querySelector('#grille-type').addEventListener('click', (e) => {
    const b = e.target.closest('[data-type]');
    if (!b) return;
    typeChoisi = b.dataset.type;
    ecran.querySelectorAll('#grille-type .motif-bouton').forEach((x) => x.classList.toggle('selectionne', x === b));
  });

  ecran.querySelector('#champ-photo').addEventListener('change', async (e) => {
    const fichier = e.target.files[0];
    if (!fichier) return;
    photoBlob = await compresserPhoto(fichier);
    ecran.querySelector('#apercu-photo').innerHTML = `<p style="color:#1E7B3D; font-weight:700;">Photo capturée (${Math.round(photoBlob.size / 1024)} Ko)</p>`;
  });

  ecran.querySelector('#btn-enregistrer').addEventListener('click', async () => {
    if (!typeChoisi) { alert('Choisissez un type d\'incident.'); return; }

    await bd.ajouterOperation('incident', {
      uuid_creation: crypto.randomUUID(),
      type: typeChoisi,
      client_id: ecran.querySelector('#select-client').value || null,
      note: ecran.querySelector('#note').value.trim() || null,
      photo_blob: photoBlob,
      livreur: etat.profil.matricule,
    });

    alert('Incident enregistré localement. Il sera envoyé à la prochaine synchronisation.');
    naviguer('tournee');
  });
}

export default { rendre };
