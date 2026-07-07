import { deconnecter } from './auth.js';
import { icone } from './icons.js';

const ROLE_LABELS = {
  super_admin: 'Super Admin',
  directeur_commercial: 'Directeur Commercial',
  resp_logistique: 'Resp. Logistique',
  superviseur_zone: 'Superviseur de zone',
  agent_adv: 'Agent ADV',
  comptable: 'Comptable',
  magasinier: 'Magasinier',
  livreur: 'Livreur',
};

// Modules du CRM et rôles autorisés à les voir (cf. tableau de permissions).
// `disponible: false` = module pas encore construit (affiché grisé, phases suivantes).
const MODULES = [
  { id: 'accueil', label: 'Accueil', icone: 'home', href: 'management/index.html',
    roles: ['super_admin', 'directeur_commercial', 'resp_logistique', 'superviseur_zone', 'agent_adv', 'comptable', 'magasinier'], disponible: true },
  { id: 'carte', label: 'Carte', icone: 'map', href: 'management/carte.html',
    roles: ['super_admin', 'directeur_commercial', 'resp_logistique', 'superviseur_zone'], disponible: true },
  { id: 'clients', label: 'Clients', icone: 'store', href: 'management/clients.html',
    roles: ['super_admin', 'directeur_commercial', 'resp_logistique', 'superviseur_zone', 'agent_adv', 'comptable'], disponible: true },
  { id: 'commandes', label: 'Commandes', icone: 'package', href: 'management/commandes.html',
    roles: ['super_admin', 'directeur_commercial', 'resp_logistique', 'superviseur_zone', 'agent_adv'], disponible: true },
  { id: 'tournees', label: 'Tournées & livraisons', icone: 'truck', href: 'management/tournees.html',
    roles: ['super_admin', 'resp_logistique', 'superviseur_zone', 'magasinier'], disponible: true },
  { id: 'retours', label: 'Retours produits', icone: 'rotateLeft', href: 'management/retours.html',
    roles: ['super_admin', 'comptable', 'resp_logistique', 'agent_adv', 'superviseur_zone'], disponible: true },
  { id: 'encaissements', label: 'Encaissements', icone: 'wallet', href: 'management/encaissements.html',
    roles: ['super_admin', 'comptable'], disponible: true },
  { id: 'distribution', label: 'App Distribution', icone: 'smartphone', href: 'management/distribution.html',
    roles: ['super_admin', 'resp_logistique'], disponible: true },
  { id: 'produits', label: 'Produits', icone: 'package', href: 'management/produits.html',
    roles: ['super_admin', 'directeur_commercial'], disponible: true },
  { id: 'utilisateurs', label: 'Utilisateurs & accès', icone: 'users', href: 'management/utilisateurs.html',
    roles: ['super_admin'], disponible: true },
  { id: 'archives', label: 'Archives', icone: 'archive', href: 'management/archives.html',
    roles: ['super_admin'], disponible: true },
  { id: 'audit', label: "Journal d'audit", icone: 'fileText', href: 'management/audit.html',
    roles: ['super_admin'], disponible: true },
];

export function construireShell({ profil, moduleActifId }) {
  const racine = document.createElement('div');
  racine.className = 'shell';
  racine.innerHTML = `
    <aside class="shell-barre-laterale">
      <div class="shell-logo">
        <span class="shell-logo-marque">${icone('package', 22)}</span>
        <span class="shell-logo-texte">
          <span class="shell-logo-nom">L'Artisan</span>
          <span class="shell-logo-sous">Biscuiterie</span>
        </span>
      </div>
      <nav class="shell-nav"></nav>
    </aside>
    <div class="shell-corps">
      <header class="shell-entete">
        <div class="shell-entete-titre"></div>
        <div class="shell-entete-profil">
          <div class="shell-profil-avatar">${(profil.prenom?.[0] || '') + (profil.nom?.[0] || '')}</div>
          <div class="shell-profil-info">
            <span class="shell-profil-nom">${profil.prenom} ${profil.nom}</span>
            <span class="shell-profil-role">${profil.matricule} · ${ROLE_LABELS[profil.role] || profil.role}</span>
          </div>
          <button type="button" class="bouton bouton-secondaire bouton-icone-texte" id="bouton-deconnexion">${icone('logout', 16)}<span>Déconnexion</span></button>
        </div>
      </header>
      <main class="shell-contenu" id="shell-contenu"></main>
    </div>
  `;

  const nav = racine.querySelector('.shell-nav');
  for (const mod of MODULES) {
    if (!mod.roles.includes(profil.role)) continue;

    const lien = document.createElement(mod.disponible ? 'a' : 'span');
    lien.className = 'shell-nav-item';
    if (mod.disponible) lien.href = import.meta.env.BASE_URL + mod.href;
    if (mod.id === moduleActifId) lien.classList.add('actif');
    if (!mod.disponible) lien.classList.add('desactive');

    lien.innerHTML = `<span class="shell-nav-icone">${icone(mod.icone, 19)}</span><span>${mod.label}</span>${mod.disponible ? '' : '<span class="badge badge-gris">Bientôt</span>'}`;
    nav.appendChild(lien);
  }

  racine.querySelector('#bouton-deconnexion').addEventListener('click', async () => {
    await deconnecter();
    window.location.href = `${import.meta.env.BASE_URL}management/login.html`;
  });

  document.body.innerHTML = '';
  document.body.appendChild(racine);

  const titre = MODULES.find((m) => m.id === moduleActifId);
  if (titre) racine.querySelector('.shell-entete-titre').innerHTML = `<h1>${titre.label}</h1>`;

  return racine.querySelector('#shell-contenu');
}
