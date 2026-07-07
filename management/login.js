import { connecter } from '../src/lib/auth.js';
import { supabase } from '../src/lib/supabaseClient.js';

const formulaire = document.getElementById('formulaire-connexion');
const zoneMessage = document.getElementById('zone-message');
const boutonConnexion = document.getElementById('bouton-connexion');

// Si déjà connecté avec un compte CRM valide, on saute directement au tableau de bord.
const { data: { session } } = await supabase.auth.getSession();
if (session) {
  window.location.href = `${import.meta.env.BASE_URL}management/index.html`;
}

formulaire.addEventListener('submit', async (evenement) => {
  evenement.preventDefault();
  zoneMessage.innerHTML = '';
  boutonConnexion.disabled = true;
  boutonConnexion.textContent = 'Connexion...';

  const matricule = document.getElementById('matricule').value;
  const motDePasse = document.getElementById('mot-de-passe').value;

  try {
    await connecter(matricule, motDePasse);
    window.location.href = `${import.meta.env.BASE_URL}management/index.html`;
  } catch (erreur) {
    zoneMessage.innerHTML = `<div class="message-erreur">${erreur.message}</div>`;
    boutonConnexion.disabled = false;
    boutonConnexion.textContent = 'Se connecter';
  }
});
