// Capture GPS avec promesse simple + gestion d'erreur en français.
export function position(options = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error("La géolocalisation n'est pas disponible sur cet appareil.")); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, precision: pos.coords.accuracy }),
      (erreur) => reject(new Error(`Impossible d'obtenir la position GPS : ${erreur.message}`)),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000, ...options }
    );
  });
}
