/* =========================================================
   Chiffre le contenu de l'espace membres.

   Le contenu en clair est dans _prive/membres.html (jamais publié,
   exclu par .gitignore). Ce script produit js/membres-data.js,
   illisible sans le mot de passe (AES-GCM 256, clé dérivée PBKDF2).

   Usage :  node outils/chiffrer-membres.mjs "MotDePasse"
   À relancer après chaque modification du contenu ou du mot de passe.
   ========================================================= */

import { readFile, writeFile } from 'node:fs/promises';
import { webcrypto as crypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ITERATIONS = 250000;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const password = process.argv[2];
if (!password) {
    console.error('Usage : node outils/chiffrer-membres.mjs "MotDePasse"');
    process.exit(1);
}

const html = await readFile(path.join(root, '_prive', 'membres.html'), 'utf8');
const salt = crypto.getRandomValues(new Uint8Array(16));
const iv = crypto.getRandomValues(new Uint8Array(12));
const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(html)));

const b64 = u8 => Buffer.from(u8).toString('base64');
const out = `/* Contenu chiffré de l'espace membres : généré par outils/chiffrer-membres.mjs, ne pas modifier à la main. */
const MEMBRES_DATA = ${JSON.stringify({ iterations: ITERATIONS, salt: b64(salt), iv: b64(iv), data: b64(data) })};
`;
await writeFile(path.join(root, 'js', 'membres-data.js'), out, 'utf8');
console.log(`js/membres-data.js écrit (${html.length} caractères chiffrés)`);
