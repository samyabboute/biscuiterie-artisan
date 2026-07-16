import { exigerSession } from '../src/lib/auth.js';
import { construireShell, chargeurLogo } from '../src/lib/layout.js';
import { supabase } from '../src/lib/supabaseClient.js';

const ENTITES = ['employes', 'clients', 'produits', 'commandes', 'tournees', 'livraisons', 'encaissements', 'incidents', 'retours_clients'];

const profil = await exigerSession();
if (profil) {
  const contenu = construireShell({ profil, moduleActifId: 'audit' });
  if (profil.role !== 'super_admin') {
    contenu.innerHTML = `<div class="message-erreur">Ce module est réservé au Super Admin.</div>`;
  } else {
    await demarrer(contenu);
  }
}

async function demarrer(contenu) {
  contenu.innerHTML = `
    <p class="page-explication">
      Journal complet et infalsifiable de toutes les actions effectuées dans le système : qui a fait quoi,
      quand, et depuis quel appareil. Utile pour retracer une erreur ou vérifier une action sensible.
    </p>
    <div class="barre-outils">
      <select id="filtre-entite"><option value="">Toutes les entités</option>${ENTITES.map((e) => `<option value="${e}">${e}</option>`).join('')}</select>
      <input type="text" id="filtre-matricule" placeholder="Matricule (ex. ART-LIV-0001)" />
      <input type="date" id="filtre-date" />
    </div>
    <div class="carte tableau-clients-conteneur">
      <table>
        <thead><tr><th>Horodatage</th><th>Matricule</th><th>Action</th><th>Entité</th><th>ID</th><th>Terminal</th><th></th></tr></thead>
        <tbody id="corps-tableau"><tr><td colspan="7">${chargeurLogo('Chargement...', true)}</td></tr></tbody>
      </table>
    </div>
  `;

  ['filtre-entite', 'filtre-matricule', 'filtre-date'].forEach((id) => document.getElementById(id).addEventListener('input', debattre(charger, 300)));
  await charger();
}

async function charger() {
  const corps = document.getElementById('corps-tableau');
  const entite = document.getElementById('filtre-entite').value;
  const matricule = document.getElementById('filtre-matricule').value.trim();
  const date = document.getElementById('filtre-date').value;

  let requete = supabase.from('journal_audit').select('*').order('horodatage', { ascending: false }).limit(200);
  if (entite) requete = requete.eq('entite', entite);
  if (matricule) requete = requete.ilike('matricule', `%${matricule}%`);
  if (date) requete = requete.gte('horodatage', date).lt('horodatage', dateSuivante(date));

  const { data, error } = await requete;
  if (error) { corps.innerHTML = `<tr><td colspan="7"><div class="message-erreur">${error.message}</div></td></tr>`; return; }

  corps.innerHTML = (data || []).length === 0 ? `<tr><td colspan="7">Aucune entrée.</td></tr>` : data.map((entree) => `
    <tr>
      <td>${new Date(entree.horodatage).toLocaleString('fr-FR')}</td>
      <td>${entree.matricule || '—'}</td>
      <td><span class="badge ${entree.action === 'INSERT' ? 'badge-vert' : entree.action === 'UPDATE' ? 'badge-bleu' : 'badge-rouge'}">${entree.action}</span></td>
      <td>${entree.entite}</td>
      <td>${entree.entite_id || '—'}</td>
      <td>${entree.terminal || '—'}</td>
      <td><button type="button" class="bouton bouton-secondaire" data-detail='${btoa(encodeURIComponent(JSON.stringify(entree)))}'>Détail</button></td>
    </tr>
  `).join('');

  corps.querySelectorAll('[data-detail]').forEach((b) => b.addEventListener('click', () => afficherDetail(JSON.parse(decodeURIComponent(atob(b.dataset.detail))))));
}

function afficherDetail(entree) {
  const fond = document.createElement('div');
  fond.className = 'fond-modale';
  fond.innerHTML = `
    <div class="modale">
      <div class="modale-entete"><h2>${entree.entite} — ${entree.action}</h2><button type="button" class="modale-fermer" id="fermer">✕</button></div>
      <p><strong>Matricule :</strong> ${entree.matricule || '—'} &nbsp;·&nbsp; <strong>Horodatage :</strong> ${new Date(entree.horodatage).toLocaleString('fr-FR')}</p>
      <div class="grille-champs">
        <div><h4>Avant</h4><pre style="background:var(--fond); padding:10px; border-radius:8px; overflow:auto; max-height:300px; font-size:0.78rem;">${entree.avant ? echapper(JSON.stringify(entree.avant, null, 2)) : '—'}</pre></div>
        <div><h4>Après</h4><pre style="background:var(--fond); padding:10px; border-radius:8px; overflow:auto; max-height:300px; font-size:0.78rem;">${entree.apres ? echapper(JSON.stringify(entree.apres, null, 2)) : '—'}</pre></div>
      </div>
      <div class="modale-actions"><button type="button" class="bouton bouton-secondaire" id="fermer-2">Fermer</button></div>
    </div>
  `;
  document.body.appendChild(fond);
  const fermer = () => fond.remove();
  fond.querySelector('#fermer').addEventListener('click', fermer);
  fond.querySelector('#fermer-2').addEventListener('click', fermer);
  fond.addEventListener('click', (e) => { if (e.target === fond) fermer(); });
}

function dateSuivante(date) { const d = new Date(date); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); }
function echapper(t) { const d = document.createElement('div'); d.textContent = t ?? ''; return d.innerHTML; }
function debattre(fn, delai) { let m; return (...a) => { clearTimeout(m); m = setTimeout(() => fn(...a), delai); }; }
