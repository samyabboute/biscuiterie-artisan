// Génère des icônes PNG simples (fond bleu foncé + cercle orange) pour la PWA
// livreur, sans dépendance externe (encodage PNG manuel + zlib intégré à Node).
// À relancer avec `node scripts/generer-icones.mjs` si les couleurs changent.
// Remplacer par de vraies icônes de marque dès qu'un logo est disponible.

import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const BLEU_FONCE = [0x1f, 0x38, 0x64];
const ORANGE = [0xc5, 0x5a, 0x11];

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function genererIcone(taille) {
  const rayon = taille * 0.34;
  const cx = taille / 2;
  const cy = taille / 2;

  const lignes = [];
  for (let y = 0; y < taille; y++) {
    const ligne = Buffer.alloc(1 + taille * 3);
    ligne[0] = 0; // filtre "None"
    for (let x = 0; x < taille; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dansCercle = dx * dx + dy * dy <= rayon * rayon;
      const couleur = dansCercle ? ORANGE : BLEU_FONCE;
      const off = 1 + x * 3;
      ligne[off] = couleur[0];
      ligne[off + 1] = couleur[1];
      ligne[off + 2] = couleur[2];
    }
    lignes.push(ligne);
  }
  const brut = Buffer.concat(lignes);
  const idatData = deflateSync(brut);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(taille, 0);
  ihdr.writeUInt32BE(taille, 4);
  ihdr[8] = 8;  // profondeur 8 bits
  ihdr[9] = 2;  // type couleur RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idatData),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const taille of [192, 512]) {
  writeFileSync(new URL(`../public/app/icons/icon-${taille}.png`, import.meta.url), genererIcone(taille));
  console.log(`Généré : public/app/icons/icon-${taille}.png`);
}
