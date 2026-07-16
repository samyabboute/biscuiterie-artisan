import { exigerSession } from '../src/lib/auth.js';
import { construireShell, chargeurLogo } from '../src/lib/layout.js';
import { supabase } from '../src/lib/supabaseClient.js';

const LIBELLES_MODE = { especes: 'Espèces', cheque: 'Chèque', credit: 'Crédit' };

const profil = await exigerSession();
if (profil) {
  const contenu = construireShell({ profil, moduleActifId: 'encaissements' });
  await demarrer(contenu);
}

async function demarrer(contenu) {
  contenu.innerHTML = `
    <p class="page-explication">
      À la fin de chaque tournée, rapprochez ce que le livreur a réellement encaissé (espèces, chèque, crédit)
      avec la valeur livrée. Un écart signale une erreur de caisse ou un impayé à suivre.
    </p>
    <div class="barre-outils">
      <input type="date" id="filtre-date" value="${new Date().toISOString().slice(0, 10)}" />
      <select id="filtre-livreur"><option value="">Tous les livreurs</option></select>
    </div>

    <div class="carte" style="margin-bottom: var(--espace-5);">
      <h3 style="margin-top:0;">Rapprochement de caisse par livreur</h3>
      <table>
        <thead><tr><th>Livreur</th><th>Attendu (livré)</th><th>Encaissé</th><th>Écart</th><th>Espèces</th><th>Chèque</th><th>Crédit différé</th></tr></thead>
        <tbody id="corps-rapprochement"><tr><td colspan="7">${chargeurLogo('Chargement...', true)}</td></tr></tbody>
      </table>
    </div>

    <div class="carte">
      <h3 style="margin-top:0;">Alertes plafond crédit</h3>
      <table>
        <thead><tr><th>Client</th><th>Solde</th><th>Plafond</th><th>Dépassement</th></tr></thead>
        <tbody id="corps-alertes"><tr><td colspan="4">${chargeurLogo('Chargement...', true)}</td></tr></tbody>
      </table>
    </div>
  `;

  const { data: livreurs } = await supabase.from('employes').select('matricule, nom, prenom').eq('role', 'livreur');
  const selectLivreur = document.getElementById('filtre-livreur');
  for (const l of livreurs || []) {
    const o = document.createElement('option'); o.value = l.matricule; o.textContent = `${l.prenom} ${l.nom}`; selectLivreur.appendChild(o);
  }

  document.getElementById('filtre-date').addEventListener('change', chargerRapprochement);
  document.getElementById('filtre-livreur').addEventListener('change', chargerRapprochement);

  await Promise.all([chargerRapprochement(), chargerAlertes()]);
}

async function chargerRapprochement() {
  const corps = document.getElementById('corps-rapprochement');
  const date = document.getElementById('filtre-date').value;
  const livreur = document.getElementById('filtre-livreur').value;

  let requete = supabase.from('v_livraisons_detail').select('*').eq('date_commande', date);
  if (livreur) requete = requete.eq('livreur', livreur);
  const { data, error } = await requete;
  if (error) { corps.innerHTML = `<tr><td colspan="7"><div class="message-erreur">${error.message}</div></td></tr>`; return; }

  const { data: encaissements } = await supabase.from('encaissements').select('*').gte('date_creation', date).lt('date_creation', dateSuivante(date));

  const parLivreur = {};
  for (const l of data || []) {
    if (!parLivreur[l.livreur]) parLivreur[l.livreur] = { attendu: 0, especes: 0, cheque: 0, credit: 0 };
    parLivreur[l.livreur].attendu += Number(l.valeur_livree);
  }
  for (const e of encaissements || []) {
    if (livreur && e.livreur !== livreur) continue;
    if (!parLivreur[e.livreur]) parLivreur[e.livreur] = { attendu: 0, especes: 0, cheque: 0, credit: 0 };
    parLivreur[e.livreur][e.mode] += Number(e.montant);
  }

  const entrees = Object.entries(parLivreur);
  corps.innerHTML = entrees.length === 0 ? `<tr><td colspan="7">Aucune donnée pour ce filtre.</td></tr>` : entrees.map(([matricule, v]) => {
    const encaisse = v.especes + v.cheque;
    const ecart = encaisse - v.attendu;
    return `
      <tr>
        <td><strong>${matricule}</strong></td>
        <td>${v.attendu.toLocaleString('fr-FR')} DA</td>
        <td>${encaisse.toLocaleString('fr-FR')} DA</td>
        <td style="color: ${ecart < 0 ? 'var(--danger)' : 'var(--succes)'};">${ecart >= 0 ? '+' : ''}${ecart.toLocaleString('fr-FR')} DA</td>
        <td>${v.especes.toLocaleString('fr-FR')} DA</td>
        <td>${v.cheque.toLocaleString('fr-FR')} DA</td>
        <td>${v.credit.toLocaleString('fr-FR')} DA</td>
      </tr>
    `;
  }).join('');
}

async function chargerAlertes() {
  const corps = document.getElementById('corps-alertes');
  const { data, error } = await supabase.from('clients').select('id_client, raison_sociale, solde, plafond_credit')
    .eq('conditions_paiement', 'credit').eq('statut', 'actif').order('solde', { ascending: false });
  if (error) { corps.innerHTML = `<tr><td colspan="4"><div class="message-erreur">${error.message}</div></td></tr>`; return; }

  const enDepassement = (data || []).filter((c) => Number(c.solde) > Number(c.plafond_credit) && Number(c.plafond_credit) > 0);
  corps.innerHTML = enDepassement.length === 0 ? `<tr><td colspan="4">Aucun dépassement de plafond.</td></tr>` : enDepassement.map((c) => `
    <tr>
      <td>${c.raison_sociale}</td>
      <td>${Number(c.solde).toLocaleString('fr-FR')} DA</td>
      <td>${Number(c.plafond_credit).toLocaleString('fr-FR')} DA</td>
      <td><span class="badge badge-rouge">+${(Number(c.solde) - Number(c.plafond_credit)).toLocaleString('fr-FR')} DA</span></td>
    </tr>
  `).join('');
}

function dateSuivante(date) {
  const d = new Date(date);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}
