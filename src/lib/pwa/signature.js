// Pavé de signature manuscrite sur canvas (souris + tactile), fort contraste.
export function creerPadSignature(canvas) {
  const ctx = canvas.getContext('2d');
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#1A1F2B';
  let enTrain = false;
  let aDessine = false;

  function position(evenement) {
    const rect = canvas.getBoundingClientRect();
    const point = evenement.touches ? evenement.touches[0] : evenement;
    return { x: (point.clientX - rect.left) * (canvas.width / rect.width), y: (point.clientY - rect.top) * (canvas.height / rect.height) };
  }

  function demarrer(e) { enTrain = true; aDessine = true; const p = position(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); e.preventDefault(); }
  function dessiner(e) { if (!enTrain) return; const p = position(e); ctx.lineTo(p.x, p.y); ctx.stroke(); e.preventDefault(); }
  function arreter() { enTrain = false; }

  canvas.addEventListener('mousedown', demarrer);
  canvas.addEventListener('mousemove', dessiner);
  window.addEventListener('mouseup', arreter);
  canvas.addEventListener('touchstart', demarrer, { passive: false });
  canvas.addEventListener('touchmove', dessiner, { passive: false });
  canvas.addEventListener('touchend', arreter);

  return {
    estVide: () => !aDessine,
    effacer: () => { ctx.clearRect(0, 0, canvas.width, canvas.height); aDessine = false; },
    versBlob: () => new Promise((resolve) => canvas.toBlob(resolve, 'image/png')),
  };
}
