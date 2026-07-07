import * as bd from '../../src/lib/pwa/db.js';
import { synchroniser } from '../../src/lib/pwa/sync.js';

async function rendre(conteneur, { etat, naviguer, contexte }) {
  const operations = await bd.toutesLesOperations();
  const aujourdHui = new Date().toISOString().slice(0, 10);
  const duJour = operations.filter((o) => o.cree_le.slice(0, 10) === aujourdHui);

  const livraisons = duJour.filter((o) => o.type === 'livraison');
  const encaissements = duJour.filter((o) => o.type === 'encaissement');
  const nouvellesCommandes = duJour.filter((o) => o.type === 'commande');
  const nouveauxClients = duJour.filter((o) => o.type === 'client');
  const incidents = duJour.filter((o) => o.type === 'incident');
  const enAttente = duJour.filter((o) => o.statut === 'en_attente' || o.statut === 'echec');

  const totalEncaisse = encaissements.reduce((s, o) => s + (o.payload.mode !== 'credit' ? Number(o.payload.montant) : 0), 0);
  const totalCredit = encaissements.reduce((s, o) => s + (o.payload.mode === 'credit' ? Number(o.payload.montant) : 0), 0);

  const ecran = document.createElement('div');
  ecran.innerHTML = `
    <div class="ecran">
      <h2 class="grand-titre">Fin de journée</h2>
      <div class="carte-app">
        <p><strong>Livraisons effectuées :</strong> ${livraisons.length}</p>
        <p><strong>Nouvelles commandes :</strong> ${nouvellesCommandes.length}</p>
        <p><strong>Nouveaux clients :</strong> ${nouveauxClients.length}</p>
        <p><strong>Incidents :</strong> ${incidents.length}</p>
        <p><strong>Encaissé (espèces/chèque) :</strong> ${totalEncaisse.toLocaleString('fr-FR')} DA</p>
        <p><strong>Différé (crédit) :</strong> ${totalCredit.toLocaleString('fr-FR')} DA</p>
        <p><strong>En attente d'envoi :</strong> ${enAttente.length} opération(s)</p>
      </div>

      <div class="carte-app" style="text-align:center;">
        <div class="sous-titre" style="margin:0;">Synchronisation avant 17h00</div>
        <div class="compte-a-rebours" id="compte-a-rebours"></div>
      </div>

      <div id="zone-resultat"></div>
      <button class="gros-bouton gros-bouton-orange" id="btn-sync">Synchroniser maintenant</button>
    </div>
  `;
  conteneur.innerHTML = '';
  conteneur.appendChild(ecran);
  conteneur.appendChild(contexte.afficherNavigation('fin-journee'));

  function majCompteARebours() {
    const maintenant = new Date();
    const limite = new Date(); limite.setHours(17, 0, 0, 0);
    const diffMs = limite - maintenant;
    const zone = ecran.querySelector('#compte-a-rebours');
    if (diffMs <= 0) {
      const retardMin = Math.round(-diffMs / 60000);
      zone.textContent = `Dépassé de ${retardMin} min`;
      zone.className = 'compte-a-rebours rouge';
    } else {
      const min = Math.floor(diffMs / 60000);
      const h = Math.floor(min / 60);
      const m = min % 60;
      zone.textContent = `${h}h ${String(m).padStart(2, '0')}min`;
      zone.className = `compte-a-rebours ${min <= 30 ? 'orange' : 'vert'}`;
    }
  }
  majCompteARebours();
  const intervalle = setInterval(majCompteARebours, 30000);
  window.addEventListener('hashchange', () => clearInterval(intervalle), { once: true });

  ecran.querySelector('#btn-sync').addEventListener('click', async () => {
    const bouton = ecran.querySelector('#btn-sync');
    const zoneResultat = ecran.querySelector('#zone-resultat');
    bouton.disabled = true;
    bouton.textContent = 'Synchronisation...';
    zoneResultat.innerHTML = '';
    try {
      const resume = await synchroniser(etat.profil.matricule, etat.cleChiffrement);
      zoneResultat.innerHTML = `<div class="message-info">Synchronisé : ${resume.montee} envoyé(s), ${resume.descente} reçu(s)${resume.erreurs ? `, ${resume.erreurs} erreur(s)` : ''}.</div>`;
      await rendre(conteneur, { etat, naviguer, contexte });
    } catch (e) {
      zoneResultat.innerHTML = `<div class="message-erreur">${e.message}</div>`;
      bouton.disabled = false;
      bouton.textContent = 'Synchroniser maintenant';
    }
  });
}

export default { rendre };
