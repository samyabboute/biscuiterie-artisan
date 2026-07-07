import { exigerSession } from '../src/lib/auth.js';
import { construireShell } from '../src/lib/layout.js';
import { supabase } from '../src/lib/supabaseClient.js';

const ROLES_CREATION = ['super_admin', 'resp_logistique', 'agent_adv'];
const ROLES_VALIDATION = ['super_admin', 'comptable'];

const LIBELLES_MOTIF = { defectueux: 'Défectueux', perime: 'Périmé', casse: 'Cassé', autre: 'Autre' };
const LIBELLES_STATUT = {
  enregistre: { texte: 'Enregistré', classe: 'badge-bleu' },
  valide: { texte: 'Validé (avoir appliqué)', classe: 'badge-vert' },
  rejete: { texte: 'Rejeté', classe: 'badge-rouge' },
};

const etat = { profil: null, retours: [], clients: [], produits: [], livreurs: [] };

const profil = await exigerSession();
if (profil) {
  etat.profil = profil;
  const contenu = construireShell({ profil, moduleActifId: 'retours' });
  await demarrer(contenu);
}

async function demarrer(contenu) {
  contenu.innerHTML = `
    <div class="barre-outils">
      <select id="filtre-statut"><option value="">Tous les statuts</option>
        ${Object.entries(LIBELLES_STATUT).map(([v, l]) => `<option value="${v}">${l.texte}</option>`).join('')}
      </select>
      <div class="pousser">
        ${ROLES_CREATION.includes(profil.role) ? `<button type="button" class="bouton bouton-primaire" id="bouton-nouveau">+ Nouveau retour</button>` : ''}
      </div>
    </div>
    <div class="carte tableau-clients-conteneur">
      <table>
        <thead><tr><th>Client</th><th>Produit</th><th>Qté</th><th>Motif</th><th>Avoir</th><th>Statut</th><th>Date</th><th>Actions</th></tr></thead>
        <tbody id="corps-tableau"><tr><td colspan="8">Chargement...</td></tr></tbody>
      </table>
    </div>
  `;

  const [{ data: clients }, { data: produits }, { data: livreurs }] = await Promise.all([
    supabase.from('clients').select('id_client, raison_sociale, livreur_attitre').eq('statut', 'actif').order('raison_sociale'),
    supabase.from('produits').select('*').eq('statut', 'actif').order('designation'),
    supabase.from('employes').select('matricule, nom, prenom').eq('role', 'livreur'),
  ]);
  etat.clients = clients || [];
  etat.produits = produits || [];
  etat.livreurs = livreurs || [];

  document.getElementById('filtre-statut').addEventListener('change', chargerRetours);
  if (ROLES_CREATION.includes(profil.role)) document.getElementById('bouton-nouveau').addEventListener('click', () => ouvrirFormulaire());

  await chargerRetours();
}

async function chargerRetours() {
  const corps = document.getElementById('corps-tableau');
  const statut = document.getElementById('filtre-statut').value;

  let requete = supabase.from('retours_clients').select('*, clients(raison_sociale), produits(designation)').order('date_creation', { ascending: false });
  if (statut) requete = requete.eq('statut', statut);

  const { data, error } = await requete;
  if (error) { corps.innerHTML = `<tr><td colspan="8"><div class="message-erreur">${error.message}</div></td></tr>`; return; }

  etat.retours = data || [];
  corps.innerHTML = etat.retours.length === 0 ? `<tr><td colspan="8">Aucun retour.</td></tr>` : etat.retours.map((r) => {
    const s = LIBELLES_STATUT[r.statut] || { texte: r.statut, classe: 'badge-gris' };
    return `
      <tr data-id="${r.id}">
        <td>${echapper(r.clients?.raison_sociale || r.client_id)}</td>
        <td>${echapper(r.produits?.designation || r.produit_reference)}</td>
        <td>${r.quantite}</td>
        <td>${LIBELLES_MOTIF[r.motif] || r.motif}</td>
        <td>${Number(r.montant_avoir).toLocaleString('fr-FR')} DA</td>
        <td><span class="badge ${s.classe}">${s.texte}</span></td>
        <td>${new Date(r.date_creation).toLocaleDateString('fr-FR')}</td>
        <td class="col-actions">
          ${ROLES_VALIDATION.includes(etat.profil.role) && r.statut === 'enregistre' ? `
            <button type="button" class="bouton bouton-primaire" data-action="valider">Valider</button>
            <button type="button" class="bouton bouton-danger" data-action="rejeter">Rejeter</button>
          ` : ''}
        </td>
      </tr>
    `;
  }).join('');

  corps.querySelectorAll('button[data-action]').forEach((bouton) => {
    const id = bouton.closest('tr').dataset.id;
    const retour = etat.retours.find((r) => r.id === id);
    bouton.addEventListener('click', async () => {
      const action = bouton.dataset.action;
      if (action === 'valider') await changerStatut(retour, 'valide', 'Valider ce retour ? Le montant sera crédité au solde du client.');
      if (action === 'rejeter') await changerStatut(retour, 'rejete', 'Rejeter ce retour ?');
    });
  });
}

async function changerStatut(retour, statut, message) {
  if (!confirm(message)) return;
  const { error } = await supabase.from('retours_clients').update({ statut }).eq('id', retour.id);
  if (error) { alert(`Erreur : ${error.message}`); return; }
  await chargerRetours();
}

function ouvrirFormulaire() {
  const fond = document.createElement('div');
  fond.className = 'fond-modale';
  fond.innerHTML = `
    <div class="modale" style="max-width: 560px;">
      <div class="modale-entete">
        <h2>Nouveau retour produit</h2>
        <button type="button" class="modale-fermer" id="fermer">✕</button>
      </div>
      <div id="zone-message"></div>
      <form id="formulaire-retour">
        <div class="grille-champs">
          <div class="champ pleine-largeur">
            <label>Client *</label>
            <select name="client_id" required>
              <option value="">—</option>
              ${etat.clients.map((c) => `<option value="${c.id_client}" data-livreur="${c.livreur_attitre || ''}">${c.raison_sociale}</option>`).join('')}
            </select>
          </div>
          <div class="champ">
            <label>Produit *</label>
            <select name="produit_reference" required>
              ${etat.produits.map((p) => `<option value="${p.reference}">${p.designation}</option>`).join('')}
            </select>
          </div>
          <div class="champ">
            <label>Quantité *</label>
            <input type="number" name="quantite" min="1" value="1" required />
          </div>
          <div class="champ">
            <label>Motif *</label>
            <select name="motif" required>
              ${Object.entries(LIBELLES_MOTIF).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
            </select>
          </div>
          <div class="champ">
            <label>Montant de l'avoir (DA) *</label>
            <input type="number" name="montant_avoir" min="0" step="0.01" value="0" required />
          </div>
          <div class="champ pleine-largeur">
            <label>Livreur associé *</label>
            <select name="livreur" required>
              <option value="">—</option>
              ${etat.livreurs.map((l) => `<option value="${l.matricule}">${l.prenom} ${l.nom}</option>`).join('')}
            </select>
          </div>
          <div class="champ pleine-largeur">
            <label>Note</label>
            <textarea name="note" rows="2"></textarea>
          </div>
        </div>
        <div class="modale-actions">
          <button type="button" class="bouton bouton-secondaire" id="annuler">Annuler</button>
          <button type="submit" class="bouton bouton-primaire" id="bouton-enregistrer">Enregistrer le retour</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(fond);
  const fermer = () => fond.remove();
  fond.querySelector('#fermer').addEventListener('click', fermer);
  fond.querySelector('#annuler').addEventListener('click', fermer);

  const selectClient = fond.querySelector('[name="client_id"]');
  selectClient.addEventListener('change', () => {
    const livreurAttitre = selectClient.selectedOptions[0]?.dataset.livreur;
    if (livreurAttitre) fond.querySelector('[name="livreur"]').value = livreurAttitre;
  });

  fond.querySelector('#formulaire-retour').addEventListener('submit', async (e) => {
    e.preventDefault();
    const bouton = fond.querySelector('#bouton-enregistrer');
    bouton.disabled = true;
    const donnees = new FormData(e.target);

    const { error } = await supabase.from('retours_clients').insert({
      client_id: donnees.get('client_id'),
      produit_reference: donnees.get('produit_reference'),
      quantite: Number(donnees.get('quantite')),
      motif: donnees.get('motif'),
      montant_avoir: Number(donnees.get('montant_avoir')),
      livreur: donnees.get('livreur'),
      note: donnees.get('note').trim() || null,
      statut: 'enregistre',
      cree_par: etat.profil.matricule,
      uuid_creation: crypto.randomUUID(),
    });

    if (error) { fond.querySelector('#zone-message').innerHTML = `<div class="message-erreur">${error.message}</div>`; bouton.disabled = false; return; }
    fermer();
    await chargerRetours();
  });
}

function echapper(t) { const d = document.createElement('div'); d.textContent = t ?? ''; return d.innerHTML; }
