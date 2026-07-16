// Bibliothèque d'icônes SVG (style trait, 24x24) — remplace les emojis pour
// une interface plus professionnelle. Aucune dépendance externe : chaque
// icône est un simple tracé vectoriel, coloré via `currentColor` (hérite la
// couleur du texte parent).
const TRACES = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5 9.7V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.7"/>',
  map: '<path d="M9 3 3 6v15l6-3 6 3 6-3V3l-6 3-6-3Z" stroke-linejoin="round"/><path d="M9 3v15"/><path d="M15 6v15"/>',
  store: '<path d="M3.5 9 4.5 4h15l1 5"/><path d="M3.5 9a2 2 0 0 0 4 .3 2 2 0 0 0 4-.3 2 2 0 0 0 4 .3 2 2 0 0 0 4-.3"/><path d="M4.5 9.3V20h15V9.3"/><path d="M9.5 20v-6h5v6"/>',
  package: '<path d="M21 7.5 12 3 3 7.5l9 4.5 9-4.5Z" stroke-linejoin="round"/><path d="M3 7.5v9l9 4.5 9-4.5v-9"/><path d="M12 12v9"/>',
  truck: '<rect x="1.5" y="7" width="13" height="10" rx="1"/><path d="M14.5 10h4l3.5 3.2V17h-7.5z" stroke-linejoin="round"/><circle cx="6.5" cy="19" r="2"/><circle cx="17" cy="19" r="2"/>',
  rotateLeft: '<path d="M3.5 12a8.5 8.5 0 1 1 2.8 6.3"/><path d="M3.5 17v-5h5"/>',
  wallet: '<path d="M3 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 10h16"/><circle cx="16.5" cy="14.5" r="1" fill="currentColor" stroke="none"/>',
  smartphone: '<rect x="6.5" y="2" width="11" height="20" rx="2"/><path d="M11 18.2h2"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3.2 20c0-3.4 2.6-6 5.8-6s5.8 2.6 5.8 6"/><circle cx="17.2" cy="9" r="2.5"/><path d="M15.8 14.3c2.3.5 4.2 2.5 4.2 5.7"/>',
  archive: '<rect x="2" y="4" width="20" height="5" rx="1"/><path d="M4 9.5v8.5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9.5"/><path d="M10 13.5h4"/>',
  fileText: '<path d="M6 2h8l5 5v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z" stroke-linejoin="round"/><path d="M14 2v5.5h5.5"/><path d="M8 13h8"/><path d="M8 17h8"/>',
  alertTriangle: '<path d="M12 3 2.3 20h19.4L12 3Z" stroke-linejoin="round"/><path d="M12 10v4.5"/><circle cx="12" cy="17.7" r="0.9" fill="currentColor" stroke="none"/>',
  moon: '<path d="M20 14.2A8.5 8.5 0 1 1 9.8 4a7 7 0 0 0 10.2 10.2Z" stroke-linejoin="round"/>',
  camera: '<path d="M4 8h3.2L8.7 6h6.6L16.8 8H20a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" stroke-linejoin="round"/><circle cx="12" cy="13.5" r="3.4"/>',
  mapPin: '<path d="M12 22s7-6.4 7-12.3a7 7 0 1 0-14 0C5 15.6 12 22 12 22Z" stroke-linejoin="round"/><circle cx="12" cy="9.8" r="2.4"/>',
  lock: '<rect x="4.5" y="10" width="15" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8 12.3 2.8 2.7L16 9.5"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  logout: '<path d="M9.5 21H5.5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9.5"/>',
  chevronUp: '<path d="m6 15 6-6 6 6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  chevronRight: '<path d="m9 6 6 6-6 6"/>',
  chevronLeft: '<path d="m15 6-6 6 6 6"/>',
  menu: '<path d="M3.5 6.5h17"/><path d="M3.5 12h17"/><path d="M3.5 17.5h17"/>',
  trash: '<path d="M4 7h16"/><path d="M9 7V4.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1V7"/><path d="M6.5 7 7.3 20a1 1 0 0 0 1 1h7.4a1 1 0 0 0 1-1L17.5 7"/>',
  grip: '<circle cx="9" cy="6" r="1.1" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.1" fill="currentColor" stroke="none"/><circle cx="9" cy="18" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="6" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="18" r="1.1" fill="currentColor" stroke="none"/>',
  x: '<path d="m6 6 12 12"/><path d="m18 6-12 12"/>',
  sync: '<path d="M20 11A8 8 0 0 0 6.3 6.3L4 8.5"/><path d="M4 4v4.5h4.5"/><path d="M4 13a8 8 0 0 0 13.7 4.7L20 15.5"/><path d="M20 20v-4.5h-4.5"/>',
};

export function icone(nom, taille = 20) {
  const trace = TRACES[nom] || '';
  return `<svg class="icone-svg" width="${taille}" height="${taille}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${trace}</svg>`;
}
