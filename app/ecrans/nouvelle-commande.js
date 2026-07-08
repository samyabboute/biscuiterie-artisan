import * as bd from '../../src/lib/pwa/db.js';

async function rendre(conteneur, { etat, naviguer, contexte }) {
  const clients = await bd.tousLesClients(etat.cleChiffrement);
  const produits = (await bd.tousLesProduits()).filter((p) => p.statut === 'actif');
  const lignes = [];

  const ecran = document.createElement('div');
  ecran.innerHTML = `
    <div class="ecran">
      <h2 class="grand-titre">Prendre une commande</h2>
      <p class="sous-titre">Pour une vente décidée sur place, hors de votre tournée planifiée. Elle sera envoyée au siège pour validation à la prochaine synchronisation.</p>
      <div class="champ-app">
        <label>Client</label>
        <select id="select-client"><option value="">—</option>
          ${clients.map((c) => `<option value="${c.id_client}">${c.raison_sociale}</option>`).join('')}
        </select>
      </div>
      <div class="champ-app">
        <label>Produit</label>
        <select id="select-produit">${produits.map((p) => `<option value="${p.reference}">${p.designation}</option>`).join('')}</select>
      </div>
      <div class="selecteur-nb" style="justify-content:center; margin-bottom:14px;">
        <button type="button" id="moins-qte">−</button><span id="qte-affichee">1</span><button type="button" id="plus-qte">+</button>
        <button type="button" class="gros-bouton gros-bouton-blanc" style="width:auto; min-height:44px; padding:0 16px;" id="btn-ajouter">Ajouter</button>
      </div>
      <div id="liste-lignes"></div>
      <div class="carte-app" style="text-align:center;"><div class="sous-titre" style="margin:0;">Total</div><div class="grand-titre" id="total-commande">0 DA</div></div>
      <button class="gros-bouton gros-bouton-orange" id="btn-enregistrer">Créer la commande (à valider)</button>
    </div>
  `;
  conteneur.innerHTML = '';
  conteneur.appendChild(ecran);
  conteneur.appendChild(contexte.afficherNavigation('nouvelle-commande'));

  let quantite = 1;
  ecran.querySelector('#moins-qte').addEventListener('click', () => { quantite = Math.max(1, quantite - 1); ecran.querySelector('#qte-affichee').textContent = quantite; });
  ecran.querySelector('#plus-qte').addEventListener('click', () => { quantite++; ecran.querySelector('#qte-affichee').textContent = quantite; });

  function prixPourClient(produit) {
    const client = clients.find((c) => c.id_client === ecran.querySelector('#select-client').value);
    return client?.type_client === 'GRO' ? produit.prix_grossiste : produit.prix_detaillant;
  }

  function redessiner() {
    const conteneurLignes = ecran.querySelector('#liste-lignes');
    conteneurLignes.innerHTML = lignes.length === 0 ? `<p style="color:#7A8299;">Aucune ligne.</p>` : lignes.map((l, i) => `
      <div class="ligne-quantite">
        <span class="nom-produit">${l.designation} × ${l.quantite}</span>
        <span>${(l.quantite * l.prix_unitaire).toLocaleString('fr-FR')} DA</span>
        <button type="button" data-retirer="${i}" style="margin-left:8px; background:none; border:none; font-size:1.2rem;">✕</button>
      </div>
    `).join('');
    conteneurLignes.querySelectorAll('[data-retirer]').forEach((b) => b.addEventListener('click', () => { lignes.splice(Number(b.dataset.retirer), 1); redessiner(); }));
    const total = lignes.reduce((s, l) => s + l.quantite * l.prix_unitaire, 0);
    ecran.querySelector('#total-commande').textContent = `${total.toLocaleString('fr-FR')} DA`;
  }

  ecran.querySelector('#btn-ajouter').addEventListener('click', () => {
    const ref = ecran.querySelector('#select-produit').value;
    const produit = produits.find((p) => p.reference === ref);
    if (!produit) return;
    const existante = lignes.find((l) => l.produit_reference === ref);
    if (existante) existante.quantite += quantite; else lignes.push({ produit_reference: ref, designation: produit.designation, quantite, prix_unitaire: prixPourClient(produit) });
    redessiner();
  });

  ecran.querySelector('#btn-enregistrer').addEventListener('click', async () => {
    const clientId = ecran.querySelector('#select-client').value;
    if (!clientId) { alert('Choisissez un client.'); return; }
    if (lignes.length === 0) { alert('Ajoutez au moins une ligne.'); return; }

    const uuid = crypto.randomUUID();
    await bd.ajouterOperation('commande', {
      uuid_creation: uuid,
      client_id: clientId,
      statut: 'brouillon',
      origine: 'livreur',
      date_commande: new Date().toISOString().slice(0, 10),
      cree_par: etat.profil.matricule,
      lignes: lignes.map((l) => ({ produit_reference: l.produit_reference, quantite_commandee: l.quantite, prix_unitaire: l.prix_unitaire })),
    });

    alert('Commande enregistrée localement. Elle sera envoyée à la prochaine synchronisation.');
    naviguer('tournee');
  });

  redessiner();
}

export default { rendre };
