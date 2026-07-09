import { exigerSession } from '../src/lib/auth.js';
import { construireShell } from '../src/lib/layout.js';
import { supabase } from '../src/lib/supabaseClient.js';

const DEPARTEMENTS = { DIR: 'Direction', COM: 'Commercial', LOG: 'Logistique', ADV: 'ADV', FIN: 'Finance', DEP: 'Dépôt', LIV: 'Livraison' };
const ROLES = {
  super_admin: 'Super Admin', directeur_commercial: 'Directeur Commercial', resp_logistique: 'Resp. Logistique',
  superviseur_zone: 'Superviseur de zone', agent_adv: 'Agent ADV', comptable: 'Comptable',
  magasinier: 'Magasinier', livreur: 'Livreur',
};
const LIBELLES_STATUT = {
  actif: { texte: 'Actif', classe: 'badge-vert' }, suspendu: { texte: 'Suspendu', classe: 'badge-orange' }, archive: { texte: 'Archivé', classe: 'badge-gris' },
};

const etat = { employes: [], wilayas: [] };

const profil = await exigerSession();
if (profil) {
  const contenu = construireShell({ profil, moduleActifId: 'utilisateurs' });
  if (profil.role !== 'super_admin') {
    contenu.innerHTML = `<div class="message-erreur">Ce module est réservé au Super Admin.</div>`;
  } else {
    await demarrer(contenu);
  }
}

async function demarrer(contenu) {
  contenu.innerHTML = `
    <p class="page-explication">
      Créez ici les comptes de votre équipe (matricule + mot de passe) et attribuez leur <strong>rôle</strong>
      et leurs <strong>zones</strong> : cela détermine automatiquement ce qu'ils peuvent voir et faire dans
      tout le reste du système.
    </p>
    <div class="barre-outils">
      <input type="search" id="champ-recherche" placeholder="Rechercher (nom, matricule)..." />
      <select id="filtre-departement"><option value="">Tous les départements</option>
        ${Object.entries(DEPARTEMENTS).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
      </select>
      <div class="pousser">
        <button type="button" class="bouton bouton-primaire" id="bouton-nouveau">+ Nouvel utilisateur</button>
      </div>
    </div>
    <div class="carte tableau-clients-conteneur">
      <table>
        <thead><tr><th>Matricule</th><th>Nom</th><th>Département</th><th>Rôle</th><th>Zones</th><th>Statut</th><th>Actions</th></tr></thead>
        <tbody id="corps-tableau"><tr><td colspan="7">Chargement...</td></tr></tbody>
      </table>
    </div>
  `;

  const { data: wilayas } = await supabase.from('wilayas').select('code').order('code');
  etat.wilayas = wilayas || [];

  document.getElementById('bouton-nouveau').addEventListener('click', () => ouvrirFormulaire(null));
  document.getElementById('champ-recherche').addEventListener('input', debattre(chargerEmployes, 300));
  document.getElementById('filtre-departement').addEventListener('change', chargerEmployes);

  await chargerEmployes();
}

async function chargerEmployes() {
  const corps = document.getElementById('corps-tableau');
  const recherche = document.getElementById('champ-recherche').value.trim();
  const departement = document.getElementById('filtre-departement').value;

  let requete = supabase.from('employes').select('*').order('matricule');
  if (departement) requete = requete.eq('departement', departement);
  if (recherche) requete = requete.or(`nom.ilike.%${recherche}%,prenom.ilike.%${recherche}%,matricule.ilike.%${recherche}%`);

  const { data, error } = await requete;
  if (error) { corps.innerHTML = `<tr><td colspan="7"><div class="message-erreur">${error.message}</div></td></tr>`; return; }

  etat.employes = data || [];
  corps.innerHTML = etat.employes.length === 0 ? `<tr><td colspan="7">Aucun utilisateur.</td></tr>` : etat.employes.map((e) => {
    const statut = LIBELLES_STATUT[e.statut] || { texte: e.statut, classe: 'badge-gris' };
    return `
      <tr data-matricule="${e.matricule}">
        <td><strong>${e.matricule}</strong></td>
        <td>${e.prenom} ${e.nom}</td>
        <td>${DEPARTEMENTS[e.departement] || e.departement}</td>
        <td>${ROLES[e.role] || e.role}</td>
        <td><div class="zones-liste">${(e.zones_assignees || []).map((z) => `<span class="zone-puce">${z}</span>`).join('') || '—'}</div></td>
        <td><span class="badge ${statut.classe}">${statut.texte}</span></td>
        <td class="col-actions">
          <button type="button" class="bouton bouton-secondaire" data-action="modifier">Modifier</button>
          ${e.statut === 'actif' ? `<button type="button" class="bouton bouton-danger" data-action="suspendre">Suspendre</button>` : ''}
          ${e.statut === 'suspendu' ? `<button type="button" class="bouton bouton-primaire" data-action="reactiver">Réactiver</button>` : ''}
          ${e.statut !== 'archive' ? `<button type="button" class="bouton bouton-danger" data-action="archiver">Archiver</button>` : ''}
        </td>
      </tr>
    `;
  }).join('');

  corps.querySelectorAll('button[data-action]').forEach((bouton) => {
    const matricule = bouton.closest('tr').dataset.matricule;
    const employe = etat.employes.find((e) => e.matricule === matricule);
    bouton.addEventListener('click', async () => {
      const action = bouton.dataset.action;
      if (action === 'modifier') ouvrirFormulaire(employe);
      if (action === 'suspendre') await changerStatut(employe, 'suspendu');
      if (action === 'reactiver') await changerStatut(employe, 'actif');
      if (action === 'archiver') { if (confirm(`Archiver ${employe.prenom} ${employe.nom} ?`)) await changerStatut(employe, 'archive'); }
    });
  });
}

async function changerStatut(employe, statut) {
  const { error } = await supabase.from('employes').update({ statut }).eq('matricule', employe.matricule);
  if (error) { alert(`Erreur : ${error.message}`); return; }
  await chargerEmployes();
}

function ouvrirFormulaire(employe) {
  const enEdition = !!employe;
  const e = employe || { departement: 'ADV', role: 'agent_adv', zones_assignees: [] };

  const fond = document.createElement('div');
  fond.className = 'fond-modale';
  fond.innerHTML = `
    <div class="modale" style="max-width: 560px;">
      <div class="modale-entete">
        <h2>${enEdition ? `Modifier ${e.matricule}` : 'Nouvel utilisateur'}</h2>
        <button type="button" class="modale-fermer" id="fermer">✕</button>
      </div>
      <div id="zone-message"></div>
      <form id="formulaire-utilisateur">
        <div class="grille-champs">
          ${enEdition ? '' : `
            <div class="champ"><label>Prénom *</label><input name="prenom" required /></div>
            <div class="champ"><label>Nom *</label><input name="nom" required /></div>
          `}
          <div class="champ">
            <label>Département *</label>
            <select name="departement" required ${enEdition ? 'disabled' : ''}>
              ${Object.entries(DEPARTEMENTS).map(([v, l]) => `<option value="${v}" ${e.departement === v ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
          </div>
          <div class="champ">
            <label>Rôle *</label>
            <select name="role" required>
              ${Object.entries(ROLES).map(([v, l]) => `<option value="${v}" ${e.role === v ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
          </div>
          <div class="champ pleine-largeur"><label>Téléphone</label><input name="telephone" value="${valeur(e.telephone)}" /></div>
        </div>
        <div class="champ pleine-largeur">
          <label>Zones assignées (superviseurs / livreurs)</label>
          <div class="grille-zones">
            ${etat.wilayas.map((w) => `<label><input type="checkbox" name="zones" value="${w.code}" ${(e.zones_assignees || []).includes(w.code) ? 'checked' : ''} /> ${w.code}</label>`).join('')}
          </div>
        </div>
        <div class="modale-actions">
          <button type="button" class="bouton bouton-secondaire" id="annuler">Annuler</button>
          <button type="submit" class="bouton bouton-primaire" id="bouton-enregistrer">${enEdition ? 'Enregistrer' : 'Créer'}</button>
        </div>
      </form>
      <div id="zone-resultat"></div>
    </div>
  `;
  document.body.appendChild(fond);
  const fermer = () => { fond.remove(); chargerEmployes(); };
  fond.querySelector('#fermer').addEventListener('click', fermer);
  fond.querySelector('#annuler').addEventListener('click', fermer);

  fond.querySelector('#formulaire-utilisateur').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const bouton = fond.querySelector('#bouton-enregistrer');
    bouton.disabled = true;
    const donnees = new FormData(ev.target);
    const zones = donnees.getAll('zones');

    if (enEdition) {
      const { error } = await supabase.from('employes').update({
        role: donnees.get('role'),
        telephone: donnees.get('telephone').trim() || null,
        zones_assignees: zones,
      }).eq('matricule', e.matricule);
      if (error) { fond.querySelector('#zone-message').innerHTML = `<div class="message-erreur">${error.message}</div>`; bouton.disabled = false; return; }
      fermer();
      return;
    }

    const { data, error } = await supabase.rpc('fn_creer_employe', {
      p_nom: donnees.get('nom').trim(),
      p_prenom: donnees.get('prenom').trim(),
      p_departement: donnees.get('departement'),
      p_role: donnees.get('role'),
      p_telephone: donnees.get('telephone').trim() || null,
      p_zones_assignees: zones,
    });

    if (error) { fond.querySelector('#zone-message').innerHTML = `<div class="message-erreur">${error.message}</div>`; bouton.disabled = false; return; }

    const { matricule, mot_de_passe_provisoire } = data[0];
    fond.querySelector('#formulaire-utilisateur').style.display = 'none';
    fond.querySelector('#zone-resultat').innerHTML = `
      <div class="panneau-identifiants">
        <p style="margin-top:0;"><strong>Compte créé.</strong> Notez ces identifiants — le mot de passe ne sera plus jamais affiché :</p>
        <div class="ligne"><span>Matricule</span><strong>${matricule}</strong></div>
        <div class="ligne"><span>Mot de passe provisoire</span><strong>${mot_de_passe_provisoire}</strong></div>
      </div>
      <div class="modale-actions"><button type="button" class="bouton bouton-primaire" id="fermer-resultat">Terminé</button></div>
    `;
    fond.querySelector('#fermer-resultat').addEventListener('click', fermer);
  });
}

function valeur(v) { return v === null || v === undefined ? '' : v; }
function debattre(fn, delai) { let m; return (...a) => { clearTimeout(m); m = setTimeout(() => fn(...a), delai); }; }
