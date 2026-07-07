import { exigerSession } from '../src/lib/auth.js';
import { construireShell } from '../src/lib/layout.js';
import { supabase } from '../src/lib/supabaseClient.js';
import QRCode from 'qrcode';
import { jsPDF } from 'jspdf';

const ROLES_ECRITURE = ['super_admin', 'directeur_commercial', 'agent_adv', 'superviseur_zone'];

const LIBELLES_TYPE = { GRO: 'Grossiste', SUP: 'Supérette', GMS: 'Grande surface', DET: 'Détaillant', CAF: 'Café / kiosque' };
const LIBELLES_STATUT = {
  actif: { texte: 'Actif', classe: 'badge-vert' },
  suspendu: { texte: 'Suspendu', classe: 'badge-orange' },
  archive: { texte: 'Archivé', classe: 'badge-gris' },
  en_attente_validation: { texte: 'À valider', classe: 'badge-bleu' },
};
const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

const etat = {
  profil: null,
  peutEcrire: false,
  wilayas: [],
  livreurs: [],
  clients: [],
  filtres: { recherche: '', wilaya: '', statut: '' },
};

const profil = await exigerSession();
if (profil) {
  etat.profil = profil;
  etat.peutEcrire = ROLES_ECRITURE.includes(profil.role);
  const contenu = construireShell({ profil, moduleActifId: 'clients' });
  await demarrer(contenu);
}

async function demarrer(contenu) {
  contenu.innerHTML = gabaritPage();
  await chargerReferences();
  remplirFiltreWilaya();
  remplirFiltreStatut();

  if (!etat.peutEcrire) {
    document.getElementById('bouton-nouveau-client').style.display = 'none';
  }

  document.getElementById('champ-recherche').addEventListener('input', debattre(async (e) => {
    etat.filtres.recherche = e.target.value.trim();
    await chargerClients();
  }, 300));
  document.getElementById('filtre-wilaya').addEventListener('change', async (e) => {
    etat.filtres.wilaya = e.target.value;
    await chargerClients();
  });
  document.getElementById('filtre-statut').addEventListener('change', async (e) => {
    etat.filtres.statut = e.target.value;
    await chargerClients();
  });
  document.getElementById('bouton-nouveau-client').addEventListener('click', () => ouvrirFormulaire(null));
  document.getElementById('bouton-export-planche').addEventListener('click', exporterPlancheSelection);

  await chargerClients();
}

function gabaritPage() {
  return `
    <div class="barre-outils">
      <input type="search" id="champ-recherche" placeholder="Rechercher (nom, ID, gérant)..." />
      <select id="filtre-wilaya"><option value="">Toutes les wilayas</option></select>
      <select id="filtre-statut"><option value="">Tous les statuts</option></select>
      <div class="pousser">
        <button type="button" class="bouton bouton-secondaire" id="bouton-export-planche">Exporter planche PDF (sélection)</button>
        <button type="button" class="bouton bouton-primaire" id="bouton-nouveau-client">+ Nouveau client</button>
      </div>
    </div>
    <div class="carte tableau-clients-conteneur">
      <table>
        <thead>
          <tr>
            <th><input type="checkbox" id="case-tout-selectionner" /></th>
            <th>ID</th>
            <th>Raison sociale</th>
            <th>Type</th>
            <th>Wilaya</th>
            <th>Commune</th>
            <th>Statut</th>
            <th>Solde</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody id="corps-tableau">
          <tr><td colspan="9">Chargement...</td></tr>
        </tbody>
      </table>
    </div>
  `;
}

async function chargerReferences() {
  const [{ data: wilayas }, { data: livreurs }] = await Promise.all([
    supabase.from('wilayas').select('code, nom').order('code'),
    supabase.from('employes').select('matricule, nom, prenom').eq('role', 'livreur').eq('statut', 'actif'),
  ]);
  etat.wilayas = wilayas || [];
  etat.livreurs = livreurs || [];
}

function remplirFiltreWilaya() {
  const select = document.getElementById('filtre-wilaya');
  for (const w of etat.wilayas) {
    const option = document.createElement('option');
    option.value = w.code;
    option.textContent = `${w.code} — ${w.nom}`;
    select.appendChild(option);
  }
}

function remplirFiltreStatut() {
  const select = document.getElementById('filtre-statut');
  for (const [valeur, { texte }] of Object.entries(LIBELLES_STATUT)) {
    const option = document.createElement('option');
    option.value = valeur;
    option.textContent = texte;
    select.appendChild(option);
  }
}

async function chargerClients() {
  const corps = document.getElementById('corps-tableau');
  corps.innerHTML = `<tr><td colspan="9">Chargement...</td></tr>`;

  let requete = supabase.from('clients').select('*').order('date_creation', { ascending: false });
  if (etat.filtres.wilaya) requete = requete.eq('wilaya', etat.filtres.wilaya);
  if (etat.filtres.statut) requete = requete.eq('statut', etat.filtres.statut);
  if (etat.filtres.recherche) {
    const motif = `%${etat.filtres.recherche}%`;
    requete = requete.or(`raison_sociale.ilike.${motif},id_client.ilike.${motif},gerant.ilike.${motif}`);
  }

  const { data, error } = await requete;
  if (error) {
    corps.innerHTML = `<tr><td colspan="9"><div class="message-erreur">Erreur de chargement : ${error.message}</div></td></tr>`;
    return;
  }

  etat.clients = data || [];
  afficherTableau();
}

function afficherTableau() {
  const corps = document.getElementById('corps-tableau');
  if (etat.clients.length === 0) {
    corps.innerHTML = `<tr><td colspan="9">Aucun client trouvé.</td></tr>`;
    return;
  }

  corps.innerHTML = etat.clients.map((c) => {
    const statut = LIBELLES_STATUT[c.statut] || { texte: c.statut, classe: 'badge-gris' };
    return `
      <tr data-id="${c.id_client}">
        <td><input type="checkbox" class="case-selection" value="${c.id_client}" /></td>
        <td><strong>${c.id_client}</strong></td>
        <td>${echapper(c.raison_sociale)}</td>
        <td>${LIBELLES_TYPE[c.type_client] || c.type_client}</td>
        <td>${c.wilaya}</td>
        <td>${echapper(c.commune)}</td>
        <td class="col-statut"><span class="badge ${statut.classe}">${statut.texte}</span></td>
        <td>${Number(c.solde).toLocaleString('fr-FR')} DA</td>
        <td class="col-actions">
          <button type="button" class="bouton bouton-secondaire" data-action="voir">Fiche / QR</button>
          ${etat.peutEcrire ? `<button type="button" class="bouton bouton-secondaire" data-action="modifier">Modifier</button>` : ''}
          ${etat.peutEcrire && c.statut === 'en_attente_validation' ? `<button type="button" class="bouton bouton-primaire" data-action="valider">Valider</button>` : ''}
          ${etat.peutEcrire && c.statut !== 'archive' ? `<button type="button" class="bouton bouton-danger" data-action="archiver">Archiver</button>` : ''}
        </td>
      </tr>
    `;
  }).join('');

  corps.querySelectorAll('button[data-action]').forEach((bouton) => {
    const id = bouton.closest('tr').dataset.id;
    const client = etat.clients.find((c) => c.id_client === id);
    bouton.addEventListener('click', () => {
      const action = bouton.dataset.action;
      if (action === 'voir') afficherFicheEtQr(client);
      if (action === 'modifier') ouvrirFormulaire(client);
      if (action === 'valider') validerClient(client);
      if (action === 'archiver') archiverClient(client);
    });
  });

  document.getElementById('case-tout-selectionner').addEventListener('change', (e) => {
    corps.querySelectorAll('.case-selection').forEach((c) => { c.checked = e.target.checked; });
  });
}

// ----------------------------------------------------------------------------
// Création / édition
// ----------------------------------------------------------------------------
function ouvrirFormulaire(client) {
  const enEdition = !!client;
  const c = client || {
    type_client: 'SUP', wilaya: '', commune: '', zone: '', jours_passage: [],
    conditions_paiement: 'comptant', plafond_credit: 0, remise: 0,
  };

  const fond = document.createElement('div');
  fond.className = 'fond-modale';
  fond.innerHTML = `
    <div class="modale">
      <div class="modale-entete">
        <h2>${enEdition ? `Modifier ${c.id_client}` : 'Nouveau client'}</h2>
        <button type="button" class="modale-fermer" id="fermer-modale">✕</button>
      </div>
      <div id="zone-message-formulaire"></div>
      <form id="formulaire-client">
        <div class="grille-champs">
          <div class="champ pleine-largeur">
            <label>Raison sociale *</label>
            <input name="raison_sociale" required value="${valeur(c.raison_sociale)}" />
          </div>
          <div class="champ">
            <label>Enseigne</label>
            <input name="enseigne" value="${valeur(c.enseigne)}" />
          </div>
          <div class="champ">
            <label>Type de client *</label>
            <select name="type_client" required ${enEdition ? 'disabled' : ''}>
              ${Object.entries(LIBELLES_TYPE).map(([v, l]) => `<option value="${v}" ${c.type_client === v ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
          </div>
          <div class="champ">
            <label>Gérant</label>
            <input name="gerant" value="${valeur(c.gerant)}" />
          </div>
          <div class="champ">
            <label>Téléphone 1</label>
            <input name="tel_1" value="${valeur(c.tel_1)}" />
          </div>
          <div class="champ">
            <label>Téléphone 2</label>
            <input name="tel_2" value="${valeur(c.tel_2)}" />
          </div>
          <div class="champ">
            <label>Email</label>
            <input type="email" name="email" value="${valeur(c.email)}" />
          </div>
          <div class="champ">
            <label>RC</label>
            <input name="rc" value="${valeur(c.rc)}" />
          </div>
          <div class="champ">
            <label>NIF</label>
            <input name="nif" value="${valeur(c.nif)}" />
          </div>
          <div class="champ">
            <label>AI</label>
            <input name="ai" value="${valeur(c.ai)}" />
          </div>
          <div class="champ">
            <label>Wilaya *</label>
            <select name="wilaya" required ${enEdition ? 'disabled' : ''}>
              <option value="">—</option>
              ${etat.wilayas.map((w) => `<option value="${w.code}" ${c.wilaya === w.code ? 'selected' : ''}>${w.code} — ${w.nom}</option>`).join('')}
            </select>
          </div>
          <div class="champ">
            <label>Commune *</label>
            <input name="commune" required value="${valeur(c.commune)}" />
          </div>
          <div class="champ pleine-largeur">
            <label>Adresse</label>
            <input name="adresse" value="${valeur(c.adresse)}" />
          </div>
          <div class="champ">
            <label>Latitude GPS</label>
            <input type="number" step="0.000001" name="lat" value="${valeur(c.lat)}" />
          </div>
          <div class="champ">
            <label>Longitude GPS</label>
            <input type="number" step="0.000001" name="lng" value="${valeur(c.lng)}" />
          </div>
          <div class="champ">
            <label>Zone (par défaut = wilaya)</label>
            <input name="zone" value="${valeur(c.zone)}" placeholder="ex. 16 ou 16-ROUIBA" />
          </div>
          <div class="champ">
            <label>Livreur attitré</label>
            <select name="livreur_attitre">
              <option value="">—</option>
              ${etat.livreurs.map((l) => `<option value="${l.matricule}" ${c.livreur_attitre === l.matricule ? 'selected' : ''}>${l.prenom} ${l.nom} (${l.matricule})</option>`).join('')}
            </select>
          </div>
          <div class="champ">
            <label>Conditions de paiement</label>
            <select name="conditions_paiement">
              <option value="comptant" ${c.conditions_paiement === 'comptant' ? 'selected' : ''}>Comptant</option>
              <option value="credit" ${c.conditions_paiement === 'credit' ? 'selected' : ''}>Crédit</option>
            </select>
          </div>
          <div class="champ">
            <label>Plafond crédit (DA)</label>
            <input type="number" step="0.01" min="0" name="plafond_credit" value="${valeur(c.plafond_credit)}" />
          </div>
          <div class="champ">
            <label>Remise (%)</label>
            <input type="number" step="0.01" min="0" max="100" name="remise" value="${valeur(c.remise)}" />
          </div>
        </div>

        <div class="champ pleine-largeur">
          <label>Jours de passage</label>
          <div class="jours-passage">
            ${JOURS.map((j) => `<label><input type="checkbox" name="jours_passage" value="${j}" ${(c.jours_passage || []).includes(j) ? 'checked' : ''}/> ${capitaliser(j)}</label>`).join('')}
          </div>
        </div>

        <div class="modale-actions">
          <button type="button" class="bouton bouton-secondaire" id="annuler-formulaire">Annuler</button>
          <button type="submit" class="bouton bouton-primaire" id="bouton-enregistrer">${enEdition ? 'Enregistrer' : 'Créer le client'}</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(fond);

  const fermer = () => fond.remove();
  fond.querySelector('#fermer-modale').addEventListener('click', fermer);
  fond.querySelector('#annuler-formulaire').addEventListener('click', fermer);
  fond.addEventListener('click', (e) => { if (e.target === fond) fermer(); });

  fond.querySelector('#formulaire-client').addEventListener('submit', async (e) => {
    e.preventDefault();
    await soumettreFormulaire(e.target, client, fond);
  });
}

async function soumettreFormulaire(formulaire, clientExistant, fond) {
  const zoneMessage = fond.querySelector('#zone-message-formulaire');
  const bouton = fond.querySelector('#bouton-enregistrer');
  bouton.disabled = true;
  bouton.textContent = 'Enregistrement...';

  const donnees = new FormData(formulaire);
  const jours = donnees.getAll('jours_passage');

  const payload = {
    raison_sociale: donnees.get('raison_sociale')?.trim(),
    enseigne: donnees.get('enseigne')?.trim() || null,
    gerant: donnees.get('gerant')?.trim() || null,
    tel_1: donnees.get('tel_1')?.trim() || null,
    tel_2: donnees.get('tel_2')?.trim() || null,
    email: donnees.get('email')?.trim() || null,
    rc: donnees.get('rc')?.trim() || null,
    nif: donnees.get('nif')?.trim() || null,
    ai: donnees.get('ai')?.trim() || null,
    commune: donnees.get('commune')?.trim(),
    adresse: donnees.get('adresse')?.trim() || null,
    lat: donnees.get('lat') ? Number(donnees.get('lat')) : null,
    lng: donnees.get('lng') ? Number(donnees.get('lng')) : null,
    zone: donnees.get('zone')?.trim() || donnees.get('wilaya'),
    livreur_attitre: donnees.get('livreur_attitre') || null,
    conditions_paiement: donnees.get('conditions_paiement'),
    plafond_credit: Number(donnees.get('plafond_credit') || 0),
    remise: Number(donnees.get('remise') || 0),
    jours_passage: jours,
  };

  let resultat;
  if (clientExistant) {
    resultat = await supabase.from('clients').update(payload).eq('id_client', clientExistant.id_client).select().single();
  } else {
    payload.wilaya = donnees.get('wilaya');
    payload.type_client = donnees.get('type_client');
    payload.statut = 'actif';
    resultat = await supabase.from('clients').insert(payload).select().single();
  }

  if (resultat.error) {
    zoneMessage.innerHTML = `<div class="message-erreur">Erreur : ${resultat.error.message}</div>`;
    bouton.disabled = false;
    bouton.textContent = clientExistant ? 'Enregistrer' : 'Créer le client';
    return;
  }

  fond.remove();
  await chargerClients();
  if (!clientExistant) afficherFicheEtQr(resultat.data);
}

async function validerClient(client) {
  const { error } = await supabase.from('clients').update({ statut: 'actif' }).eq('id_client', client.id_client);
  if (error) { alert(`Erreur : ${error.message}`); return; }
  await chargerClients();
}

async function archiverClient(client) {
  if (!confirm(`Archiver le client ${client.id_client} — ${client.raison_sociale} ?\nCette action n'est pas destructive : la fiche pourra être restaurée depuis les Archives.`)) return;
  const { error } = await supabase.from('clients').update({ statut: 'archive' }).eq('id_client', client.id_client);
  if (error) { alert(`Erreur : ${error.message}`); return; }
  await chargerClients();
}

// ----------------------------------------------------------------------------
// Fiche / QR
// ----------------------------------------------------------------------------
async function afficherFicheEtQr(client) {
  const dataUrlQr = await QRCode.toDataURL(client.qr_token, { width: 400, margin: 1 });

  const fond = document.createElement('div');
  fond.className = 'fond-modale';
  fond.innerHTML = `
    <div class="modale" style="max-width: 480px;">
      <div class="modale-entete">
        <h2>${echapper(client.raison_sociale)}</h2>
        <button type="button" class="modale-fermer" id="fermer-fiche">✕</button>
      </div>
      <p><strong>Type :</strong> ${LIBELLES_TYPE[client.type_client] || client.type_client} &nbsp; · &nbsp;
         <strong>Wilaya :</strong> ${client.wilaya} — ${client.commune}</p>
      <p><strong>Gérant :</strong> ${valeur(client.gerant) || '—'} &nbsp; · &nbsp; <strong>Tél. :</strong> ${valeur(client.tel_1) || '—'}</p>
      <p><strong>Conditions :</strong> ${client.conditions_paiement === 'credit' ? 'Crédit' : 'Comptant'}
         ${client.conditions_paiement === 'credit' ? ` (plafond ${Number(client.plafond_credit).toLocaleString('fr-FR')} DA)` : ''}
         &nbsp; · &nbsp; <strong>Solde :</strong> ${Number(client.solde).toLocaleString('fr-FR')} DA</p>

      <div class="panneau-qr">
        <img src="${dataUrlQr}" alt="QR code client" />
        <div class="id-client">${client.id_client}</div>
      </div>

      <div class="modale-actions">
        <button type="button" class="bouton bouton-secondaire" id="fermer-fiche-2">Fermer</button>
        <button type="button" class="bouton bouton-primaire" id="telecharger-etiquette">Télécharger l'étiquette (PDF)</button>
      </div>
    </div>
  `;
  document.body.appendChild(fond);

  const fermer = () => fond.remove();
  fond.querySelector('#fermer-fiche').addEventListener('click', fermer);
  fond.querySelector('#fermer-fiche-2').addEventListener('click', fermer);
  fond.addEventListener('click', (e) => { if (e.target === fond) fermer(); });
  fond.querySelector('#telecharger-etiquette').addEventListener('click', () => genererPlanchePdf([client]));
}

// ----------------------------------------------------------------------------
// Export planche PDF (étiquettes 70×70 mm)
// ----------------------------------------------------------------------------
async function exporterPlancheSelection() {
  const ids = [...document.querySelectorAll('.case-selection:checked')].map((c) => c.value);
  if (ids.length === 0) {
    alert('Sélectionnez au moins un client dans le tableau (case à cocher) avant d\'exporter.');
    return;
  }
  const clientsSelectionnes = etat.clients.filter((c) => ids.includes(c.id_client));
  await genererPlanchePdf(clientsSelectionnes);
}

async function genererPlanchePdf(clients) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const tailleEtiquette = 70;
  const marge = 15;
  const espacement = 10;
  const colonnes = 2;
  const lignes = 3;
  const parPage = colonnes * lignes;

  for (let i = 0; i < clients.length; i++) {
    const indexPage = Math.floor(i / parPage);
    const indexDansPage = i % parPage;
    if (indexDansPage === 0 && i !== 0) doc.addPage();

    const col = indexDansPage % colonnes;
    const ligne = Math.floor(indexDansPage / colonnes);
    const x = marge + col * (tailleEtiquette + espacement);
    const y = marge + ligne * (tailleEtiquette + espacement);

    const client = clients[i];
    const dataUrlQr = await QRCode.toDataURL(client.qr_token, { width: 300, margin: 0 });

    doc.setDrawColor(221, 227, 237);
    doc.roundedRect(x, y, tailleEtiquette, tailleEtiquette, 2, 2);

    doc.setFontSize(9);
    doc.setTextColor(197, 90, 17);
    doc.setFont(undefined, 'bold');
    doc.text("L'Artisan", x + tailleEtiquette / 2, y + 6, { align: 'center' });

    const tailleQr = 46;
    doc.addImage(dataUrlQr, 'PNG', x + (tailleEtiquette - tailleQr) / 2, y + 9, tailleQr, tailleQr);

    doc.setFontSize(10);
    doc.setTextColor(26, 31, 43);
    doc.setFont(undefined, 'bold');
    doc.text(client.id_client, x + tailleEtiquette / 2, y + 60, { align: 'center' });

    doc.setFontSize(7);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(91, 100, 120);
    const nom = client.raison_sociale.length > 28 ? client.raison_sociale.slice(0, 26) + '…' : client.raison_sociale;
    doc.text(nom, x + tailleEtiquette / 2, y + 65, { align: 'center' });
  }

  doc.save(clients.length === 1 ? `etiquette-${clients[0].id_client}.pdf` : `planche-etiquettes-${clients.length}-clients.pdf`);
}

// ----------------------------------------------------------------------------
// Utilitaires
// ----------------------------------------------------------------------------
function valeur(v) { return v === null || v === undefined ? '' : v; }
function echapper(texte) {
  const div = document.createElement('div');
  div.textContent = texte ?? '';
  return div.innerHTML;
}
function capitaliser(mot) { return mot.charAt(0).toUpperCase() + mot.slice(1); }
function debattre(fn, delai) {
  let minuteur;
  return (...args) => { clearTimeout(minuteur); minuteur = setTimeout(() => fn(...args), delai); };
}
