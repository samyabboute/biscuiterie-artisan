import { exigerSession } from '../src/lib/auth.js';
import { construireShell } from '../src/lib/layout.js';
import { supabase } from '../src/lib/supabaseClient.js';
import QRCode from 'qrcode';

const etat = { wilayas: [], livreurs: [], discipline: {} };

const profil = await exigerSession();
if (profil) {
  const contenu = construireShell({ profil, moduleActifId: 'distribution' });
  await demarrer(contenu);
}

async function demarrer(contenu) {
  const lienPwa = `${window.location.origin}${import.meta.env.BASE_URL}app/`;
  const dataUrlQr = await QRCode.toDataURL(lienPwa, { width: 240, margin: 1 });

  contenu.innerHTML = `
    <p class="page-explication">
      Ici vous gérez l'équipe terrain : livreurs, leur QR d'installation de l'app mobile, et leur suivi de
      synchronisation au quotidien. Un livreur doit d'abord exister ici avant de pouvoir se voir assigner une
      tournée.
    </p>
    <div class="carte carte-lien-pwa">
      <img src="${dataUrlQr}" alt="QR d'installation de l'app livreur" />
      <div>
        <h3 style="margin:0 0 4px;">Lien d'installation de l'app livreur</h3>
        <p style="margin:0 0 4px; color: var(--texte-attenue);">À transmettre au livreur (SMS, WhatsApp) ou à faire scanner directement.</p>
        <span class="lien-url">${lienPwa}</span>
      </div>
    </div>

    <div class="barre-outils">
      <h2 style="margin:0;">Livreurs</h2>
      <div class="pousser">
        <button type="button" class="bouton bouton-primaire" id="bouton-nouveau-livreur">+ Nouveau livreur</button>
      </div>
    </div>

    <div class="carte tableau-clients-conteneur">
      <table>
        <thead>
          <tr>
            <th>Matricule</th><th>Nom</th><th>Téléphone</th><th>Zones assignées</th>
            <th>Statut</th><th>Synchro (17h00)</th><th>Actions</th>
          </tr>
        </thead>
        <tbody id="corps-tableau"><tr><td colspan="7">Chargement...</td></tr></tbody>
      </table>
    </div>
  `;

  const { data: wilayas } = await supabase.from('wilayas').select('code, nom').order('code');
  etat.wilayas = wilayas || [];

  document.getElementById('bouton-nouveau-livreur').addEventListener('click', () => ouvrirFormulaireLivreur());

  await chargerLivreurs();
}

async function chargerLivreurs() {
  const corps = document.getElementById('corps-tableau');
  const [{ data: livreurs, error }, { data: discipline }] = await Promise.all([
    supabase.from('employes').select('*').eq('departement', 'LIV').order('matricule'),
    supabase.from('v_discipline_sync').select('matricule, derniere_sync, pastille'),
  ]);

  if (error) { corps.innerHTML = `<tr><td colspan="7"><div class="message-erreur">${error.message}</div></td></tr>`; return; }

  etat.livreurs = livreurs || [];
  etat.discipline = Object.fromEntries((discipline || []).map((d) => [d.matricule, d]));
  afficherTableau();
}

function afficherTableau() {
  const corps = document.getElementById('corps-tableau');
  if (etat.livreurs.length === 0) { corps.innerHTML = `<tr><td colspan="7">Aucun livreur.</td></tr>`; return; }

  const LIBELLES_STATUT = {
    actif: { texte: 'Actif', classe: 'badge-vert' },
    suspendu: { texte: 'Suspendu', classe: 'badge-orange' },
    archive: { texte: 'Archivé', classe: 'badge-gris' },
  };

  corps.innerHTML = etat.livreurs.map((l) => {
    const statut = LIBELLES_STATUT[l.statut] || { texte: l.statut, classe: 'badge-gris' };
    const d = etat.discipline[l.matricule];
    const pastille = d ? d.pastille : 'rouge';
    const heureSync = d?.derniere_sync ? new Date(d.derniere_sync).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : 'Aucune synchro aujourd\'hui';

    return `
      <tr data-matricule="${l.matricule}">
        <td><strong>${l.matricule}</strong></td>
        <td>${l.prenom} ${l.nom}</td>
        <td>${l.telephone || '—'}</td>
        <td><div class="zones-liste">${(l.zones_assignees || []).map((z) => `<span class="zone-puce">${z}</span>`).join('') || '—'}</div></td>
        <td><span class="badge ${statut.classe}">${statut.texte}</span></td>
        <td><span class="pastille pastille-${pastille}"></span>${heureSync}</td>
        <td class="col-actions">
          <button type="button" class="bouton bouton-secondaire" data-action="zones">Zones</button>
          ${l.statut === 'actif' ? `<button type="button" class="bouton bouton-danger" data-action="suspendre">Suspendre l'accès</button>` : ''}
          ${l.statut === 'suspendu' ? `<button type="button" class="bouton bouton-primaire" data-action="reactiver">Réactiver</button>` : ''}
        </td>
      </tr>
    `;
  }).join('');

  corps.querySelectorAll('button[data-action]').forEach((bouton) => {
    const matricule = bouton.closest('tr').dataset.matricule;
    const livreur = etat.livreurs.find((l) => l.matricule === matricule);
    bouton.addEventListener('click', async () => {
      const action = bouton.dataset.action;
      if (action === 'zones') ouvrirFormulaireZones(livreur);
      if (action === 'suspendre') await suspendre(livreur);
      if (action === 'reactiver') await reactiver(livreur);
    });
  });
}

async function suspendre(livreur) {
  if (!confirm(`Suspendre l'accès de ${livreur.prenom} ${livreur.nom} (${livreur.matricule}) ?\n\nEffet immédiat : il ne pourra plus se connecter, et les données de son terminal seront purgées à sa prochaine tentative de connexion.`)) return;
  const { error } = await supabase.from('employes').update({ statut: 'suspendu' }).eq('matricule', livreur.matricule);
  if (error) { alert(`Erreur : ${error.message}`); return; }
  await chargerLivreurs();
}

async function reactiver(livreur) {
  const { error } = await supabase.from('employes').update({ statut: 'actif' }).eq('matricule', livreur.matricule);
  if (error) { alert(`Erreur : ${error.message}`); return; }
  await chargerLivreurs();
}

// ----------------------------------------------------------------------------
// Formulaire de création
// ----------------------------------------------------------------------------
function ouvrirFormulaireLivreur() {
  const fond = document.createElement('div');
  fond.className = 'fond-modale';
  fond.innerHTML = `
    <div class="modale" style="max-width: 560px;">
      <div class="modale-entete">
        <h2>Nouveau livreur</h2>
        <button type="button" class="modale-fermer" id="fermer">✕</button>
      </div>
      <div id="zone-message"></div>
      <form id="formulaire-livreur">
        <div class="grille-champs">
          <div class="champ"><label>Prénom *</label><input name="prenom" required /></div>
          <div class="champ"><label>Nom *</label><input name="nom" required /></div>
          <div class="champ pleine-largeur"><label>Téléphone</label><input name="telephone" /></div>
        </div>
        <div class="champ pleine-largeur">
          <label>Zones assignées (wilayas)</label>
          <div class="grille-zones">
            ${etat.wilayas.map((w) => `<label><input type="checkbox" name="zones" value="${w.code}" /> ${w.code}</label>`).join('')}
          </div>
        </div>
        <div class="modale-actions">
          <button type="button" class="bouton bouton-secondaire" id="annuler">Annuler</button>
          <button type="submit" class="bouton bouton-primaire" id="bouton-enregistrer">Créer le livreur</button>
        </div>
      </form>
      <div id="zone-resultat"></div>
    </div>
  `;
  document.body.appendChild(fond);
  const fermer = () => { fond.remove(); chargerLivreurs(); };
  fond.querySelector('#fermer').addEventListener('click', fermer);
  fond.querySelector('#annuler').addEventListener('click', fermer);

  fond.querySelector('#formulaire-livreur').addEventListener('submit', async (e) => {
    e.preventDefault();
    const bouton = fond.querySelector('#bouton-enregistrer');
    bouton.disabled = true;
    bouton.textContent = 'Création...';

    const donnees = new FormData(e.target);
    const zones = donnees.getAll('zones');

    const { data, error } = await supabase.rpc('fn_creer_employe', {
      p_nom: donnees.get('nom').trim(),
      p_prenom: donnees.get('prenom').trim(),
      p_departement: 'LIV',
      p_role: 'livreur',
      p_telephone: donnees.get('telephone').trim() || null,
      p_zones_assignees: zones,
    });

    if (error) {
      fond.querySelector('#zone-message').innerHTML = `<div class="message-erreur">${error.message}</div>`;
      bouton.disabled = false;
      bouton.textContent = 'Créer le livreur';
      return;
    }

    const { matricule, mot_de_passe_provisoire } = data[0];
    fond.querySelector('#formulaire-livreur').style.display = 'none';
    fond.querySelector('#zone-resultat').innerHTML = `
      <div class="panneau-identifiants">
        <p style="margin-top:0;"><strong>Compte créé avec succès.</strong> Notez ces identifiants — le mot de passe ne sera plus jamais affiché :</p>
        <div class="ligne"><span>Matricule</span><strong>${matricule}</strong></div>
        <div class="ligne"><span>Mot de passe provisoire</span><strong>${mot_de_passe_provisoire}</strong></div>
      </div>
      <div class="modale-actions">
        <button type="button" class="bouton bouton-primaire" id="fermer-resultat">Terminé</button>
      </div>
    `;
    fond.querySelector('#fermer-resultat').addEventListener('click', fermer);
  });
}

// ----------------------------------------------------------------------------
// Modification des zones
// ----------------------------------------------------------------------------
function ouvrirFormulaireZones(livreur) {
  const fond = document.createElement('div');
  fond.className = 'fond-modale';
  fond.innerHTML = `
    <div class="modale" style="max-width: 480px;">
      <div class="modale-entete">
        <h2>Zones — ${livreur.prenom} ${livreur.nom}</h2>
        <button type="button" class="modale-fermer" id="fermer">✕</button>
      </div>
      <div id="zone-message"></div>
      <form id="formulaire-zones">
        <div class="grille-zones">
          ${etat.wilayas.map((w) => `<label><input type="checkbox" name="zones" value="${w.code}" ${(livreur.zones_assignees || []).includes(w.code) ? 'checked' : ''} /> ${w.code}</label>`).join('')}
        </div>
        <div class="modale-actions">
          <button type="button" class="bouton bouton-secondaire" id="annuler">Annuler</button>
          <button type="submit" class="bouton bouton-primaire">Enregistrer</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(fond);
  const fermer = () => fond.remove();
  fond.querySelector('#fermer').addEventListener('click', fermer);
  fond.querySelector('#annuler').addEventListener('click', fermer);

  fond.querySelector('#formulaire-zones').addEventListener('submit', async (e) => {
    e.preventDefault();
    const zones = new FormData(e.target).getAll('zones');
    const { error } = await supabase.from('employes').update({ zones_assignees: zones }).eq('matricule', livreur.matricule);
    if (error) { fond.querySelector('#zone-message').innerHTML = `<div class="message-erreur">${error.message}</div>`; return; }
    fermer();
    await chargerLivreurs();
  });
}
