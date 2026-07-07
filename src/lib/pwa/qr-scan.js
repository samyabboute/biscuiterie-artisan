// Scan QR caméra : utilise l'API native BarcodeDetector si disponible
// (rapide, pas de dépendance), sinon repli sur jsQR (analyse image par image).
import jsQR from 'jsqr';

export async function demarrerScan(videoEl, canvasEl, onResultat, onErreur) {
  let flux;
  try {
    flux = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
  } catch (e) {
    onErreur?.(new Error("Impossible d'accéder à la caméra : " + e.message));
    return () => {};
  }
  videoEl.srcObject = flux;
  await videoEl.play();

  const detecteurNatif = 'BarcodeDetector' in window ? new window.BarcodeDetector({ formats: ['qr_code'] }) : null;
  const ctx = canvasEl.getContext('2d', { willReadFrequently: true });
  let actif = true;

  async function boucle() {
    if (!actif) return;
    if (videoEl.readyState === videoEl.HAVE_ENOUGH_DATA) {
      canvasEl.width = videoEl.videoWidth;
      canvasEl.height = videoEl.videoHeight;
      ctx.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height);

      try {
        if (detecteurNatif) {
          const codes = await detecteurNatif.detect(canvasEl);
          if (codes.length > 0) { onResultat(codes[0].rawValue); return; }
        } else {
          const image = ctx.getImageData(0, 0, canvasEl.width, canvasEl.height);
          const code = jsQR(image.data, image.width, image.height);
          if (code) { onResultat(code.data); return; }
        }
      } catch {
        // image illisible sur cette frame, on retente à la suivante
      }
    }
    requestAnimationFrame(boucle);
  }
  boucle();

  return function arreterScan() {
    actif = false;
    flux.getTracks().forEach((t) => t.stop());
  };
}
