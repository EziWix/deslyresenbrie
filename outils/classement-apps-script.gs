/**
 * Classement de « La Grande Parade » (deslyresenbrie.fr/jeu)
 * ----------------------------------------------------------
 * Script Google Apps Script relié à une feuille Google Sheets.
 * Les scores sont enregistrés dans l'onglet « Scores » (créé tout seul).
 *
 * INSTALLATION (une seule fois) :
 *  1. Ouvrir https://sheets.new (nouvelle feuille), la nommer « Classement Parade ».
 *  2. Menu Extensions > Apps Script. Tout effacer, coller ce fichier, enregistrer.
 *  3. Bouton Déployer > Nouveau déploiement > type « Application Web » :
 *       - Exécuter en tant que : Moi
 *       - Qui a accès : Tout le monde
 *     Déployer, autoriser l'accès demandé par Google.
 *  4. Copier l'URL qui finit par /exec et la mettre dans CLASSEMENT_URL (js/data.js).
 *
 * MODÉRATION : supprimer une ligne de l'onglet « Scores » suffit à retirer un score.
 * Après une modification de ce script : Déployer > Gérer les déploiements > modifier
 * (crayon) > Version : Nouvelle version (l'URL reste la même).
 */

const ONGLET = 'Scores';
const TOP = 20;
const MOTS_INTERDITS = ['merde', 'pute', 'putain', 'connard', 'conard', 'salope', 'encule', 'nique', 'batard', 'bite', 'couille', 'nazi', 'hitler', 'fdp', 'ntm', 'pd'];

function feuille_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(ONGLET);
  if (!sh) {
    sh = ss.insertSheet(ONGLET);
    sh.appendRow(['Date', 'Pseudo', 'Score', 'Mètres', 'Notes', 'Durée (s)']);
    sh.setFrozenRows(1);
  }
  return sh;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function normalise_(p) {
  return String(p || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function pseudoValide_(p) {
  if (!/^[\p{L}\p{N} _.\-']{2,16}$/u.test(p)) return false;
  const n = normalise_(p).replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a').replace(/5/g, 's');
  return n.length >= 2 && !MOTS_INTERDITS.some(m => (m.length <= 3 ? n === m : n.indexOf(m) !== -1));
}

/** Meilleur score de chaque pseudo, du plus haut au plus bas. */
function classement_() {
  const cache = CacheService.getScriptCache();
  const enCache = cache.get('top');
  if (enCache) return JSON.parse(enCache);
  const sh = feuille_();
  const n = sh.getLastRow() - 1;
  const meilleurs = {};
  if (n > 0) {
    sh.getRange(2, 1, n, 6).getValues().forEach(r => {
      const pseudo = String(r[1]).trim(), score = Number(r[2]) || 0;
      if (!pseudo) return;
      const cle = normalise_(pseudo);
      if (!meilleurs[cle] || score > meilleurs[cle].score) {
        meilleurs[cle] = { pseudo, score, metres: Number(r[3]) || 0 };
      }
    });
  }
  const liste = Object.keys(meilleurs).map(k => meilleurs[k]).sort((a, b) => b.score - a.score);
  cache.put('top', JSON.stringify(liste), 60);
  return liste;
}

function doGet() {
  const liste = classement_();
  return json_({ ok: true, top: liste.slice(0, TOP), joueurs: liste.length });
}

function doPost(e) {
  let d;
  try { d = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, erreur: 'Données illisibles.' }); }

  const pseudo = String(d.pseudo || '').trim().replace(/\s+/g, ' ');
  const score = Math.floor(Number(d.score)), metres = Math.floor(Number(d.metres));
  const notes = Math.floor(Number(d.notes)), duree = Number(d.duree);

  if (!pseudoValide_(pseudo)) return json_({ ok: false, erreur: 'Pseudo refusé (2 à 16 lettres ou chiffres, et poli !).' });
  if (![score, metres, notes, duree].every(v => isFinite(v) && v >= 0)) return json_({ ok: false, erreur: 'Score invalide.' });
  // garde-fous contre les scores inventés : vitesse max ≈ 19,5 m/s, multiplicateur max ×4
  const plausible = metres <= duree * 20 + 20
    && notes <= metres / 3 + 5
    && score <= metres * 4 + notes * 40 + 4000;
  if (!plausible || score > 10000000) return json_({ ok: false, erreur: 'Score refusé.' });

  const verrou = LockService.getScriptLock();
  verrou.waitLock(10000);
  try {
    feuille_().appendRow([new Date(), pseudo, score, metres, notes, Math.round(duree)]);
    CacheService.getScriptCache().remove('top');
  } finally {
    verrou.releaseLock();
  }

  const liste = classement_();
  const cle = normalise_(pseudo);
  const rang = liste.findIndex(x => normalise_(x.pseudo) === cle) + 1;
  return json_({ ok: true, rang, top: liste.slice(0, TOP), joueurs: liste.length });
}
