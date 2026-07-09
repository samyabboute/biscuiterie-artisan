import { exigerSession } from '../src/lib/auth.js';
import { construireShell } from '../src/lib/layout.js';
import { supabase } from '../src/lib/supabaseClient.js';

const ROLES_ECRITURE = ['super_admin', 'directeur_commercial'];
const LIBELLES_STATUT = { actif: { texte: 'Actif', classe: 'badge-vert' }, archive: { texte: 'Archivé', classe: 'badge-gris' } };

const etat = { produits: [], peutEcrire: false };

const profil = await exigerSession();
if (profil) {
  etat.peutEcrire = ROLES_ECRITURE.includes(profil.role);
  const contenu = construireShell({ profil, moduleActifId: 'produits' });
  await demarrer(contenu);
}

async function demarrer(contenu) {
  contenu.innerHTML = `
    <p class="page-explication">
      Le catalogue produit : prix grossiste/détaillant, format carton et DLC. Ces références sont ensuite
      utilisées dans les <strong>commandes</strong> et le <strong>chargement</strong> des tournées.
    </p>
    <div class="barre-outils">
      <input type="search" id="champ-recherche" placeholder="Rechercher un produit..." />
      <div class="pousser">
        ${etat.peutEcrire ? `<button type="button" class="bouton bouton-primaire" id="bouton-nouveau">+ Nouveau produit</button>` : ''}
      </div>
    </div>
    <div class="carte tableau-clients-conteneur">
      <table>
        <thead>
          <tr>
            <th>Référence</th><th>Désignation</th><th>Format carton</th>
            <th>Prix grossiste</th><th>Prix détaillant</th><th>TVA</th><th>DLC</th><th>Statut</th><th>Actions</th>
          </tr>
        </thead>
        <tbody id="corps-tableau"><tr><td colspan="9">Chargement...</td></tr></tbody>
      </table>
    </div>
  `;

  if (etat.peutEcrire) document.getElementById('bouton-nouveau').addEventListener('click', () => ouvrirFormulaire(null));
  document.getElementById('champ-recherche').addEventListener('input', debattre(chargerProduits, 300));

  await chargerProduits();
}

async function chargerProduits() {
  const corps = document.getElementById('corps-tableau');
  const recherche = document.getElementById('champ-recherche').value.trim();
  let requete = supabase.from('produits').select('*').order('reference');
  if (recherche) requete = requete.or(`designation.ilike.%${recherche}%,reference.ilike.%${recherche}%`);

  const { data, error } = await requete;
  if (error) { corps.innerHTML = `<tr><td colspan="9"><div class="message-erreur">${error.message}</div></td></tr>`; return; }

  etat.produits = data || [];
  corps.innerHTML = etat.produits.length === 0 ? `<tr><td colspan="9">Aucun produit.</td></tr>` : etat.produits.map((p) => {
    const statut = LIBELLES_STATUT[p.statut] || { texte: p.statut, classe: 'badge-gris' };
    return `
      <tr data-ref="${p.reference}">
        <td><strong>${p.reference}</strong></td>
        <td>${echapper(p.designation)}</td>
        <td>${echapper(p.format_carton) || '—'}</td>
        <td>${Number(p.prix_grossiste).toLocaleString('fr-FR')} DA</td>
        <td>${Number(p.prix_detaillant).toLocaleString('fr-FR')} DA</td>
        <td>${p.tva}%</td>
        <td>${p.dlc || '—'}</td>
        <td><span class="badge ${statut.classe}">${statut.texte}</span></td>
        <td class="col-actions">
          ${etat.peutEcrire ? `<button type="button" class="bouton bouton-secondaire" data-action="modifier">Modifier</button>` : ''}
          ${etat.peutEcrire && p.statut !== 'archive' ? `<button type="button" class="bouton bouton-danger" data-action="archiver">Archiver</button>` : ''}
          ${etat.peutEcrire && p.statut === 'archive' ? `<button type="button" class="bouton bouton-primaire" data-action="reactiver">Réactiver</button>` : ''}
        </td>
      </tr>
    `;
  }).join('');

  corps.querySelectorAll('button[data-action]').forEach((bouton) => {
    const ref = bouton.closest('tr').dataset.ref;
    const produit = etat.produits.find((p) => p.reference === ref);
    bouton.addEventListener('click', async () => {
      const action = bouton.dataset.action;
      if (action === 'modifier') ouvrirFormulaire(produit);
      if (action === 'archiver') { await supabase.from('produits').update({ statut: 'archive' }).eq('reference', ref); await chargerProduits(); }
      if (action === 'reactiver') { await supabase.from('produits').update({ statut: 'actif' }).eq('reference', ref); await chargerProduits(); }
    });
  });
}

function ouvrirFormulaire(produit) {
  const enEdition = !!produit;
  const p = produit || { tva: 19 };
  const fond = document.createElement('div');
  fond.className = 'fond-modale';
  fond.innerHTML = `
    <div class="modale" style="max-width: 520px;">
      <div class="modale-entete">
        <h2>${enEdition ? `Modifier ${p.reference}` : 'Nouveau produit'}</h2>
        <button type="button" class="modale-fermer" id="fermer">✕</button>
      </div>
      <div id="zone-message"></div>
      <form id="formulaire-produit">
        <div class="grille-champs">
          <div class="champ">
            <label>Référence *</label>
            <input name="reference" required value="${valeur(p.reference)}" ${enEdition ? 'disabled' : ''} placeholder="BIS-XXX-000" />
          </div>
          <div class="champ">
            <label>Désignation *</label>
            <input name="designation" required value="${valeur(p.designation)}" />
          </div>
          <div class="champ">
            <label>Format carton</label>
            <input name="format_carton" value="${valeur(p.format_carton)}" placeholder="ex. Carton 24x200g" />
          </div>
          <div class="champ">
            <label>Lot</label>
            <input name="lot" value="${valeur(p.lot)}" />
          </div>
          <div class="champ">
            <label>Prix grossiste (DA) *</label>
            <input type="number" step="0.01" min="0" name="prix_grossiste" required value="${valeur(p.prix_grossiste)}" />
          </div>
          <div class="champ">
            <label>Prix détaillant (DA) *</label>
            <input type="number" step="0.01" min="0" name="prix_detaillant" required value="${valeur(p.prix_detaillant)}" />
          </div>
          <div class="champ">
            <label>TVA (%)</label>
            <input type="number" step="0.01" min="0" name="tva" value="${valeur(p.tva)}" />
          </div>
          <div class="champ">
            <label>DLC</label>
            <input type="date" name="dlc" value="${valeur(p.dlc)}" />
          </div>
        </div>
        <div class="modale-actions">
          <button type="button" class="bouton bouton-secondaire" id="annuler">Annuler</button>
          <button type="submit" class="bouton bouton-primaire" id="bouton-enregistrer">${enEdition ? 'Enregistrer' : 'Créer'}</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(fond);
  const fermer = () => fond.remove();
  fond.querySelector('#fermer').addEventListener('click', fermer);
  fond.querySelector('#annuler').addEventListener('click', fermer);
  fond.addEventListener('click', (e) => { if (e.target === fond) fermer(); });

  fond.querySelector('#formulaire-produit').addEventListener('submit', async (e) => {
    e.preventDefault();
    const bouton = fond.querySelector('#bouton-enregistrer');
    bouton.disabled = true;
    const donnees = new FormData(e.target);
    const payload = {
      designation: donnees.get('designation').trim(),
      format_carton: donnees.get('format_carton').trim() || null,
      lot: donnees.get('lot').trim() || null,
      prix_grossiste: Number(donnees.get('prix_grossiste')),
      prix_detaillant: Number(donnees.get('prix_detaillant')),
      tva: Number(donnees.get('tva') || 19),
      dlc: donnees.get('dlc') || null,
    };

    let resultat;
    if (enEdition) {
      resultat = await supabase.from('produits').update(payload).eq('reference', p.reference);
    } else {
      payload.reference = donnees.get('reference').trim().toUpperCase();
      payload.statut = 'actif';
      resultat = await supabase.from('produits').insert(payload);
    }

    if (resultat.error) {
      fond.querySelector('#zone-message').innerHTML = `<div class="message-erreur">${resultat.error.message}</div>`;
      bouton.disabled = false;
      return;
    }
    fermer();
    await chargerProduits();
  });
}

function valeur(v) { return v === null || v === undefined ? '' : v; }
function echapper(t) { const d = document.createElement('div'); d.textContent = t ?? ''; return d.innerHTML; }
function debattre(fn, delai) { let m; return (...a) => { clearTimeout(m); m = setTimeout(() => fn(...a), delai); }; }
