import { exigerSession } from '../src/lib/auth.js';
import { construireShell, chargeurLogo } from '../src/lib/layout.js';
import { supabase } from '../src/lib/supabaseClient.js';

const LIBELLES_STATUT = {
  planifiee: { texte: 'Planifiée', classe: 'badge-bleu' },
  en_cours: { texte: 'En cours', classe: 'badge-orange' },
  terminee: { texte: 'Terminée', classe: 'badge-vert' },
  archivee: { texte: 'Archivée', classe: 'badge-gris' },
};

const etat = { profil: null, tournees: [], livreurs: [], produits: [] };

const profil = await exigerSession();
if (profil) {
  etat.profil = profil;
  const contenu = construireShell({ profil, moduleActifId: 'tournees' });
  await demarrer(contenu);
}

async function demarrer(contenu) {
  const aujourdHui = new Date().toISOString().slice(0, 10);
  contenu.innerHTML = `
    <p class="page-explication">
      Assemblez une tournée : choisissez un livreur, sélectionnez ses commandes validées, définissez le
      <strong>chargement</strong> (produits/quantités qui partent avec lui). Le livreur peut ensuite ajouter
      lui-même des commandes prises sur place depuis son application — elles apparaîtront ici après synchronisation.
    </p>
    <div class="barre-outils">
      <input type="date" id="filtre-date" value="${aujourdHui}" />
      <select id="filtre-livreur"><option value="">Tous les livreurs</option></select>
      <div class="pousser">
        <button type="button" class="bouton bouton-primaire" id="bouton-nouvelle">+ Nouvelle tournée</button>
      </div>
    </div>
    <div class="carte tableau-clients-conteneur">
      <table>
        <thead><tr><th>Tournée</th><th>Livreur</th><th>Date</th><th>Statut</th><th>Commandes assignées</th><th>Chargement</th><th>Actions</th></tr></thead>
        <tbody id="corps-tableau"><tr><td colspan="7">${chargeurLogo('Chargement...', true)}</td></tr></tbody>
      </table>
    </div>
  `;

  const [{ data: livreurs }, { data: produits }] = await Promise.all([
    supabase.from('employes').select('matricule, nom, prenom').eq('role', 'livreur').eq('statut', 'actif'),
    supabase.from('produits').select('*').eq('statut', 'actif').order('designation'),
  ]);
  etat.livreurs = livreurs || [];
  etat.produits = produits || [];

  const selectLivreur = document.getElementById('filtre-livreur');
  for (const l of etat.livreurs) {
    const o = document.createElement('option');
    o.value = l.matricule;
    o.textContent = `${l.prenom} ${l.nom}`;
    selectLivreur.appendChild(o);
  }

  document.getElementById('filtre-date').addEventListener('change', chargerTournees);
  document.getElementById('filtre-livreur').addEventListener('change', chargerTournees);
  document.getElementById('bouton-nouvelle').addEventListener('click', () => ouvrirConstructeur());

  await chargerTournees();
}

async function chargerTournees() {
  const corps = document.getElementById('corps-tableau');
  const date = document.getElementById('filtre-date').value;
  const livreur = document.getElementById('filtre-livreur').value;

  let requete = supabase.from('tournees').select('*, tournee_arrets(count)').order('date_tournee', { ascending: false });
  if (date) requete = requete.eq('date_tournee', date);
  if (livreur) requete = requete.eq('livreur', livreur);

  const { data, error } = await requete;
  if (error) { corps.innerHTML = `<tr><td colspan="7"><div class="message-erreur">${error.message}</div></td></tr>`; return; }

  etat.tournees = data || [];
  corps.innerHTML = etat.tournees.length === 0 ? `<tr><td colspan="7">Aucune tournée pour ces filtres.</td></tr>` : etat.tournees.map((t) => {
    const s = LIBELLES_STATUT[t.statut] || { texte: t.statut, classe: 'badge-gris' };
    const livreurInfo = etat.livreurs.find((l) => l.matricule === t.livreur);
    const nbArrets = t.tournee_arrets?.[0]?.count ?? 0;
    const nbChargement = (t.chargement_depart || []).length;
    return `
      <tr data-id="${t.id_tournee}">
        <td><strong>${t.id_tournee}</strong></td>
        <td>${livreurInfo ? `${livreurInfo.prenom} ${livreurInfo.nom}` : t.livreur}</td>
        <td>${t.date_tournee}</td>
        <td><span class="badge ${s.classe}">${s.texte}</span></td>
        <td>${nbArrets}</td>
        <td>${nbChargement > 0 ? `<span class="badge badge-vert">${nbChargement} produit(s)</span>` : `<span class="badge badge-gris">Non défini</span>`}</td>
        <td class="col-actions">
          <button type="button" class="bouton bouton-secondaire" data-action="arrets">Commandes</button>
          <button type="button" class="bouton bouton-secondaire" data-action="chargement">Chargement</button>
          <button type="button" class="bouton bouton-secondaire" data-action="retour">Retour invendus</button>
          ${t.statut === 'planifiee' ? `<button type="button" class="bouton bouton-primaire" data-action="demarrer">Démarrer</button>` : ''}
          ${t.statut === 'en_cours' ? `<button type="button" class="bouton bouton-primaire" data-action="terminer">Terminer</button>` : ''}
        </td>
      </tr>
    `;
  }).join('');

  corps.querySelectorAll('button[data-action]').forEach((bouton) => {
    const id = bouton.closest('tr').dataset.id;
    const tournee = etat.tournees.find((t) => t.id_tournee === id);
    bouton.addEventListener('click', async () => {
      const action = bouton.dataset.action;
      if (action === 'arrets') ouvrirArrets(tournee);
      if (action === 'chargement') ouvrirEditeurJsonb(tournee, 'chargement_depart', 'Chargement au départ');
      if (action === 'retour') ouvrirEditeurJsonb(tournee, 'retour', 'Retour invendus (fin de tournée)');
      if (action === 'demarrer') await changerStatutTournee(tournee, 'en_cours');
      if (action === 'terminer') await changerStatutTournee(tournee, 'terminee');
    });
  });
}

async function changerStatutTournee(tournee, statut) {
  const { error } = await supabase.from('tournees').update({ statut }).eq('id_tournee', tournee.id_tournee);
  if (error) { alert(`Erreur : ${error.message}`); return; }
  await chargerTournees();
}

// ----------------------------------------------------------------------------
// Constructeur de tournée
// ----------------------------------------------------------------------------
function ouvrirConstructeur() {
  let commandesDisponibles = [];
  const selection = []; // { id_commande, raison_sociale, zone }

  const fond = document.createElement('div');
  fond.className = 'fond-modale';
  fond.innerHTML = `
    <div class="modale">
      <div class="modale-entete">
        <h2>Nouvelle tournée</h2>
        <button type="button" class="modale-fermer" id="fermer">✕</button>
      </div>
      <div id="zone-message"></div>
      <div class="grille-champs">
        <div class="champ">
          <label>Livreur *</label>
          <select id="select-livreur" required>
            <option value="">—</option>
            ${etat.livreurs.map((l) => `<option value="${l.matricule}">${l.prenom} ${l.nom}</option>`).join('')}
          </select>
        </div>
        <div class="champ">
          <label>Date de tournée *</label>
          <input type="date" id="champ-date" value="${new Date().toISOString().slice(0, 10)}" required />
        </div>
      </div>

      <div class="champ pleine-largeur">
        <label>Commandes validées disponibles pour ce livreur</label>
        <div class="liste-choix-commandes" id="liste-disponibles"><em>Choisissez un livreur pour voir ses commandes.</em></div>
      </div>

      <div class="champ pleine-largeur">
        <label>Ordre de la tournée (glisser-déposer pour réordonner)</label>
        <div class="liste-arrets" id="liste-selection"><em>Aucun arrêt sélectionné.</em></div>
      </div>

      <div class="modale-actions">
        <button type="button" class="bouton bouton-secondaire" id="annuler">Annuler</button>
        <button type="button" class="bouton bouton-primaire" id="bouton-creer">Créer la tournée</button>
      </div>
    </div>
  `;
  document.body.appendChild(fond);
  const fermer = () => fond.remove();
  fond.querySelector('#fermer').addEventListener('click', fermer);
  fond.querySelector('#annuler').addEventListener('click', fermer);

  async function chargerCommandesDisponibles() {
    const livreur = fond.querySelector('#select-livreur').value;
    const conteneur = fond.querySelector('#liste-disponibles');
    if (!livreur) { conteneur.innerHTML = '<em>Choisissez un livreur pour voir ses commandes.</em>'; return; }

    conteneur.innerHTML = chargeurLogo('Chargement...', true);
    const { data: assignees } = await supabase.from('tournee_arrets').select('commande_id');
    const idsDejaAssignes = new Set((assignees || []).map((a) => a.commande_id));

    const { data, error } = await supabase.from('v_commandes_detail').select('*').eq('statut', 'validee');
    if (error) { conteneur.innerHTML = `<div class="message-erreur">${error.message}</div>`; return; }

    const livreurInfo = etat.livreurs.find((l) => l.matricule === livreur);
    commandesDisponibles = (data || []).filter((c) => !idsDejaAssignes.has(c.id_commande));

    if (commandesDisponibles.length === 0) {
      conteneur.innerHTML = '<em>Aucune commande validée disponible.</em>';
      return;
    }

    conteneur.innerHTML = commandesDisponibles.map((c) => `
      <label class="choix-commande">
        <input type="checkbox" value="${c.id_commande}" />
        <span><strong>${c.id_commande}</strong> — ${echapper(c.raison_sociale)} (zone ${c.zone}) — ${Number(c.total).toLocaleString('fr-FR')} DA</span>
      </label>
    `).join('');

    conteneur.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.addEventListener('change', () => {
        const commande = commandesDisponibles.find((c) => c.id_commande === cb.value);
        if (cb.checked) {
          if (!selection.find((s) => s.id_commande === commande.id_commande)) selection.push({ ...commande });
        } else {
          const i = selection.findIndex((s) => s.id_commande === commande.id_commande);
          if (i >= 0) selection.splice(i, 1);
        }
        redessinerSelection();
      });
    });
  }

  function redessinerSelection() {
    const conteneur = fond.querySelector('#liste-selection');
    if (selection.length === 0) { conteneur.innerHTML = '<em>Aucun arrêt sélectionné.</em>'; return; }
    conteneur.innerHTML = selection.map((s, i) => `
      <div class="arret-item" draggable="true" data-i="${i}">
        <span class="poignee">⠿</span>
        <span class="ordre">${i + 1}</span>
        <span class="infos"><span class="nom">${echapper(s.raison_sociale)}</span><br/><span class="sous">${s.id_commande} — zone ${s.zone}</span></span>
        <button type="button" class="bouton bouton-danger" data-retirer="${i}">✕</button>
      </div>
    `).join('');
    activerGlisserDeposer(conteneur, selection, redessinerSelection);
    conteneur.querySelectorAll('button[data-retirer]').forEach((b) => b.addEventListener('click', () => {
      const i = Number(b.dataset.retirer);
      selection.splice(i, 1);
      redessinerSelection();
      // décocher la case correspondante dans la liste disponible
      const checkbox = fond.querySelector(`#liste-disponibles input[value]`);
      fond.querySelectorAll('#liste-disponibles input[type="checkbox"]').forEach((cb) => {
        if (!selection.find((s) => s.id_commande === cb.value)) cb.checked = false;
      });
    }));
  }

  fond.querySelector('#select-livreur').addEventListener('change', chargerCommandesDisponibles);

  fond.querySelector('#bouton-creer').addEventListener('click', async () => {
    const zoneMessage = fond.querySelector('#zone-message');
    const livreur = fond.querySelector('#select-livreur').value;
    const date = fond.querySelector('#champ-date').value;
    if (!livreur || !date) { zoneMessage.innerHTML = `<div class="message-erreur">Choisissez un livreur et une date.</div>`; return; }
    if (selection.length === 0) { zoneMessage.innerHTML = `<div class="message-erreur">Sélectionnez au moins une commande.</div>`; return; }

    const bouton = fond.querySelector('#bouton-creer');
    bouton.disabled = true;
    bouton.textContent = 'Création...';

    const { data: tournee, error } = await supabase.from('tournees').insert({
      livreur, date_tournee: date, statut: 'planifiee', cree_par: etat.profil.matricule,
    }).select().single();

    if (error) { zoneMessage.innerHTML = `<div class="message-erreur">${error.message}</div>`; bouton.disabled = false; bouton.textContent = 'Créer la tournée'; return; }

    const { error: erreurArrets } = await supabase.from('tournee_arrets').insert(
      selection.map((s, i) => ({ tournee_id: tournee.id_tournee, commande_id: s.id_commande, ordre: i + 1, statut: 'a_faire' }))
    );
    if (erreurArrets) { zoneMessage.innerHTML = `<div class="message-erreur">${erreurArrets.message}</div>`; bouton.disabled = false; bouton.textContent = 'Créer la tournée'; return; }

    await supabase.from('commandes').update({ statut: 'en_tournee' }).in('id_commande', selection.map((s) => s.id_commande));

    fermer();
    await chargerTournees();
  });
}

// ----------------------------------------------------------------------------
// Détail des arrêts d'une tournée existante (réordonnancement tracé)
// ----------------------------------------------------------------------------
async function ouvrirArrets(tournee) {
  const { data: arrets, error } = await supabase
    .from('tournee_arrets')
    .select('*, commandes(client_id, clients(raison_sociale, zone))')
    .eq('tournee_id', tournee.id_tournee)
    .order('ordre');

  if (error) { alert(`Erreur : ${error.message}`); return; }

  let liste = (arrets || []).map((a) => ({
    id: a.id, commande_id: a.commande_id, statut: a.statut,
    raison_sociale: a.commandes?.clients?.raison_sociale || a.commande_id,
    zone: a.commandes?.clients?.zone || '—',
  }));

  const LIBELLES_ARRET = { a_faire: 'À faire', fait: 'Fait', reporte: 'Reporté' };

  const fond = document.createElement('div');
  fond.className = 'fond-modale';
  fond.innerHTML = `
    <div class="modale">
      <div class="modale-entete">
        <h2>Arrêts — ${tournee.id_tournee}</h2>
        <button type="button" class="modale-fermer" id="fermer">✕</button>
      </div>
      <div id="zone-message"></div>
      <div class="liste-arrets" id="liste-arrets-existants"></div>
      <p style="color: var(--texte-attenue); font-size: 0.85rem;">Glissez-déposez pour réordonner. Le nouvel ordre est enregistré au clic sur « Enregistrer l'ordre ».</p>
      <div class="modale-actions">
        <button type="button" class="bouton bouton-secondaire" id="fermer-2">Fermer</button>
        <button type="button" class="bouton bouton-primaire" id="bouton-sauver-ordre">Enregistrer l'ordre</button>
      </div>
    </div>
  `;
  document.body.appendChild(fond);
  const fermer = () => fond.remove();
  fond.querySelector('#fermer').addEventListener('click', fermer);
  fond.querySelector('#fermer-2').addEventListener('click', fermer);

  function redessiner() {
    const conteneur = fond.querySelector('#liste-arrets-existants');
    conteneur.innerHTML = liste.length === 0 ? '<em>Aucun arrêt.</em>' : liste.map((a, i) => `
      <div class="arret-item" draggable="true" data-i="${i}">
        <span class="poignee">⠿</span>
        <span class="ordre">${i + 1}</span>
        <span class="infos"><span class="nom">${echapper(a.raison_sociale)}</span><br/><span class="sous">${a.commande_id} — zone ${a.zone} — ${LIBELLES_ARRET[a.statut] || a.statut}</span></span>
      </div>
    `).join('');
    activerGlisserDeposer(conteneur, liste, redessiner);
  }
  redessiner();

  fond.querySelector('#bouton-sauver-ordre').addEventListener('click', async () => {
    const zoneMessage = fond.querySelector('#zone-message');
    const maj = liste.map((a, i) => supabase.from('tournee_arrets').update({ ordre: i + 1 }).eq('id', a.id));
    const resultats = await Promise.all(maj);
    const erreur = resultats.find((r) => r.error);
    if (erreur) { zoneMessage.innerHTML = `<div class="message-erreur">${erreur.error.message}</div>`; return; }
    zoneMessage.innerHTML = `<div class="message-info">Ordre enregistré.</div>`;
    await chargerTournees();
  });
}

// ----------------------------------------------------------------------------
// Éditeur générique pour chargement_depart / retour (jsonb [{reference, quantite}])
// ----------------------------------------------------------------------------
function ouvrirEditeurJsonb(tournee, colonne, titre) {
  const lignes = [...(tournee[colonne] || [])];

  const fond = document.createElement('div');
  fond.className = 'fond-modale';
  fond.innerHTML = `
    <div class="modale" style="max-width: 560px;">
      <div class="modale-entete">
        <h2>${titre} — ${tournee.id_tournee}</h2>
        <button type="button" class="modale-fermer" id="fermer">✕</button>
      </div>
      <div id="zone-message"></div>
      <div class="editeur-lignes-simple">
        <select id="select-produit" style="flex:2;">
          ${etat.produits.map((p) => `<option value="${p.reference}">${p.designation}</option>`).join('')}
        </select>
        <input type="number" id="champ-quantite" min="1" value="1" style="flex:1;" />
        <button type="button" class="bouton bouton-secondaire" id="bouton-ajouter">+ Ajouter</button>
      </div>
      <table>
        <thead><tr><th>Produit</th><th>Quantité</th><th></th></tr></thead>
        <tbody id="corps-lignes"></tbody>
      </table>
      <div class="modale-actions">
        <button type="button" class="bouton bouton-secondaire" id="annuler">Annuler</button>
        <button type="button" class="bouton bouton-primaire" id="bouton-sauver">Enregistrer</button>
      </div>
    </div>
  `;
  document.body.appendChild(fond);
  const fermer = () => fond.remove();
  fond.querySelector('#fermer').addEventListener('click', fermer);
  fond.querySelector('#annuler').addEventListener('click', fermer);

  function nomProduit(ref) { return etat.produits.find((p) => p.reference === ref)?.designation || ref; }

  function redessiner() {
    const corps = fond.querySelector('#corps-lignes');
    corps.innerHTML = lignes.length === 0 ? `<tr><td colspan="3">Aucune ligne.</td></tr>` : lignes.map((l, i) => `
      <tr><td>${nomProduit(l.reference)}</td><td>${l.quantite}</td><td><button type="button" class="bouton bouton-danger" data-i="${i}">✕</button></td></tr>
    `).join('');
    corps.querySelectorAll('button[data-i]').forEach((b) => b.addEventListener('click', () => { lignes.splice(Number(b.dataset.i), 1); redessiner(); }));
  }
  redessiner();

  fond.querySelector('#bouton-ajouter').addEventListener('click', () => {
    const ref = fond.querySelector('#select-produit').value;
    const qte = Number(fond.querySelector('#champ-quantite').value) || 1;
    const existante = lignes.find((l) => l.reference === ref);
    if (existante) existante.quantite += qte; else lignes.push({ reference: ref, quantite: qte });
    redessiner();
  });

  fond.querySelector('#bouton-sauver').addEventListener('click', async () => {
    const { error } = await supabase.from('tournees').update({ [colonne]: lignes }).eq('id_tournee', tournee.id_tournee);
    if (error) { fond.querySelector('#zone-message').innerHTML = `<div class="message-erreur">${error.message}</div>`; return; }
    fermer();
    await chargerTournees();
  });
}

// ----------------------------------------------------------------------------
// Glisser-déposer générique (réordonne un tableau JS en place puis redessine)
// ----------------------------------------------------------------------------
function activerGlisserDeposer(conteneur, tableau, redessiner) {
  let indexSource = null;
  conteneur.querySelectorAll('.arret-item').forEach((el) => {
    el.addEventListener('dragstart', () => { indexSource = Number(el.dataset.i); el.classList.add('en-glissement'); });
    el.addEventListener('dragend', () => el.classList.remove('en-glissement'));
    el.addEventListener('dragover', (e) => e.preventDefault());
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      const indexCible = Number(el.dataset.i);
      if (indexSource === null || indexSource === indexCible) return;
      const [elementDeplace] = tableau.splice(indexSource, 1);
      tableau.splice(indexCible, 0, elementDeplace);
      redessiner();
    });
  });
}

function echapper(t) { const d = document.createElement('div'); d.textContent = t ?? ''; return d.innerHTML; }
