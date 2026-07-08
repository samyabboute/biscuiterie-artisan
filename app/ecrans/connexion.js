import { supabase } from '../../src/lib/supabaseClient.js';
import { matriculeVersEmail, matriculeValide } from '../../src/lib/auth.js';

function rendre(conteneur, { contexte }) {
  conteneur.innerHTML = `
    <div class="ecran" style="justify-content:center;">
      <div style="text-align:center; margin-bottom:24px;">
        <div style="display:inline-flex; width:160px; margin-bottom:10px;"><img src="${import.meta.env.BASE_URL}logo-complet.png" alt="Biscuiterie L'Artisan" style="width:100%; height:auto; display:block;" /></div>
        <div style="color:#7A8299;">Application livreur</div>
      </div>
      <div id="zone-message"></div>
      <form id="formulaire-connexion">
        <div class="champ-app">
          <label>Matricule</label>
          <input id="matricule" style="text-transform:uppercase;" placeholder="ART-LIV-0001" required />
        </div>
        <div class="champ-app">
          <label>Mot de passe</label>
          <input id="mot-de-passe" type="password" required />
        </div>
        <button type="submit" class="gros-bouton gros-bouton-orange" id="bouton-connexion">Se connecter</button>
      </form>
      <p style="text-align:center; color:#7A8299; font-size:0.85rem;">Une connexion internet est nécessaire pour la toute première connexion.</p>
    </div>
  `;

  document.getElementById('formulaire-connexion').addEventListener('submit', async (e) => {
    e.preventDefault();
    const zoneMessage = document.getElementById('zone-message');
    const bouton = document.getElementById('bouton-connexion');
    const matricule = document.getElementById('matricule').value;
    const motDePasse = document.getElementById('mot-de-passe').value;

    if (!matriculeValide(matricule)) {
      zoneMessage.innerHTML = `<div class="message-erreur">Format de matricule invalide.</div>`;
      return;
    }

    bouton.disabled = true;
    bouton.textContent = 'Connexion...';
    const { error } = await supabase.auth.signInWithPassword({ email: matriculeVersEmail(matricule), password: motDePasse });
    if (error) {
      zoneMessage.innerHTML = `<div class="message-erreur">Matricule ou mot de passe incorrect.</div>`;
      bouton.disabled = false;
      bouton.textContent = 'Se connecter';
      return;
    }

    await contexte.gererConnexionReussie();
  });
}

export default { rendre };
