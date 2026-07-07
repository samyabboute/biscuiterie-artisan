import { exigerSession } from '../src/lib/auth.js';
import { construireShell } from '../src/lib/layout.js';
import { supabase } from '../src/lib/supabaseClient.js';

const ENTITES = {
  clients: { table: 'clients', cle: 'id_client', libelle: 'Clients', colonnes: ['id_client', 'raison_sociale', 'wilaya', 'commune', 'date_creation'] },
  employes: { table: 'employes', cle: 'matricule', libelle: 'Employés', colonnes: ['matricule', 'nom', 'prenom', 'departement', 'role', 'date_creation'] },
  produits: { table: 'produits', cle: 'reference', libelle: 'Produits', colonnes: ['reference', 'designation', 'prix_detaillant', 'date_creation'] },
};

const etat = { profil: null, ongletActif: 'clients', lignes: [] };

const profil = await exigerSession();
if (profil) {
  const contenu = construireShell({ profil, moduleActifId: 'archives' });
  if (profil.role !== 'super_admin') {
    contenu.innerHTML = `<div class="message-erreur">Ce module est réservé au Super Admin.</div>`;
  } else {
    etat.profil = profil;
    await demarrer(contenu);
  }
}

async function demarrer(contenu) {
  contenu.innerHTML = `
    <div class="barre-outils">
      ${Object.entries(ENTITES).map(([id, e]) => `<button type="button" class="bouton bouton-secondaire" data-onglet="${id}" id="onglet-${id}">${e.libelle}</button>`).join('')}
      <div class="pousser"><button type="button" class="bouton bouton-primaire" id="bouton-export">Exporter CSV</button></div>
    </div>
    <div class="carte tableau-clients-conteneur">
      <table><thead id="entete-tableau"></thead><tbody id="corps-tableau"><tr><td>Chargement...</td></tr></tbody></table>
    </div>
  `;

  document.querySelectorAll('[data-onglet]').forEach((b) => b.addEventListener('click', () => { etat.ongletActif = b.dataset.onglet; charger(); }));
  document.getElementById('bouton-export').addEventListener('click', exporterCsv);

  await charger();
}

async function charger() {
  document.querySelectorAll('[data-onglet]').forEach((b) => b.classList.toggle('bouton-primaire', b.dataset.onglet === etat.ongletActif));
  document.querySelectorAll('[data-onglet]').forEach((b) => b.classList.toggle('bouton-secondaire', b.dataset.onglet !== etat.ongletActif));

  const config = ENTITES[etat.ongletActif];
  document.getElementById('entete-tableau').innerHTML = `<tr>${config.colonnes.map((c) => `<th>${c}</th>`).join('')}<th>Actions</th></tr>`;

  const corps = document.getElementById('corps-tableau');
  corps.innerHTML = `<tr><td colspan="${config.colonnes.length + 1}">Chargement...</td></tr>`;

  const { data, error } = await supabase.from(config.table).select('*').eq('statut', 'archive').order('date_creation', { ascending: false });
  if (error) { corps.innerHTML = `<tr><td colspan="${config.colonnes.length + 1}"><div class="message-erreur">${error.message}</div></td></tr>`; return; }

  etat.lignes = data || [];
  corps.innerHTML = etat.lignes.length === 0 ? `<tr><td colspan="${config.colonnes.length + 1}">Aucune archive.</td></tr>` : etat.lignes.map((ligne) => `
    <tr data-cle="${ligne[config.cle]}">
      ${config.colonnes.map((c) => `<td>${ligne[c] ?? '—'}</td>`).join('')}
      <td><button type="button" class="bouton bouton-primaire" data-restaurer="${ligne[config.cle]}">Restaurer</button></td>
    </tr>
  `).join('');

  corps.querySelectorAll('[data-restaurer]').forEach((b) => b.addEventListener('click', () => restaurer(b.dataset.restaurer)));
}

async function restaurer(cle) {
  const config = ENTITES[etat.ongletActif];
  if (!confirm(`Restaurer cet élément (statut → actif) ?`)) return;
  const { error } = await supabase.from(config.table).update({ statut: 'actif' }).eq(config.cle, cle);
  if (error) { alert(`Erreur : ${error.message}`); return; }
  await charger();
}

function exporterCsv() {
  const config = ENTITES[etat.ongletActif];
  if (etat.lignes.length === 0) { alert('Rien à exporter.'); return; }
  const entetes = config.colonnes.join(';');
  const lignesCsv = etat.lignes.map((l) => config.colonnes.map((c) => `"${String(l[c] ?? '').replace(/"/g, '""')}"`).join(';'));
  const contenu = [entetes, ...lignesCsv].join('\n');
  const blob = new Blob(['﻿' + contenu], { type: 'text/csv;charset=utf-8;' });
  const lien = document.createElement('a');
  lien.href = URL.createObjectURL(blob);
  lien.download = `archives-${etat.ongletActif}-${new Date().toISOString().slice(0, 10)}.csv`;
  lien.click();
}
