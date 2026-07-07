import { configurerPin, verifierPin } from '../../src/lib/pwa/crypto.js';
import { icone } from '../../src/lib/icons.js';

const LONGUEUR_PIN = 4;

function rendre(conteneur, { contexte }) {
  const modeConfiguration = contexte.params?.modeConfiguration;
  let etapeConfiguration = 'saisie'; // 'saisie' -> 'confirmation'
  let premierPin = '';
  let saisieActuelle = '';
  let tentativesEchouees = 0;

  function dessiner(titre, sousTitre, messageErreur) {
    conteneur.innerHTML = `
      <div class="ecran" style="justify-content:center; align-items:center; text-align:center;">
        <div class="pin-icone-verrou">${icone('lock', 30)}</div>
        <h2 style="margin:8px 0 2px;">${titre}</h2>
        <p class="sous-titre">${sousTitre}</p>
        ${messageErreur ? `<div class="message-erreur">${messageErreur}</div>` : ''}
        <div class="points-pin" id="points-pin">
          ${Array.from({ length: LONGUEUR_PIN }).map((_, i) => `<span class="${i < saisieActuelle.length ? 'rempli' : ''}"></span>`).join('')}
        </div>
        <div class="pave-numerique" id="pave-numerique">
          ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button type="button" data-touche="${n}">${n}</button>`).join('')}
          <span></span>
          <button type="button" data-touche="0">0</button>
          <button type="button" data-touche="effacer">⌫</button>
        </div>
      </div>
    `;
    conteneur.querySelectorAll('[data-touche]').forEach((b) => b.addEventListener('click', () => surTouche(b.dataset.touche)));
  }

  async function surTouche(touche) {
    if (touche === 'effacer') { saisieActuelle = saisieActuelle.slice(0, -1); redessinerPoints(); return; }
    if (saisieActuelle.length >= LONGUEUR_PIN) return;
    saisieActuelle += touche;
    redessinerPoints();
    if (saisieActuelle.length === LONGUEUR_PIN) await surPinComplet();
  }

  function redessinerPoints() {
    const points = document.getElementById('points-pin');
    if (!points) return;
    [...points.children].forEach((span, i) => span.classList.toggle('rempli', i < saisieActuelle.length));
  }

  async function surPinComplet() {
    if (modeConfiguration) {
      if (etapeConfiguration === 'saisie') {
        premierPin = saisieActuelle;
        saisieActuelle = '';
        etapeConfiguration = 'confirmation';
        dessiner('Confirmez le code PIN', 'Ressaisissez le même code pour confirmer.');
        return;
      }
      if (saisieActuelle !== premierPin) {
        saisieActuelle = '';
        etapeConfiguration = 'saisie';
        premierPin = '';
        dessiner('Créez un code PIN', 'Ce code protège l\'application sur cet appareil.', 'Les deux codes ne correspondent pas, recommencez.');
        return;
      }
      const cle = await configurerPin(premierPin);
      contexte.gererPinValide(cle);
      return;
    }

    const cle = await verifierPin(saisieActuelle);
    if (!cle) {
      tentativesEchouees++;
      saisieActuelle = '';
      dessiner('Entrez votre code PIN', 'Déverrouillez l\'application.', tentativesEchouees >= 3 ? 'Code incorrect à plusieurs reprises. Vérifiez auprès d\'un administrateur si besoin.' : 'Code incorrect, réessayez.');
      return;
    }
    contexte.gererPinValide(cle);
  }

  if (modeConfiguration) {
    dessiner('Créez un code PIN', 'Ce code protège l\'application sur cet appareil.');
  } else {
    dessiner('Entrez votre code PIN', 'Déverrouillez l\'application.');
  }
}

export default { rendre };
