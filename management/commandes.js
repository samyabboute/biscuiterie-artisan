import { exigerSession } from '../src/lib/auth.js';
import { construireShell, chargeurLogo } from '../src/lib/layout.js';
import { supabase } from '../src/lib/supabaseClient.js';

const LIBELLES_STATUT = {
  brouillon: { texte: 'Brouillon', classe: 'badge-gris' },
  validee: { texte: 'Validée', classe: 'badge-bleu' },
  en_tournee: { texte: 'En tournée', classe: 'badge-orange' },
  livree: { texte: 'Livrée', classe: 'badge-vert' },
  partielle: { texte: 'Partielle', classe: 'badge-orange' },
  annulee: { texte: 'Annulée', classe: 'badge-rouge' },
};

const etat = { profil: null, commandes: [], clients: [], produits: [] };

const profil = await exigerSession();
if (profil) {
  etat.profil = profil;
  const contenu = construireShell({ profil, moduleActifId: 'commandes' });
  await demarrer(contenu);
}

async function demarrer(contenu) {
  contenu.innerHTML = `
    <p class="page-explication">
      Créez une commande pour un client existant, puis validez-la (<strong>Brouillon → Validée</strong>) pour
      qu'elle devienne disponible dans <strong>Tournées</strong> et puisse être assignée à un livreur.
    </p>
    <div class="barre-outils">
      <select id="filtre-statut"><option value="">Tous les statuts</option>
        ${Object.entries(LIBELLES_STATUT).map(([v, l]) => `<option value="${v}">${l.texte}</option>`).join('')}
      </select>
      <input type="date" id="filtre-date" />
      <div class="pousser">
        <button type="button" class="bouton bouton-primaire" id="bouton-nouvelle">+ Nouvelle commande</button>
      </div>
    </div>
    <div class="carte tableau-clients-conteneur">
      <table>
        <thead><tr><th>Commande</th><th>Client</th><th>Wilaya</th><th>Date</th><th>Statut</th><th>Total</th><th>Actions</th></tr></thead>
        <tbody id="corps-tableau"><tr><td colspan="7">${chargeurLogo('Chargement...', true)}</td></tr></tbody>
      </table>
    </div>
  `;

  const [{ data: clients }, { data: produits }] = await Promise.all([
    supabase.from('clients').select('id_client, raison_sociale, type_client').eq('statut', 'actif').order('raison_sociale'),
    supabase.from('produits').select('*').eq('statut', 'actif').order('designation'),
  ]);
  etat.clients = clients || [];
  etat.produits = produits || [];

  document.getElementById('bouton-nouvelle').addEventListener('click', () => ouvrirFormulaire());
  document.getElementById('filtre-statut').addEventListener('change', chargerCommandes);
  document.getElementById('filtre-date').addEventListener('change', chargerCommandes);

  await chargerCommandes();

  // Arrivée depuis la fiche d'un client (ex. "+ Nouvelle commande pour ce
  // client" sur la Carte ou dans Clients) : on ouvre directement le
  // formulaire avec le client déjà sélectionné, sans étape supplémentaire.
  const clientPreselectionne = new URLSearchParams(window.location.search).get('client');
  if (clientPreselectionne) {
    ouvrirFormulaire(clientPreselectionne);
    window.history.replaceState({}, '', window.location.pathname);
  }
}

async function chargerCommandes() {
  const corps = document.getElementById('corps-tableau');
  const statut = document.getElementById('filtre-statut').value;
  const date = document.getElementById('filtre-date').value;

  let requete = supabase.from('v_commandes_detail').select('*').order('date_creation', { ascending: false });
  if (statut) requete = requete.eq('statut', statut);
  if (date) requete = requete.eq('date_commande', date);

  const { data, error } = await requete;
  if (error) { corps.innerHTML = `<tr><td colspan="7"><div class="message-erreur">${error.message}</div></td></tr>`; return; }

  etat.commandes = data || [];
  corps.innerHTML = etat.commandes.length === 0 ? `<tr><td colspan="7">Aucune commande.</td></tr>` : etat.commandes.map((c) => {
    const s = LIBELLES_STATUT[c.statut] || { texte: c.statut, classe: 'badge-gris' };
    return `
      <tr data-id="${c.id_commande}">
        <td><strong>${c.id_commande}</strong></td>
        <td>${echapper(c.raison_sociale)}</td>
        <td>${c.wilaya}</td>
        <td>${c.date_commande}</td>
        <td><span class="badge ${s.classe}">${s.texte}</span></td>
        <td>${Number(c.total).toLocaleString('fr-FR')} DA</td>
        <td class="col-actions">
          <button type="button" class="bouton bouton-secondaire" data-action="voir">Détail</button>
          ${c.statut === 'brouillon' ? `<button type="button" class="bouton bouton-primaire" data-action="valider">Valider</button>` : ''}
          ${['brouillon', 'validee'].includes(c.statut) ? `<button type="button" class="bouton bouton-danger" data-action="annuler">Annuler</button>` : ''}
        </td>
      </tr>
    `;
  }).join('');

  corps.querySelectorAll('button[data-action]').forEach((bouton) => {
    const id = bouton.closest('tr').dataset.id;
    const commande = etat.commandes.find((c) => c.id_commande === id);
    bouton.addEventListener('click', async () => {
      const action = bouton.dataset.action;
      if (action === 'voir') afficherDetail(commande);
      if (action === 'valider') await changerStatut(commande, 'validee');
      if (action === 'annuler') { if (confirm(`Annuler la commande ${commande.id_commande} ?`)) await changerStatut(commande, 'annulee'); }
    });
  });
}

async function changerStatut(commande, statut) {
  const { error } = await supabase.from('commandes').update({ statut }).eq('id_commande', commande.id_commande);
  if (error) { alert(`Erreur : ${error.message}`); return; }
  await chargerCommandes();
}

async function afficherDetail(commande) {
  const { data: lignes } = await supabase.from('commande_lignes').select('*, produits(designation)').eq('commande_id', commande.id_commande);
  const s = LIBELLES_STATUT[commande.statut] || { texte: commande.statut, classe: 'badge-gris' };

  const fond = document.createElement('div');
  fond.className = 'fond-modale';
  fond.innerHTML = `
    <div class="modale">
      <div class="modale-entete">
        <h2>${commande.id_commande}</h2>
        <button type="button" class="modale-fermer" id="fermer">✕</button>
      </div>
      <p><strong>Client :</strong> ${echapper(commande.raison_sociale)} (${commande.client_id}) &nbsp;·&nbsp;
         <strong>Statut :</strong> <span class="badge ${s.classe}">${s.texte}</span></p>
      <p><strong>Date :</strong> ${commande.date_commande} &nbsp;·&nbsp; <strong>Origine :</strong> ${commande.origine === 'livreur' ? 'Livreur (terrain)' : 'CRM'}</p>
      <table>
        <thead><tr><th>Produit</th><th>Quantité</th><th>Prix unitaire</th><th>Sous-total</th></tr></thead>
        <tbody>
          ${(lignes || []).map((l) => `
            <tr>
              <td>${l.produits?.designation || l.produit_reference}</td>
              <td>${l.quantite_commandee}</td>
              <td>${Number(l.prix_unitaire).toLocaleString('fr-FR')} DA</td>
              <td>${Number(l.quantite_commandee * l.prix_unitaire).toLocaleString('fr-FR')} DA</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <p style="text-align:right; font-weight:800; margin-top: var(--espace-3);">Total : ${Number(commande.total).toLocaleString('fr-FR')} DA</p>
      <div class="modale-actions"><button type="button" class="bouton bouton-secondaire" id="fermer-2">Fermer</button></div>
    </div>
  `;
  document.body.appendChild(fond);
  const fermer = () => fond.remove();
  fond.querySelector('#fermer').addEventListener('click', fermer);
  fond.querySelector('#fermer-2').addEventListener('click', fermer);
  fond.addEventListener('click', (e) => { if (e.target === fond) fermer(); });
}

// ----------------------------------------------------------------------------
// Nouvelle commande
// ----------------------------------------------------------------------------
function ouvrirFormulaire(clientPreselectionne) {
  const lignesCourantes = [];

  const fond = document.createElement('div');
  fond.className = 'fond-modale';
  fond.innerHTML = `
    <div class="modale">
      <div class="modale-entete">
        <h2>Nouvelle commande</h2>
        <button type="button" class="modale-fermer" id="fermer">✕</button>
      </div>
      <div id="zone-message"></div>
      <div class="grille-champs">
        <div class="champ">
          <label>Client *</label>
          <select id="select-client" required>
            <option value="">—</option>
            ${etat.clients.map((c) => `<option value="${c.id_client}" ${c.id_client === clientPreselectionne ? 'selected' : ''}>${c.raison_sociale} (${c.id_client})</option>`).join('')}
          </select>
        </div>
        <div class="champ">
          <label>Date de commande</label>
          <input type="date" id="champ-date" value="${new Date().toISOString().slice(0, 10)}" />
        </div>
      </div>

      <div class="champ pleine-largeur">
        <label>Lignes de commande</label>
        <div style="display:flex; gap: var(--espace-2); margin-bottom: var(--espace-3);">
          <select id="select-produit" style="flex:2;">
            ${etat.produits.map((p) => `<option value="${p.reference}">${p.designation}</option>`).join('')}
          </select>
          <input type="number" id="champ-quantite" min="1" value="1" style="flex:1;" />
          <button type="button" class="bouton bouton-secondaire" id="bouton-ajouter-ligne">+ Ajouter</button>
        </div>
        <table>
          <thead><tr><th>Produit</th><th>Qté</th><th>Prix unit.</th><th>Sous-total</th><th></th></tr></thead>
          <tbody id="corps-lignes"><tr><td colspan="5">Aucune ligne.</td></tr></tbody>
        </table>
        <p style="text-align:right; font-weight:800;" id="ligne-total">Total : 0 DA</p>
      </div>

      <div class="modale-actions">
        <button type="button" class="bouton bouton-secondaire" id="annuler">Annuler</button>
        <button type="button" class="bouton bouton-primaire" id="bouton-enregistrer">Créer la commande (brouillon)</button>
      </div>
    </div>
  `;
  document.body.appendChild(fond);
  const fermer = () => fond.remove();
  fond.querySelector('#fermer').addEventListener('click', fermer);
  fond.querySelector('#annuler').addEventListener('click', fermer);

  function prixPourClient(produit) {
    const clientId = fond.querySelector('#select-client').value;
    const client = etat.clients.find((c) => c.id_client === clientId);
    return client && client.type_client === 'GRO' ? produit.prix_grossiste : produit.prix_detaillant;
  }

  function redessinerLignes() {
    const corps = fond.querySelector('#corps-lignes');
    corps.innerHTML = lignesCourantes.length === 0 ? `<tr><td colspan="5">Aucune ligne.</td></tr>` : lignesCourantes.map((l, i) => `
      <tr>
        <td>${l.designation}</td>
        <td>${l.quantite}</td>
        <td>${Number(l.prix_unitaire).toLocaleString('fr-FR')} DA</td>
        <td>${Number(l.quantite * l.prix_unitaire).toLocaleString('fr-FR')} DA</td>
        <td><button type="button" class="bouton bouton-danger" data-i="${i}">✕</button></td>
      </tr>
    `).join('');
    corps.querySelectorAll('button[data-i]').forEach((b) => b.addEventListener('click', () => {
      lignesCourantes.splice(Number(b.dataset.i), 1);
      redessinerLignes();
    }));
    const total = lignesCourantes.reduce((s, l) => s + l.quantite * l.prix_unitaire, 0);
    fond.querySelector('#ligne-total').textContent = `Total : ${total.toLocaleString('fr-FR')} DA`;
  }

  fond.querySelector('#bouton-ajouter-ligne').addEventListener('click', () => {
    const ref = fond.querySelector('#select-produit').value;
    const produit = etat.produits.find((p) => p.reference === ref);
    const quantite = Number(fond.querySelector('#champ-quantite').value) || 1;
    if (!produit || quantite <= 0) return;

    const existante = lignesCourantes.find((l) => l.produit_reference === ref);
    if (existante) { existante.quantite += quantite; } else {
      lignesCourantes.push({ produit_reference: ref, designation: produit.designation, quantite, prix_unitaire: prixPourClient(produit) });
    }
    redessinerLignes();
  });

  fond.querySelector('#bouton-enregistrer').addEventListener('click', async () => {
    const clientId = fond.querySelector('#select-client').value;
    const zoneMessage = fond.querySelector('#zone-message');
    if (!clientId) { zoneMessage.innerHTML = `<div class="message-erreur">Choisissez un client.</div>`; return; }
    if (lignesCourantes.length === 0) { zoneMessage.innerHTML = `<div class="message-erreur">Ajoutez au moins une ligne.</div>`; return; }

    const bouton = fond.querySelector('#bouton-enregistrer');
    bouton.disabled = true;
    bouton.textContent = 'Création...';

    const { data: commande, error } = await supabase.from('commandes').insert({
      client_id: clientId,
      statut: 'brouillon',
      origine: 'admin',
      date_commande: fond.querySelector('#champ-date').value,
      cree_par: etat.profil.matricule,
      uuid_creation: crypto.randomUUID(),
    }).select().single();

    if (error) { zoneMessage.innerHTML = `<div class="message-erreur">${error.message}</div>`; bouton.disabled = false; bouton.textContent = 'Créer la commande (brouillon)'; return; }

    const { error: erreurLignes } = await supabase.from('commande_lignes').insert(
      lignesCourantes.map((l) => ({ commande_id: commande.id_commande, produit_reference: l.produit_reference, quantite_commandee: l.quantite, prix_unitaire: l.prix_unitaire }))
    );
    if (erreurLignes) { zoneMessage.innerHTML = `<div class="message-erreur">${erreurLignes.message}</div>`; bouton.disabled = false; bouton.textContent = 'Créer la commande (brouillon)'; return; }

    fermer();
    await chargerCommandes();
  });
}

function echapper(t) { const d = document.createElement('div'); d.textContent = t ?? ''; return d.innerHTML; }
