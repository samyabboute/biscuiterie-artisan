import { exigerSession } from '../src/lib/auth.js';
import { construireShell } from '../src/lib/layout.js';
import { supabase } from '../src/lib/supabaseClient.js';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const SEUIL_ZOOM_CLUSTER = 8;
const LIBELLES_MOTIF = { rupture: 'Rupture de stock', refus: 'Client refuse', ferme: 'Point fermé', dlc: 'DLC dépassée' };

const etat = { commandes: [], livraisonsParCommande: {}, incidentsParClient: {}, wilayas: [], livreurs: [], tousClients: [], carte: null, couche: null };

const profil = await exigerSession();
if (profil) {
  const contenu = construireShell({ profil, moduleActifId: 'carte' });
  await demarrer(contenu);
}

async function demarrer(contenu) {
  contenu.innerHTML = `
    <div id="carte-conteneur"></div>
    <div class="carte-barre-filtres">
      <input type="date" id="filtre-date" value="${new Date().toISOString().slice(0, 10)}" />
      <select id="filtre-wilaya"><option value="">Toutes les wilayas</option></select>
      <select id="filtre-livreur"><option value="">Tous les livreurs</option></select>
      <select id="filtre-statut">
        <option value="">Tous les statuts</option>
        <option value="orange">Validée (en attente)</option>
        <option value="bleu">En tournée</option>
        <option value="vert">Livrée</option>
        <option value="rouge">À contrôler / incident</option>
      </select>
      <div class="carte-stats" id="carte-stats"></div>
    </div>
    <div class="carte-legende">
      <span><span class="pastille" style="background:#C55A11;"></span> Validée</span>
      <span><span class="pastille" style="background:#1F3864;"></span> En tournée</span>
      <span><span class="pastille" style="background:#2E7D46;"></span> Livrée</span>
      <span><span class="pastille" style="background:#B3261E;"></span> À contrôler</span>
      <span><span class="pastille" style="background:#9AA1B2;"></span> Sans commande ce jour</span>
    </div>
  `;

  etat.carte = L.map('carte-conteneur', { zoomControl: true }).setView([33.8, 3], 6);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 18,
  }).addTo(etat.carte);
  etat.couche = L.layerGroup().addTo(etat.carte);
  etat.carte.on('zoomend', () => dessinerMarqueurs());

  const [{ data: wilayas }, { data: livreurs }, { data: tousClients }] = await Promise.all([
    supabase.from('wilayas').select('code, nom').order('code'),
    supabase.from('employes').select('matricule, nom, prenom').eq('role', 'livreur'),
    supabase.from('clients').select('id_client, raison_sociale, wilaya, commune, lat, lng, livreur_attitre, conditions_paiement, solde').eq('statut', 'actif'),
  ]);
  etat.wilayas = wilayas || [];
  etat.livreurs = livreurs || [];
  etat.tousClients = tousClients || [];
  const selectWilaya = document.getElementById('filtre-wilaya');
  for (const w of etat.wilayas) {
    const o = document.createElement('option'); o.value = w.code; o.textContent = `${w.code} — ${w.nom}`; selectWilaya.appendChild(o);
  }
  const selectLivreur = document.getElementById('filtre-livreur');
  for (const l of etat.livreurs) {
    const o = document.createElement('option'); o.value = l.matricule; o.textContent = `${l.prenom} ${l.nom}`; selectLivreur.appendChild(o);
  }

  ['filtre-date', 'filtre-wilaya', 'filtre-livreur', 'filtre-statut'].forEach((id) => {
    document.getElementById(id).addEventListener('change', chargerDonnees);
  });

  await chargerDonnees();
}

async function chargerDonnees() {
  const date = document.getElementById('filtre-date').value;

  const [{ data: commandes }, { data: livraisons }, { data: incidents }] = await Promise.all([
    supabase.from('v_commandes_detail').select('*').eq('date_commande', date),
    supabase.from('v_livraisons_detail').select('*').eq('date_commande', date),
    supabase.from('incidents').select('client_id').gte('date_creation', date).lt('date_creation', dateSuivante(date)),
  ]);

  etat.commandes = commandes || [];
  etat.livraisonsParCommande = Object.fromEntries((livraisons || []).map((l) => [l.commande_id, l]));
  etat.incidentsParClient = {};
  for (const i of incidents || []) { if (i.client_id) etat.incidentsParClient[i.client_id] = true; }

  dessinerMarqueurs();
}

function dateSuivante(date) {
  const d = new Date(date);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function statutAffiche(commande) {
  // Une commande annulée ou en brouillon n'a jamais de point sur la carte,
  // même si une livraison orpheline (créée avant l'annulation) porte un
  // flag « à contrôler » : le statut de la commande est prioritaire.
  if (commande.statut === 'annulee' || commande.statut === 'brouillon') return null;

  const livraison = etat.livraisonsParCommande[commande.id_commande];
  if ((livraison && livraison.flag_a_controler) || etat.incidentsParClient[commande.client_id]) return 'rouge';
  if (commande.statut === 'livree' || commande.statut === 'partielle') return 'vert';
  if (commande.statut === 'en_tournee') return 'bleu';
  if (commande.statut === 'validee') return 'orange';
  return null; // brouillon / annulée : non affichées sur la carte
}

function dessinerMarqueurs() {
  const filtreWilaya = document.getElementById('filtre-wilaya')?.value;
  const filtreLivreur = document.getElementById('filtre-livreur')?.value;
  const filtreStatut = document.getElementById('filtre-statut')?.value;

  const points = etat.commandes
    .filter((c) => c.lat && c.lng)
    .map((c) => ({ commande: c, statut: statutAffiche(c) }))
    .filter((p) => p.statut)
    .filter((p) => !filtreWilaya || p.commande.wilaya === filtreWilaya)
    .filter((p) => !filtreLivreur || p.commande.livreur === filtreLivreur)
    .filter((p) => !filtreStatut || p.statut === filtreStatut);

  // Le réseau de clients actifs reste visible même sans commande ce jour-là :
  // une carte qui n'affiche rien la plupart des jours donne l'impression
  // qu'elle « ne sert à rien ». Les clients déjà représentés par un point
  // coloré ne sont pas dupliqués en gris.
  const clientsAvecPoint = new Set(etat.commandes.filter((c) => c.lat && c.lng).map((c) => c.client_id));
  const clientsSansCommande = filtreStatut ? [] : etat.tousClients
    .filter((c) => c.lat && c.lng && !clientsAvecPoint.has(c.id_client))
    .filter((c) => !filtreWilaya || c.wilaya === filtreWilaya)
    .filter((c) => !filtreLivreur || c.livreur_attitre === filtreLivreur);

  etat.couche.clearLayers();

  if (etat.carte.getZoom() < SEUIL_ZOOM_CLUSTER) {
    dessinerClusters(points);
  } else {
    for (const p of points) dessinerMarqueurIndividuel(p);
  }
  for (const c of clientsSansCommande) dessinerMarqueurClientNeutre(c);

  dessinerStats(points, clientsSansCommande);
  dessinerEtatVide(points, clientsSansCommande);
}

function dessinerStats(points, clientsSansCommande) {
  const conteneur = document.getElementById('carte-stats');
  if (!conteneur) return;
  const compte = (statut) => points.filter((p) => p.statut === statut).length;
  conteneur.innerHTML = `
    <div class="stat"><span class="stat-valeur">${points.length}</span><span class="stat-libelle">Commandes affichées</span></div>
    <div class="stat"><span class="stat-valeur">${compte('rouge')}</span><span class="stat-libelle">À contrôler</span></div>
    <div class="stat"><span class="stat-valeur">${clientsSansCommande.length}</span><span class="stat-libelle">Clients sans commande</span></div>
  `;
}

function dessinerEtatVide(points, clientsSansCommande) {
  document.querySelector('.carte-etat-vide')?.remove();
  if (points.length > 0) return;
  const message = document.createElement('div');
  message.className = 'carte-etat-vide';
  message.textContent = clientsSansCommande.length > 0
    ? `Aucune commande à afficher pour cette sélection. Les ${clientsSansCommande.length} points gris sont vos clients actifs sans commande ce jour-là — cliquez sur l'un d'eux pour lui créer une commande.`
    : `Aucune commande ni client actif géolocalisé pour cette sélection.`;
  document.getElementById('carte-conteneur').parentElement.appendChild(message);
}

function dessinerMarqueurClientNeutre(client) {
  const icone = L.divIcon({ html: `<div class="marqueur-neutre"></div>`, className: '', iconSize: [14, 14] });
  const marqueur = L.marker([client.lat, client.lng], { icon: icone }).addTo(etat.couche);
  marqueur.on('click', () => ouvrirPanneauClientNeutre(client));
}

function dessinerClusters(points) {
  const parWilaya = {};
  for (const p of points) {
    const w = p.commande.wilaya;
    if (!parWilaya[w]) parWilaya[w] = [];
    parWilaya[w].push(p);
  }
  for (const [wilaya, groupe] of Object.entries(parWilaya)) {
    const latMoy = groupe.reduce((s, p) => s + Number(p.commande.lat), 0) / groupe.length;
    const lngMoy = groupe.reduce((s, p) => s + Number(p.commande.lng), 0) / groupe.length;
    const icone = L.divIcon({
      html: `<div class="marqueur-cluster" style="width:${28 + Math.min(groupe.length, 20)}px; height:${28 + Math.min(groupe.length, 20)}px;">${groupe.length}</div>`,
      className: '', iconSize: null,
    });
    const marqueur = L.marker([latMoy, lngMoy], { icon: icone }).addTo(etat.couche);
    marqueur.bindTooltip(`Wilaya ${wilaya} — ${groupe.length} commande(s)`);
    marqueur.on('click', () => etat.carte.setView([latMoy, lngMoy], SEUIL_ZOOM_CLUSTER + 1));
  }
}

function dessinerMarqueurIndividuel(p) {
  const icone = L.divIcon({ html: `<div class="marqueur-pulse marqueur-${p.statut}"></div>`, className: '', iconSize: [22, 22] });
  const marqueur = L.marker([p.commande.lat, p.commande.lng], { icon: icone }).addTo(etat.couche);
  marqueur.on('click', () => ouvrirPanneau(p.commande));
}

// Insère le panneau et déclenche son animation d'entrée (glissement +
// fondu) à la frame suivante ; la fermeture rejoue la même transition à
// l'envers avant de retirer l'élément du DOM.
function afficherPanneauAnime(panneau) {
  document.body.appendChild(panneau);
  requestAnimationFrame(() => panneau.classList.add('visible'));
}
function fermerPanneauAnime(panneau) {
  panneau.classList.remove('visible');
  panneau.addEventListener('transitionend', () => panneau.remove(), { once: true });
}

async function ouvrirPanneau(commande) {
  document.querySelector('.panneau-laterale-carte')?.remove();
  const livraison = etat.livraisonsParCommande[commande.id_commande];
  const livreurInfo = etat.livreurs.find((l) => l.matricule === commande.livreur);

  let urlPhoto = null;
  if (livraison?.photo_url) {
    const { data } = await supabase.storage.from('preuves').createSignedUrl(livraison.photo_url, 3600);
    urlPhoto = data?.signedUrl;
  }

  const panneau = document.createElement('div');
  panneau.className = 'panneau-laterale-carte';
  panneau.innerHTML = `
    <button type="button" class="modale-fermer" id="fermer-panneau" style="float:right;">✕</button>
    <h3>${echapper(commande.raison_sociale)}</h3>
    <p><strong>Commande :</strong> ${commande.id_commande}</p>
    <p><strong>Montant :</strong> ${Number(commande.total).toLocaleString('fr-FR')} DA</p>
    <p><strong>Livreur :</strong> ${livreurInfo ? `${livreurInfo.prenom} ${livreurInfo.nom}` : (commande.livreur || '—')}</p>
    <p><strong>Zone :</strong> ${commande.wilaya} — ${commande.zone}</p>
    ${livraison ? `
      <p><strong>Heure de scan :</strong> ${livraison.horodatage ? new Date(livraison.horodatage).toLocaleTimeString('fr-FR') : '—'}</p>
      ${livraison.motif_ecart ? `<p><strong>Motif d'écart :</strong> ${LIBELLES_MOTIF[livraison.motif_ecart] || livraison.motif_ecart}</p>` : ''}
      ${livraison.flag_a_controler ? `<div class="message-erreur">Scan à plus de 300 m de la fiche client (${Math.round(livraison.distance_gps_m)} m) — à contrôler.</div>` : ''}
      ${urlPhoto ? `<img src="${urlPhoto}" alt="Preuve de livraison" />` : ''}
    ` : `<p style="color:var(--texte-attenue);">Pas encore livrée.</p>`}
  `;
  afficherPanneauAnime(panneau);
  panneau.querySelector('#fermer-panneau').addEventListener('click', () => fermerPanneauAnime(panneau));
}

function ouvrirPanneauClientNeutre(client) {
  document.querySelector('.panneau-laterale-carte')?.remove();
  const livreurInfo = etat.livreurs.find((l) => l.matricule === client.livreur_attitre);
  const base = import.meta.env.BASE_URL;

  const panneau = document.createElement('div');
  panneau.className = 'panneau-laterale-carte';
  panneau.innerHTML = `
    <button type="button" class="modale-fermer" id="fermer-panneau" style="float:right;">✕</button>
    <h3>${echapper(client.raison_sociale)}</h3>
    <p><strong>Client :</strong> ${client.id_client}</p>
    <p><strong>Zone :</strong> ${client.wilaya} — ${echapper(client.commune)}</p>
    <p><strong>Livreur attitré :</strong> ${livreurInfo ? `${livreurInfo.prenom} ${livreurInfo.nom}` : '—'}</p>
    <p><strong>Conditions :</strong> ${client.conditions_paiement === 'credit' ? 'Crédit' : 'Comptant'}
       &nbsp;·&nbsp; <strong>Solde :</strong> ${Number(client.solde).toLocaleString('fr-FR')} DA</p>
    <p style="color:var(--texte-attenue);">Aucune commande enregistrée pour la date sélectionnée.</p>
    <div style="display:flex; flex-direction:column; gap:8px; margin-top: var(--espace-4);">
      <a class="bouton bouton-primaire" href="${base}management/commandes.html?client=${encodeURIComponent(client.id_client)}">+ Nouvelle commande pour ce client</a>
      <a class="bouton bouton-secondaire" href="${base}management/clients.html?q=${encodeURIComponent(client.id_client)}">Voir la fiche client</a>
    </div>
  `;
  afficherPanneauAnime(panneau);
  panneau.querySelector('#fermer-panneau').addEventListener('click', () => fermerPanneauAnime(panneau));
}

function echapper(t) { const d = document.createElement('div'); d.textContent = t ?? ''; return d.innerHTML; }
