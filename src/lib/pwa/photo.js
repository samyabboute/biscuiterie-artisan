// Compression photo côté client (canvas) — cible ~80 Ko avant envoi/stockage,
// pour limiter la consommation de données et l'espace local en zone rurale.
const CIBLE_OCTETS = 80 * 1024;

export async function compresserPhoto(fichierOuBlob) {
  const bitmap = await createImageBitmap(fichierOuBlob);
  let largeur = bitmap.width;
  let hauteur = bitmap.height;

  const MAX_DIMENSION = 1024;
  if (largeur > MAX_DIMENSION || hauteur > MAX_DIMENSION) {
    const ratio = Math.min(MAX_DIMENSION / largeur, MAX_DIMENSION / hauteur);
    largeur = Math.round(largeur * ratio);
    hauteur = Math.round(hauteur * ratio);
  }

  const canvas = document.createElement('canvas');
  canvas.width = largeur;
  canvas.height = hauteur;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, largeur, hauteur);

  let qualite = 0.8;
  let blob = await canvasVersBlob(canvas, qualite);

  // Réduit progressivement la qualité puis la taille jusqu'à passer sous la cible.
  while (blob.size > CIBLE_OCTETS && qualite > 0.3) {
    qualite -= 0.1;
    blob = await canvasVersBlob(canvas, qualite);
  }
  while (blob.size > CIBLE_OCTETS && largeur > 320) {
    largeur = Math.round(largeur * 0.85);
    hauteur = Math.round(hauteur * 0.85);
    canvas.width = largeur;
    canvas.height = hauteur;
    ctx.drawImage(bitmap, 0, 0, largeur, hauteur);
    blob = await canvasVersBlob(canvas, qualite);
  }

  return blob;
}

function canvasVersBlob(canvas, qualite) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', qualite));
}
