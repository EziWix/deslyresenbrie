/* =========================================================
   Chiffre les données privées de l'espace membres.

   - Membres :   node outils/chiffrer-membres.mjs "MotDePasseMembres"
       _prive/membres.html  ->  js/membres-data.js   (MEMBRES_DATA)
       Les repères {{DEPOT}} et {{JETON_LECTURE}} du fichier sont remplacés
       par les valeurs de _prive/jetons.txt (clé de lecture des partitions).

   - Éditeurs :  node outils/chiffrer-membres.mjs --editeur "MotDePasseEditeur"
       _prive/jetons.txt (DEPOT + ECRITURE)  ->  js/editeur-data.js   (EDITEUR_DATA)

   Les fichiers produits sont illisibles sans le mot de passe
   (AES-GCM 256, clé dérivée PBKDF2). Le dossier _prive/ n'est jamais publié.
   ========================================================= */

import { readFile, writeFile } from 'node:fs/promises';
import { webcrypto as crypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ITERATIONS = 250000;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const editeur = args[0] === '--editeur';
const password = editeur ? args[1] : args[0];
if (!password) {
    console.error('Usage : node outils/chiffrer-membres.mjs "MotDePasse"\n        node outils/chiffrer-membres.mjs --editeur "MotDePasse"');
    process.exit(1);
}

async function readJetons() {
    let txt = '';
    try { txt = await readFile(path.join(root, '_prive', 'jetons.txt'), 'utf8'); } catch { /* pas encore créé */ }
    const val = k => (txt.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]?.trim() || '';
    return { depot: val('DEPOT'), lecture: val('LECTURE'), ecriture: val('ECRITURE') };
}

async function encrypt(text) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
        base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
    const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text)));
    const b64 = u8 => Buffer.from(u8).toString('base64');
    return { iterations: ITERATIONS, salt: b64(salt), iv: b64(iv), data: b64(data) };
}

const jetons = await readJetons();

if (editeur) {
    if (!jetons.depot || !jetons.ecriture) {
        console.error('ECRITURE manquant dans _prive/jetons.txt');
        process.exit(1);
    }
    const payload = await encrypt(JSON.stringify({ depot: jetons.depot, jeton: jetons.ecriture }));
    await writeFile(path.join(root, 'js', 'editeur-data.js'),
        `/* Accès éditeur chiffré : généré par outils/chiffrer-membres.mjs --editeur, ne pas modifier à la main. */\nconst EDITEUR_DATA = ${JSON.stringify(payload)};\n`, 'utf8');
    console.log('js/editeur-data.js écrit');
} else {
    let html = await readFile(path.join(root, '_prive', 'membres.html'), 'utf8');
    html = html.replaceAll('{{DEPOT}}', jetons.depot).replaceAll('{{JETON_LECTURE}}', jetons.lecture);
    if (!jetons.lecture) console.warn('Attention : LECTURE vide dans _prive/jetons.txt, les partitions ne pourront pas se charger.');
    const payload = await encrypt(html);
    await writeFile(path.join(root, 'js', 'membres-data.js'),
        `/* Contenu chiffré de l'espace membres : généré par outils/chiffrer-membres.mjs, ne pas modifier à la main. */\nconst MEMBRES_DATA = ${JSON.stringify(payload)};\n`, 'utf8');
    console.log(`js/membres-data.js écrit (${html.length} caractères chiffrés)`);
}
