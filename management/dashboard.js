import { exigerSession } from '../src/lib/auth.js';
import { construireShell } from '../src/lib/layout.js';
import { supabase } from '../src/lib/supabaseClient.js';

const LIBELLES_MOTIF = { rupture: 'Rupture de stock', refus: 'Client refuse', ferme: 'Point fermé', dlc: 'DLC dépassée' };
const JOURS_SANS_VISITE_SEUIL = 7;

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

  contenu.innerHTML = `
    <div class="grille-kpi">
      <div class="carte kpi"><div class="kpi-valeur">${tauxService}%</div><div class="kpi-libelle">Taux de service (${livrees + partielles}/${totalCommandes})</div></div>
      <div class="carte kpi"><div class="kpi-valeur">${caTotal.toLocaleString('fr-FR')} DA</div><div class="kpi-libelle">CA livré aujourd'hui</div></div>
      <div class="carte kpi"><div class="kpi-valeur">${encaisseReel.toLocaleString('fr-FR')} / ${attendu.toLocaleString('fr-FR')} DA</div><div class="kpi-libelle">Encaissé vs attendu</div></div>
      <div class="carte kpi"><div class="kpi-valeur">${clientsVisites.size} / ${clientsPlanifies.size}</div><div class="kpi-libelle">Points de vente visités / planifiés</div></div>
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
