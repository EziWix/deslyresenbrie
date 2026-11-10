/* =========================================================
   Crée les modèles 3D des percussions (models/*.glb) par code.

   - batterie.glb            : kit complet (réutilise caisse-claire.glb
                                et grosse-caisse.glb pour garder le même style)
   - timbales.glb            : paire de timbales à pédale
   - petites-percussions.glb : congas, triangle, tambourin, maracas,
                                cloche, wood-block, claves, cymbales

   Les matières sont reprises des modèles existants (Laiton poli,
   Maillechort argenté, Laque acajou, Peau sablée, Bronze…).

   Usage (depuis ce dossier) :  npm install   puis   node creer-percussions.mjs
   Unités : mètres, Y vers le haut, sol à y = 0.
   ========================================================= */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

// L'exporteur utilise FileReader (navigateur) : équivalent minimal pour Node
globalThis.FileReader = class {
    readAsArrayBuffer(blob) {
        blob.arrayBuffer().then(buf => { this.result = buf; this.onloadend?.(); });
    }
};

const MODELS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'models');
const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);
const Y = V(0, 1, 0);
const TAU = Math.PI * 2;

/* ---------- chargement des modèles existants ---------- */
const loader = new GLTFLoader();
async function loadGlb(name) {
    const buf = await readFile(path.join(MODELS, name));
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    return new Promise((ok, ko) => loader.parse(ab, '', g => ok(g.scene), ko));
}

/* ---------- matières ---------- */
const M = {};
function collect(scene) {
    scene.traverse(o => {
        if (o.isMesh && o.material && !M[o.material.name]) M[o.material.name] = o.material;
    });
}
function newMat(name, rgb, metal, rough, doubleSide = false) {
    const m = new THREE.MeshStandardMaterial({ name, metalness: metal, roughness: rough });
    m.color.setRGB(...rgb);  // valeurs linéaires, comme dans les .glb existants
    if (doubleSide) m.side = THREE.DoubleSide;
    return m;
}
function ds(m) {  // variante double face (formes ouvertes : fûts, bassines, cymbales)
    const c = m.clone();
    c.side = THREE.DoubleSide;
    return c;
}

/* ---------- outils de construction ---------- */
const mesh = (geo, mat) => new THREE.Mesh(geo, mat);
const cyl = (rTop, rBot, h, mat, seg = 40, open = false) => mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, open), mat);
const box = (w, h, d, mat) => mesh(new THREE.BoxGeometry(w, h, d), mat);
const sphere = (r, mat, seg = 24) => mesh(new THREE.SphereGeometry(r, seg, Math.round(seg * 0.7)), mat);
const lathe = (pts, mat, seg = 64) => mesh(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg), mat);
function torus(R, r, mat, seg = 64) {
    const t = mesh(new THREE.TorusGeometry(R, r, 10, seg), mat);
    t.rotation.x = Math.PI / 2;  // à plat
    return t;
}
function at(obj, x, y, z) { obj.position.set(x, y, z); return obj; }
function between(a, b, r, mat, rB = r, seg = 14) {
    const c = cyl(rB, r, a.distanceTo(b), mat, seg);
    c.position.copy(a).add(b).multiplyScalar(0.5);
    c.quaternion.setFromUnitVectors(Y, b.clone().sub(a).normalize());
    return c;
}
function group(...children) { const g = new THREE.Group(); children.forEach(c => g.add(c)); return g; }

/* ---------- pièces communes ---------- */

// Cymbale (diamètre d), à plat, coupole vers le haut, posée à y = 0
function cymbal(d, mat) {
    const prof = [[0, 0.075], [0.05, 0.074], [0.095, 0.062], [0.12, 0.045], [0.14, 0.036]];
    for (let i = 1; i <= 18; i++) { const t = i / 18; prof.push([0.14 + 0.36 * t, 0.036 * (1 - t) ** 1.3]); }
    return lathe(prof.map(([r, y]) => [r * d, y * d]), mat, 72);
}

// Pied trépied avec tige : hauteur h (sommet de la tige)
function tripod(h, spread, chrome, rubber) {
    const g = new THREE.Group();
    const hub = 0.26;
    g.add(between(V(0, 0.02), V(0, h), 0.011, chrome));
    g.add(at(cyl(0.02, 0.02, 0.06, chrome), 0, hub, 0));
    for (let i = 0; i < 3; i++) {
        const a = i / 3 * TAU + Math.PI / 6;
        const foot = V(Math.cos(a) * spread, 0.015, Math.sin(a) * spread);
        g.add(between(V(0, hub), foot, 0.009, chrome));
        g.add(at(sphere(0.016, rubber, 12), foot.x, 0.012, foot.z));
    }
    return g;
}

// Pied de cymbale : tige + cymbale inclinée
function cymbalStand(h, d, tiltX, tiltZ, M) {
    const c = cymbal(d, M.bronze);
    const felt = at(cyl(0.022, 0.022, 0.012, M.rubber), 0, 0.08 * d, 0);
    const top = group(c, felt);
    top.position.set(0, h, 0);
    top.rotation.set(tiltX, 0, tiltZ);
    return group(tripod(h, 0.3, M.chrome, M.rubber), top);
}

// Baguette de batterie : du talon a vers la pointe b
function stick(a, b, M) {
    return group(between(a, b, 0.0075, M.wood, 0.005), at(sphere(0.0065, M.wood, 10), b.x, b.y, b.z));
}

/* =========================================================
   BATTERIE
   Public vers +Z, batteur assis vers -Z (face au public).
   ========================================================= */
function batterie(snareSrc, kickSrc) {
    const kit = new THREE.Group();

    // Grosse caisse : le modèle a son axe en Y, on la couche (axe Z)
    const kick = kickSrc.clone(true);
    kick.rotation.x = Math.PI / 2;
    kick.position.set(0, 0.345, 0);
    kit.add(kick);
    // pieds avant + pédale + batte
    [-1, 1].forEach(s => kit.add(between(V(s * 0.24, 0.18, 0.12), V(s * 0.34, 0.01, 0.24), 0.009, M.chrome)));
    kit.add(at(box(0.1, 0.018, 0.3, M.steel), 0, 0.03, -0.36));
    kit.add(between(V(0, 0.07, -0.22), V(0, 0.3, -0.19), 0.006, M.chrome));
    kit.add(at(sphere(0.032, M.felt), 0, 0.3, -0.18));

    // Caisse claire sur son pied
    const snare = snareSrc.clone(true);
    snare.position.set(0.38, 0.64, -0.4);
    snare.rotation.set(0.12, 0, -0.06);
    kit.add(snare, at(tripod(0.56, 0.24, M.chrome, M.rubber), 0.38, 0, -0.4));
    // baguettes posées sur la caisse claire
    kit.add(stick(V(0.24, 0.735, -0.52), V(0.48, 0.735, -0.32), M));
    kit.add(stick(V(0.28, 0.745, -0.56), V(0.52, 0.745, -0.42), M));

    // Toms sur la grosse caisse : la caisse claire, plus profonde
    [[0.17, 0.33], [-0.17, 0.36]].forEach(([x, k]) => {
        const tom = snareSrc.clone(true);
        tom.scale.set(k / 0.39, 1.55, k / 0.39);
        tom.position.set(x, 0.9, -0.06);
        tom.rotation.set(0.32, 0, -Math.sign(x) * 0.12);
        kit.add(tom);
        kit.add(between(V(x * 0.5, 0.68, 0), V(x * 0.85, 0.84, -0.04), 0.012, M.chrome));
    });

    // Tom basse sur 3 pieds
    const floor = snareSrc.clone(true);
    floor.scale.set(1.08, 2.7, 1.08);
    floor.position.set(-0.56, 0.48, -0.44);
    kit.add(floor);
    for (let i = 0; i < 3; i++) {
        const a = i / 3 * TAU + 0.5;
        const c = V(-0.56 + Math.cos(a) * 0.23, 0.5, -0.44 + Math.sin(a) * 0.23);
        kit.add(between(c, V(-0.56 + Math.cos(a) * 0.3, 0.01, -0.44 + Math.sin(a) * 0.3), 0.009, M.chrome));
    }

    // Charleston (hi-hat) : deux cymbales + pédale
    const hh = new THREE.Group();
    hh.add(tripod(0.9, 0.26, M.chrome, M.rubber));
    const low = cymbal(0.36, M.bronze); low.rotation.x = Math.PI; low.position.y = 0.885;  // coupole vers le bas
    const up = cymbal(0.36, M.bronze); up.position.y = 0.9;
    hh.add(low, up, at(box(0.08, 0.016, 0.22, M.steel), 0, 0.02, -0.14), between(V(0, 0.9), V(0, 1.02), 0.006, M.chrome));
    hh.position.set(0.72, 0, -0.32);
    kit.add(hh);

    // Crash et ride
    kit.add(at(cymbalStand(1.28, 0.44, 0.28, -0.2, M), 0.58, 0, 0.12));
    kit.add(at(cymbalStand(1.12, 0.54, 0.22, 0.16, M), -0.74, 0, -0.04));

    // Siège
    kit.add(at(tripod(0.48, 0.25, M.chrome, M.rubber), 0, 0, -0.9));
    kit.add(at(cyl(0.17, 0.16, 0.08, M.rubber, 40), 0, 0.52, -0.9));

    kit.name = 'Batterie';
    return kit;
}

/* =========================================================
   TIMBALES (paire)
   ========================================================= */
function timbale(D) {
    const g = new THREE.Group();
    const R = D / 2, k = D / 0.74;
    const H = 0.84;  // hauteur de la peau

    const bowl = lathe([[R, 0], [R * 0.995, -0.07 * k], [R * 0.95, -0.19 * k], [R * 0.82, -0.31 * k],
        [R * 0.6, -0.4 * k], [R * 0.3, -0.45 * k], [0, -0.465 * k]], M.copperDS, 72);
    const head = at(cyl(R * 1.002, R * 1.002, 0.004, M.skin, 72), 0, 0.006, 0);
    const hoop = at(torus(R * 1.02, 0.013, M.chrome), 0, 0.016, 0);
    const collar = at(torus(R * 1.005, 0.01, M.chrome), 0, -0.035, 0);
    const top = group(bowl, head, hoop, collar);
    // tiges de tension avec poignées en T
    for (let i = 0; i < 8; i++) {
        const a = i / 8 * TAU;
        const x = Math.cos(a) * (R + 0.032), z = Math.sin(a) * (R + 0.032);
        top.add(between(V(x, 0.02, z), V(x, -0.13 * k, z), 0.0055, M.chrome));
        const t = between(V(x - Math.sin(a) * 0.03, 0.04, z + Math.cos(a) * 0.03), V(x + Math.sin(a) * 0.03, 0.04, z - Math.cos(a) * 0.03), 0.006, M.chrome);
        top.add(t, between(V(x, 0.02, z), V(x, 0.04, z), 0.005, M.chrome));
    }
    top.position.y = H;
    g.add(top);

    // trois montants, anneau de base, roulettes, pédale
    const baseR = R * 0.62;
    for (let i = 0; i < 3; i++) {
        const a = i / 3 * TAU + Math.PI / 2;
        const from = V(Math.cos(a) * R * 0.86, H - 0.24 * k, Math.sin(a) * R * 0.86);
        const to = V(Math.cos(a) * baseR, 0.05, Math.sin(a) * baseR);
        g.add(between(from, to, 0.013, M.chrome));
        g.add(at(sphere(0.022, M.rubber, 12), to.x, 0.022, to.z));
    }
    g.add(at(torus(baseR, 0.014, M.chrome), 0, 0.05, 0));
    const pedal = at(box(0.12, 0.03, 0.26, M.steel), 0, 0.03, R * 0.62 + 0.12);
    pedal.rotation.x = -0.18;
    g.add(pedal, between(V(0, 0.05, R * 0.55), V(0, H - 0.4 * k, R * 0.3), 0.008, M.chrome));
    return g;
}

function mallet(a, b) {
    return group(between(a, b, 0.006, M.wood, 0.005), at(sphere(0.026, M.felt, 16), b.x, b.y, b.z));
}

function timbales() {
    const g = new THREE.Group();
    const big = timbale(0.74); big.position.set(-0.42, 0, 0); big.rotation.y = 0.2;
    const small = timbale(0.64); small.position.set(0.38, 0, 0.06); small.rotation.y = -0.2;
    g.add(big, small);
    // une paire de mailloches posée sur la grande timbale
    g.add(mallet(V(-0.62, 0.862, 0.22), V(-0.36, 0.862, -0.02)));
    g.add(mallet(V(-0.58, 0.872, 0.28), V(-0.3, 0.872, 0.08)));
    g.name = 'Timbales';
    return g;
}

/* =========================================================
   PETITES PERCUSSIONS
   ========================================================= */
function conga(rTop, h) {
    const g = new THREE.Group();
    const shell = lathe([[rTop * 0.86, 0], [rTop * 1.12, h * 0.35], [rTop * 1.1, h * 0.6], [rTop, h * 0.97], [rTop, h]], M.lacquerDS, 56);
    const head = at(cyl(rTop * 1.01, rTop * 1.01, 0.004, M.skin, 56), 0, h + 0.004, 0);
    const hoop = at(torus(rTop * 1.03, 0.009, M.chrome), 0, h + 0.006, 0);
    const band = at(torus(rTop * 1.1, 0.006, M.chrome), 0, h * 0.62, 0);
    g.add(shell, head, hoop, band);
    for (let i = 0; i < 6; i++) {  // clés d'accord
        const a = i / 6 * TAU;
        const x = Math.cos(a) * (rTop + 0.022), z = Math.sin(a) * (rTop + 0.022);
        g.add(between(V(x, h + 0.008, z), V(x, h - 0.09, z), 0.005, M.chrome));
        g.add(at(box(0.026, 0.03, 0.02, M.chrome), x, h - 0.1, z));
    }
    return g;
}

function triangleSet() {
    const g = new THREE.Group();
    // petit pied de table avec bras et pince
    g.add(at(cyl(0.05, 0.055, 0.012, M.steel), 0, 0.006, 0));
    g.add(between(V(0, 0.01), V(0, 0.34), 0.006, M.chrome));
    g.add(between(V(0, 0.34), V(0, 0.34, 0.12), 0.005, M.chrome));
    g.add(between(V(0, 0.34, 0.12), V(0, 0.31, 0.12), 0.002, M.rubber));  // cordelette
    // triangle (côté 0.18), un coin ouvert
    const s = 0.18, hgt = s * Math.sqrt(3) / 2, top = 0.305;
    const A = V(0, top, 0.12), B = V(-s / 2, top - hgt, 0.12), C = V(s / 2, top - hgt, 0.12);
    g.add(between(A, B, 0.0045, M.chrome), between(B, C.clone().lerp(B, 0.08), 0.0045, M.chrome), between(A, C, 0.0045, M.chrome));
    // battant posé sur la table
    g.add(between(V(0.05, 0.006, -0.02), V(0.22, 0.006, 0.04), 0.003, M.chrome));
    return g;
}

function tambourin(r) {
    const g = new THREE.Group();
    g.add(cyl(r, r, 0.05, M.lacquerDS, 56, true));
    g.add(at(cyl(r * 1.005, r * 1.005, 0.003, M.skin, 56), 0, 0.026, 0));
    for (let i = 0; i < 5; i++) {  // paires de cymbalettes dans les fentes
        const a = i / 5 * TAU;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        [-0.006, 0.006].forEach(dy => {
            const j = at(cyl(0.022, 0.022, 0.004, M.chrome, 20), x, dy, z);
            j.rotation.set(0, -a, Math.PI / 2);
            g.add(j);
        });
    }
    return g;
}

function maraca() {
    const head = sphere(0.045, M.red, 24);
    head.scale.set(1, 1.22, 1);
    head.position.y = 0.14;
    return group(head, between(V(0, 0), V(0, 0.1), 0.011, M.wood, 0.013));
}

function cowbell() {
    const bell = cyl(0.028, 0.052, 0.14, M.steel, 4);
    bell.rotation.y = Math.PI / 4;
    bell.scale.set(1, 1, 0.62);
    const clamp = at(box(0.03, 0.03, 0.02, M.chrome), 0, 0.08, 0);
    return group(bell, clamp);
}

function woodblock() {
    const g = group(box(0.18, 0.065, 0.085, M.rosewood));
    [-1, 1].forEach(s => g.add(at(box(0.15, 0.008, 0.004, M.ebony), 0, 0.012 * s, s * 0.0435)));
    return g;
}

function handCymbals() {
    // deux cymbales presque debout, coupole vers le public, légèrement décalées
    const g = new THREE.Group();
    [[0, 0, 0.22, 0.08], [0.13, 0.07, 0.34, -0.1]].forEach(([x, z, lean, rz]) => {
        const c = cymbal(0.4, M.bronze);
        const strap = at(torus(0.03, 0.009, M.rubber, 24), 0, 0.04, 0);
        const one = group(c, strap);
        one.rotation.set(Math.PI / 2 - lean, 0, rz);
        one.position.set(x, 0.2 * Math.cos(lean) + 0.01, z);
        g.add(one);
    });
    return g;
}

function petitesPercussions() {
    const g = new THREE.Group();

    // Congas, debout au sol (gauche)
    const c1 = conga(0.135, 0.74); c1.position.set(-0.86, 0, -0.12); c1.rotation.z = 0.04;
    const c2 = conga(0.15, 0.72); c2.position.set(-0.52, 0, -0.3); c2.rotation.z = -0.03;
    g.add(c1, c2);

    // Table de percussionniste (droite)
    const T = 0.56;  // hauteur du plateau
    const table = group(at(box(0.92, 0.03, 0.5, M.ebony), 0, T - 0.015, 0));
    [[-0.42, -0.21], [0.42, -0.21], [-0.42, 0.21], [0.42, 0.21]].forEach(([x, z]) =>
        table.add(between(V(x, 0.01, z), V(x, T - 0.03, z), 0.011, M.chrome)));
    table.position.set(0.35, 0, 0);
    g.add(table);

    const onTable = (obj, x, y, z, ry = 0) => { obj.position.set(0.35 + x, T + y, z); obj.rotation.y = ry; g.add(obj); return obj; };
    onTable(tambourin(0.12), -0.24, 0.026, 0.08, 0.3);
    const m1 = onTable(maraca(), 0.03, 0.045, 0.14, 0); m1.rotation.set(0, 0.4, Math.PI / 2);
    const m2 = onTable(maraca(), 0.06, 0.045, 0.04, 0); m2.rotation.set(0, -0.3, Math.PI / 2);
    const cb = onTable(cowbell(), 0.22, 0.03, -0.1); cb.rotation.set(0, 0.5, Math.PI / 2);
    onTable(woodblock(), -0.04, 0.033, -0.12, -0.2);
    [-0.012, 0.012].forEach((dz, i) => onTable(between(V(-0.1, 0, 0), V(0.1, 0, 0), 0.011, M.rosewood), -0.27, 0.011, -0.15 + dz * 2, 0.15 + i * 0.1));  // claves
    onTable(triangleSet(), 0.34, 0, -0.04);

    // Cymbales frappées appuyées contre la table
    const hc = handCymbals();
    hc.position.set(-0.3, 0, 0.3);
    hc.rotation.y = 0.25;
    g.add(hc);

    g.name = 'Petites percussions';
    return g;
}

/* =========================================================
   Export
   ========================================================= */
async function exportGlb(obj, file) {
    const scene = new THREE.Scene();
    scene.add(obj);
    const glb = await new GLTFExporter().parseAsync(scene, { binary: true });
    await writeFile(path.join(MODELS, file), Buffer.from(glb));
    const b = new THREE.Box3().setFromObject(obj).getSize(V(0, 0));
    console.log(`${file.padEnd(26)} ${(glb.byteLength / 1024).toFixed(0).padStart(5)} Ko   ${b.x.toFixed(2)} × ${b.y.toFixed(2)} × ${b.z.toFixed(2)} m`);
}

const snare = await loadGlb('caisse-claire.glb');
const kick = await loadGlb('grosse-caisse.glb');
for (const f of ['trompette.glb', 'cymbales.glb', 'xylophone.glb']) collect(await loadGlb(f));
collect(snare);

Object.assign(M, {
    chrome: M['Maillechort argente'],
    brass: M['Laiton poli'],
    bronze: ds(M['Bronze']),
    rubber: M['Caoutchouc'],
    ebony: M['Ebene'],
    rosewood: M['Palissandre'],
    skin: M['Peau sablee'],
    lacquerDS: ds(M['Laque acajou']),
    copperDS: newMat('Cuivre martele', [0.72, 0.22, 0.08], 1, 0.2, true),
    steel: newMat('Acier noir', [0.03, 0.03, 0.035], 0.8, 0.35),
    wood: newMat('Bois clair', [0.62, 0.34, 0.14], 0, 0.5),
    felt: newMat('Feutre', [0.8, 0.78, 0.72], 0, 1),
    red: newMat('Laque rouge', [0.62, 0.01, 0.02], 0.1, 0.3),
});
const missing = Object.entries(M).filter(([, v]) => !v).map(([k]) => k);
if (missing.length) throw new Error('Matières introuvables : ' + missing.join(', '));

await exportGlb(batterie(snare, kick), 'batterie.glb');
await exportGlb(timbales(), 'timbales.glb');
await exportGlb(petitesPercussions(), 'petites-percussions.glb');
