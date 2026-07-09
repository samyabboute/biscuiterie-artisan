import { exigerSession } from '../src/lib/auth.js';
import { construireShell } from '../src/lib/layout.js';
import { supabase } from '../src/lib/supabaseClient.js';
import { icone } from '../src/lib/icons.js';

const BASE = import.meta.env.BASE_URL;
// Actions rapides mises en avant sur l'accueil : répond directement à
// "je veux faire X, où est-ce que je clique ?" sans devoir chercher dans
// le menu. Chacune n'apparaît que pour les rôles qui y ont accès.
const ACTIONS_RAPIDES = [
  { label: 'Nouveau client', icone: 'store', href: 'management/clients.html', roles: ['super_admin', 'directeur_commercial', 'agent_adv', 'superviseur_zone'] },
  { label: 'Nouvelle commande', icone: 'package', href: 'management/commandes.html', roles: ['super_admin', 'directeur_commercial', 'agent_adv', 'superviseur_zone'] },
  { label: 'Construire une tournée', icone: 'truck', href: 'management/tournees.html', roles: ['super_admin', 'resp_logistique'] },
  { label: 'Voir la carte du jour', icone: 'map', href: 'management/carte.html', roles: ['super_admin', 'directeur_commercial', 'resp_logistique', 'superviseur_zone'] },
];

const LIBELLES_MOTIF = { rupture: 'Rupture de stock', refus: 'Client refuse', ferme: 'Point fermé', dlc: 'DLC dépassée' };
const JOURS_SANS_VISITE_SEUIL = 7;

// Rappel visuel du cycle complet, affiché en haut de l'accueil : répond
// directement à "je me sens perdu dans le système" en montrant d'un coup
// d'œil où se situe chaque module dans le flux réel de travail.
const ETAPES_FLUX = [
  { icone: 'store', label: 'Client créé', ou: 'Clients' },
  { icone: 'package', label: 'Commande validée', ou: 'Commandes' },
  { icone: 'truck', label: 'Tournée assignée', ou: 'Tournées' },
  { icone: 'mapPin', label: 'Livraison sur le terrain', ou: 'App livreur' },
  { icone: 'wallet', label: 'Caisse & tableau de bord', ou: 'Encaissements' },
];

function dessinerGuideFlux() {
  return `
    <details class="guide-flux" open>
      <summary>
        <span style="display:flex; align-items:center; gap:8px;">${icone('map', 16)} Comment tout s'enchaîne — rappel du cycle complet</span>
        <span class="guide-flux-icone-etat">${icone('chevronDown', 18)}</span>
      </summary>
      <div class="guide-flux-etapes">
        ${ETAPES_FLUX.map((e, i) => `
          <div class="guide-flux-etape">
            <span class="guide-flux-etape-icone">${icone(e.icone, 18)}</span>
            <span class="guide-flux-etape-label">${e.label}</span>
            <span class="guide-flux-etape-ou">${e.ou}</span>
          </div>
          ${i < ETAPES_FLUX.length - 1 ? `<span class="guide-flux-fleche">${icone('chevronRight', 18)}</span>` : ''}
        `).join('')}
      </div>
    </details>
  `;
}

const profil = await exigerSession();
if (profil) {
  const contenu = construireShell({ profil, moduleActifId: 'accueil' });
  await demarrer(contenu, profil);
}

async function demarrer(contenu, profil) {
  contenu.innerHTML = `<p>Chargement des indicateurs...</p>`;
  const aujourdHui = new Date().toISOString().slice(0, 10);

  const [
    { data: commandes },
    { data: livraisons },
    { data: encaissements },
    { data: clients },
    { data: discipline },
  ] = await Promise.all([
    supabase.from('v_commandes_detail').select('*').eq('date_commande', aujourdHui),
    supabase.from('v_livraisons_detail').select('*').eq('date_commande', aujourdHui),
    supabase.from('encaissements').select('*').gte('date_creation', aujourdHui),
    supabase.from('clients').select('id_client, raison_sociale, solde, plafond_credit, statut').eq('statut', 'actif'),
    supabase.from('v_discipline_sync').select('*'),
  ]);

  const c = commandes || [];
  const l = livraisons || [];
  const e = encaissements || [];
  const cl = clients || [];

  // -------------------------------------------------- taux de service
  // Les commandes annulées ou encore en brouillon ne sont pas des
  // engagements de service : elles sont exclues du dénominateur pour ne
  // pas fausser le taux (une commande annulée n'est pas un service manqué).
  const commandesEngagees = c.filter((x) => !['annulee', 'brouillon'].includes(x.statut));
  const totalCommandes = commandesEngagees.length;
  const livrees = commandesEngagees.filter((x) => x.statut === 'livree').length;
  const partielles = commandesEngagees.filter((x) => x.statut === 'partielle').length;
  const tauxService = totalCommandes ? Math.round(((livrees + partielles) / totalCommandes) * 100) : 0;

  // -------------------------------------------------- CA livré (par livreur / zone)
  const parLivreur = grouperSommer(l, (x) => x.livreur || '—', (x) => x.valeur_livree);
  const parZone = grouperSommer(l, (x) => x.zone || '—', (x) => x.valeur_livree);
  const caTotal = l.reduce((s, x) => s + Number(x.valeur_livree), 0);

  // -------------------------------------------------- encaissements vs attendu
  const attendu = l.reduce((s, x) => s + Number(x.valeur_livree), 0);
  const encaisseReel = e.reduce((s, x) => s + Number(x.montant), 0);

  // -------------------------------------------------- encours crédit
  const topDebiteurs = [...cl].filter((x) => x.solde > 0).sort((a, b) => b.solde - a.solde).slice(0, 10);

  // -------------------------------------------------- visités / planifiés
  const clientsVisites = new Set(l.map((x) => x.client_id));
  const clientsPlanifies = new Set(c.map((x) => x.client_id));

  // -------------------------------------------------- non visités depuis X jours
  const { data: dernieresVisites } = await supabase
    .from('livraisons')
    .select('commandes(client_id), horodatage')
    .order('horodatage', { ascending: false });
  const derniereVisiteParClient = {};
  for (const v of dernieresVisites || []) {
    const id = v.commandes?.client_id;
    if (id && !derniereVisiteParClient[id]) derniereVisiteParClient[id] = v.horodatage;
  }
  const seuil = Date.now() - JOURS_SANS_VISITE_SEUIL * 86400000;
  const nonVisites = cl.filter((x) => {
    const derniere = derniereVisiteParClient[x.id_client];
    return !derniere || new Date(derniere).getTime() < seuil;
  });

  // -------------------------------------------------- écarts par motif
  const parMotif = grouperCompter(l.filter((x) => x.motif_ecart), (x) => x.motif_ecart);

  // -------------------------------------------------- tendance CA sur 7 jours
  const ilY7Jours = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
  const { data: livraisons7j } = await supabase.from('v_livraisons_detail').select('date_commande, valeur_livree').gte('date_commande', ilY7Jours);
  const caParJour = {};
  for (let i = 6; i >= 0; i--) {
    const jour = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    caParJour[jour] = 0;
  }
  for (const x of livraisons7j || []) {
    if (caParJour[x.date_commande] !== undefined) caParJour[x.date_commande] += Number(x.valeur_livree);
  }

  const actionsVisibles = ACTIONS_RAPIDES.filter((a) => a.roles.includes(profil.role));

  contenu.innerHTML = `
    ${dessinerGuideFlux()}
    ${actionsVisibles.length ? `
      <div class="actions-rapides">
        ${actionsVisibles.map((a) => `
          <a class="action-rapide" href="${BASE}${a.href}">
            <span class="action-rapide-icone">${icone(a.icone, 20)}</span>
            <span>${a.label}</span>
          </a>
        `).join('')}
      </div>
    ` : ''}
    <div class="grille-kpi">
      <div class="carte kpi"><div class="kpi-valeur">${tauxService}%</div><div class="kpi-libelle">Taux de service (${livrees + partielles}/${totalCommandes})</div></div>
      <div class="carte kpi"><div class="kpi-valeur">${caTotal.toLocaleString('fr-FR')} DA</div><div class="kpi-libelle">CA livré aujourd'hui</div></div>
      <div class="carte kpi"><div class="kpi-valeur">${encaisseReel.toLocaleString('fr-FR')} / ${attendu.toLocaleString('fr-FR')} DA</div><div class="kpi-libelle">Encaissé vs attendu</div></div>
      <div class="carte kpi"><div class="kpi-valeur">${clientsVisites.size} / ${clientsPlanifies.size}</div><div class="kpi-libelle">Points de vente visités / planifiés</div></div>
    </div>

    <div class="carte" style="margin-bottom: var(--espace-4);">
      <h3>CA livré — 7 derniers jours</h3>
      ${dessinerGraphiqueCA(caParJour)}
    </div>

    <div class="grille-deux">
      <div class="carte">
        <h3>CA livré par livreur</h3>
        ${tableauSimple(parLivreur, 'Livreur', 'CA (DA)')}
      </div>
      <div class="carte">
        <h3>CA livré par zone</h3>
        ${tableauSimple(parZone, 'Zone', 'CA (DA)')}
      </div>
    </div>

    <div class="grille-deux">
      <div class="carte">
        <h3>Top 10 débiteurs (encours crédit)</h3>
        ${topDebiteurs.length === 0 ? '<p style="color:var(--texte-attenue);">Aucun encours.</p>' : `
          <table><thead><tr><th>Client</th><th>Solde</th><th>Plafond</th></tr></thead><tbody>
            ${topDebiteurs.map((d) => `<tr><td>${d.raison_sociale}</td><td>${Number(d.solde).toLocaleString('fr-FR')} DA</td><td>${Number(d.plafond_credit).toLocaleString('fr-FR')} DA</td></tr>`).join('')}
          </tbody></table>
        `}
      </div>
      <div class="carte">
        <h3>Écarts par motif (aujourd'hui)</h3>
        ${Object.keys(parMotif).length === 0 ? '<p style="color:var(--texte-attenue);">Aucun écart.</p>' : tableauSimple(parMotif, 'Motif', 'Nombre', LIBELLES_MOTIF)}
      </div>
    </div>

    <div class="grille-deux">
      <div class="carte">
        <h3>Clients non visités depuis ${JOURS_SANS_VISITE_SEUIL}+ jours</h3>
        <p style="color:var(--texte-attenue);">${nonVisites.length} client(s) concerné(s).</p>
        <div style="max-height:180px; overflow-y:auto;">
          ${nonVisites.slice(0, 15).map((x) => `<div style="padding:4px 0; border-bottom:1px solid var(--bordure);">${x.raison_sociale}</div>`).join('')}
        </div>
      </div>
      <div class="carte">
        <h3>Discipline de synchro (avant 17h00)</h3>
        <table><thead><tr><th></th><th>Livreur</th><th>Dernière synchro</th></tr></thead><tbody>
          ${(discipline || []).map((d) => `
            <tr><td><span class="pastille-dashboard pastille-${d.pastille}"></span></td><td>${d.prenom} ${d.nom}</td>
            <td>${d.derniere_sync ? new Date(d.derniere_sync).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : 'Aucune synchro'}</td></tr>
          `).join('')}
        </tbody></table>
      </div>
    </div>
  `;
}

// Graphique en barres du CA livré sur 7 jours — SVG dessiné à la main,
// aucune librairie de graphique nécessaire pour un besoin aussi simple.
function dessinerGraphiqueCA(caParJour) {
  const entrees = Object.entries(caParJour);
  const max = Math.max(...entrees.map(([, v]) => v), 1);
  const largeurBarre = 60;
  const espacement = 24;
  const hauteur = 140;
  const largeur = entrees.length * (largeurBarre + espacement);

  const barres = entrees.map(([jour, valeur], i) => {
    const h = Math.round((valeur / max) * (hauteur - 30));
    const x = i * (largeurBarre + espacement) + espacement / 2;
    const y = hauteur - h;
    const jourLabel = new Date(jour).toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '');
    const estAujourdhui = jour === new Date().toISOString().slice(0, 10);
    return `
      <g>
        <rect x="${x}" y="${y}" width="${largeurBarre}" height="${h}" rx="6"
              fill="${estAujourdhui ? 'var(--dore)' : 'var(--vert-fonce)'}" opacity="${estAujourdhui ? 1 : 0.75}" />
        <text x="${x + largeurBarre / 2}" y="${hauteur + 18}" text-anchor="middle" font-size="11" fill="var(--texte-attenue)">${jourLabel}</text>
        <text x="${x + largeurBarre / 2}" y="${y - 6}" text-anchor="middle" font-size="10" font-weight="700" fill="var(--texte)">${valeur >= 1000 ? Math.round(valeur / 1000) + 'k' : valeur}</text>
      </g>
    `;
  }).join('');

  return `<svg viewBox="0 0 ${largeur} ${hauteur + 30}" style="width:100%; height:180px;">${barres}</svg>`;
}

function grouperSommer(lignes, cleFn, valeurFn) {
  const resultat = {};
  for (const l of lignes) {
    const cle = cleFn(l);
    resultat[cle] = (resultat[cle] || 0) + Number(valeurFn(l));
  }
  return resultat;
}
function grouperCompter(lignes, cleFn) {
  const resultat = {};
  for (const l of lignes) { const cle = cleFn(l); resultat[cle] = (resultat[cle] || 0) + 1; }
  return resultat;
}
function tableauSimple(objet, libelleCle, libelleValeur, dictionnaireLibelles = {}) {
  const entrees = Object.entries(objet).sort((a, b) => b[1] - a[1]);
  if (entrees.length === 0) return `<p style="color:var(--texte-attenue);">Aucune donnée.</p>`;
  return `<table><thead><tr><th>${libelleCle}</th><th>${libelleValeur}</th></tr></thead><tbody>
    ${entrees.map(([k, v]) => `<tr><td>${dictionnaireLibelles[k] || k}</td><td>${typeof v === 'number' && v > 100 ? v.toLocaleString('fr-FR') : v}</td></tr>`).join('')}
  </tbody></table>`;
}
