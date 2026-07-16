import * as bd from '../../src/lib/pwa/db.js';
import { icone } from '../../src/lib/icons.js';

const LIBELLES_STATUT = { a_faire: 'À faire', fait: 'Fait', reporte: 'Reporté' };
const ICONES_STATUT = { a_faire: 'package', fait: 'checkCircle', reporte: 'alertTriangle' };

function entete() {
  return `<div class="entete-app"><span class="entete-icone">${icone('truck', 20)}</span><h1>Ma tournée</h1><span class="entete-espace"></span></div>`;
}

async function rendre(conteneur, { etat, naviguer, contexte }) {
  conteneur.innerHTML = `${entete()}<div class="ecran"><p>Chargement de la tournée...</p></div>`;

  const toutes = await bd.toutesLesTournees();
  const aujourdHui = new Date().toISOString().slice(0, 10);
  const tournee = toutes.find((t) => t.date_tournee === aujourdHui);

  const ecran = document.createElement('div');
  ecran.className = 'ecran';

  if (!tournee) {
    ecran.innerHTML = `
      <p class="sous-titre" style="margin-top:2px;">${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      <div class="etat-vide-app">
        <div class="icone-cercle">${icone('truck', 26)}</div>
        <p>Aucune tournée synchronisée pour aujourd'hui. Synchronisez pour récupérer vos arrêts du jour.</p>
      </div>
      <button class="gros-bouton gros-bouton-orange" id="bouton-sync">${icone('sync', 20)}Synchroniser maintenant</button>
    `;
    conteneur.innerHTML = entete();
    conteneur.appendChild(ecran);
    conteneur.appendChild(contexte.afficherNavigation('tournee'));
    document.getElementById('bouton-sync').addEventListener('click', async (evenement) => {
      const bouton = evenement.currentTarget;
      bouton.disabled = true;
      bouton.textContent = 'Synchronisation...';
      const { synchroniser } = await import('../../src/lib/pwa/sync.js');
      try {
        await synchroniser(etat.profil.matricule, etat.cleChiffrement);
        await rendre(conteneur, { etat, naviguer, contexte });
      } catch (e) {
        alert(e.message);
        bouton.disabled = false;
        bouton.textContent = 'Synchroniser maintenant';
      }
    });
    return;
  }

  const arrets = [...(tournee.tournee_arrets || [])].sort((a, b) => a.ordre - b.ordre);

  ecran.innerHTML = `
    <p class="sous-titre" style="margin-top:2px;">${tournee.id_tournee} — ${arrets.length} arrêt(s)</p>
    <div id="liste-arrets"></div>
  `;
  conteneur.innerHTML = entete();
  conteneur.appendChild(ecran);
  conteneur.appendChild(contexte.afficherNavigation('tournee'));

  function dessinerListe() {
    const conteneurListe = ecran.querySelector('#liste-arrets');
    conteneurListe.innerHTML = arrets.map((a, i) => {
      const client = a.commandes?.clients;
      return `
        <div class="arret-carte" data-id="${a.id}">
          <div class="numero">${i + 1}</div>
          <div class="infos" data-ouvrir="${a.id}">
            <div class="nom">${client?.raison_sociale || a.commande_id}</div>
            <div class="sous">${a.commande_id}
              <span class="badge-arret badge-arret-${a.statut}">${icone(ICONES_STATUT[a.statut] || 'package', 12)}${LIBELLES_STATUT[a.statut] || a.statut}</span>
            </div>
          </div>
          <div class="fleches">
            <button type="button" data-monter="${i}" ${i === 0 ? 'disabled' : ''}>${icone('chevronUp', 16)}</button>
            <button type="button" data-descendre="${i}" ${i === arrets.length - 1 ? 'disabled' : ''}>${icone('chevronDown', 16)}</button>
          </div>
        </div>
      `;
    }).join('');

    conteneurListe.querySelectorAll('[data-ouvrir]').forEach((el) => el.addEventListener('click', () => {
      const arret = arrets.find((a) => a.id === el.dataset.ouvrir);
      etat.visite = { arret, commande: arret.commandes, client: arret.commandes?.clients, etape: 'arrivee' };
      naviguer('visite');
    }));
    conteneurListe.querySelectorAll('[data-monter]').forEach((b) => b.addEventListener('click', () => deplacer(Number(b.dataset.monter), -1)));
    conteneurListe.querySelectorAll('[data-descendre]').forEach((b) => b.addEventListener('click', () => deplacer(Number(b.dataset.descendre), 1)));
  }

  async function deplacer(index, direction) {
    const cible = index + direction;
    if (cible < 0 || cible >= arrets.length) return;
    [arrets[index], arrets[cible]] = [arrets[cible], arrets[index]];
    arrets.forEach((a, i) => { a.ordre = i + 1; });

    // Répercute le nouvel ordre localement puis en file d'attente de synchro
    // (réordonnancement tracé côté serveur via le déclencheur d'audit générique).
    tournee.tournee_arrets = arrets;
    await bd.enregistrerTournee(tournee);
    for (const a of arrets) {
      await bd.ajouterOperation('maj_arret', { tournee_arret_id: a.id, ordre: a.ordre });
    }
    dessinerListe();
  }

  dessinerListe();
}

export default { rendre };
