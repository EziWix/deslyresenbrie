/* =========================================================
   Modèles 3D des instruments, construits par code (Three.js)
   Chaque fonction renvoie { group, view } :
   - group : l'instrument (n'importe quelle échelle, il est recadré ensuite)
   - view  : direction de la caméra au premier affichage
   ========================================================= */

import * as THREE from 'three';

const Y = new THREE.Vector3(0, 1, 0);
const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);
const rad = THREE.MathUtils.degToRad;

/* ---------- Matériaux (partagés par tous les modèles) ---------- */
const std = o => new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, ...o });
const M = {
    brass:    std({ color: 0xd8ad55, metalness: 1, roughness: 0.22 }),
    silver:   std({ color: 0xe4e6e8, metalness: 1, roughness: 0.15 }),
    pearl:    std({ color: 0xf4efe6, metalness: 0.1, roughness: 0.25 }),
    ebony:    std({ color: 0x241d18, metalness: 0.05, roughness: 0.22 }),
    dark:     std({ color: 0x050505, roughness: 0.9 }),
    wood:     std({ color: 0x9a6232, roughness: 0.45 }),
    rosewood: std({ color: 0x6e321c, roughness: 0.4 }),
    head:     std({ color: 0xf1ede2, roughness: 0.85 }),
    lacquer:  std({ color: 0x24453a, metalness: 0.4, roughness: 0.25 }),
    cymbal:   std({ color: 0xcfa257, metalness: 1, roughness: 0.32 }),
    cane:     std({ color: 0xd9b979, roughness: 0.6 }),
    cork:     std({ color: 0x8b6a45, roughness: 0.9 }),
    felt:     std({ color: 0xe9e4d8, roughness: 1 }),
    rubber:   std({ color: 0x9e2b25, roughness: 0.6 }),
    leather:  std({ color: 0x4a2c1a, roughness: 0.8 }),
};

/* ---------- Outils de construction ---------- */
const mesh = (geo, m) => new THREE.Mesh(geo, m);
const cyl = (rTop, rBot, h, m, seg = 24) => mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), m);
const box = (w, h, d, m) => mesh(new THREE.BoxGeometry(w, h, d), m);

// Oriente l'axe Y local de l'objet vers dir, base posée sur pos
function place(obj, pos, dir = Y) {
    obj.position.copy(pos);
    obj.quaternion.setFromUnitVectors(Y, dir.clone().normalize());
    return obj;
}

// Cylindre de a vers b (rayon rA côté a, rB côté b)
function between(a, b, rA, m, rB = rA, seg = 16) {
    const c = cyl(rB, rA, a.distanceTo(b), m, seg);
    return place(c, a.clone().add(b).multiplyScalar(0.5), b.clone().sub(a));
}

// Segment droit découpé en points réguliers
function line(a, b, step = 0.06) {
    const n = Math.max(1, Math.ceil(a.distanceTo(b) / step));
    return Array.from({ length: n + 1 }, (_, i) => a.clone().lerp(b, i / n));
}

// Arc de cercle dans le plan XY (angles en degrés), z interpolé de z0 à z1
function arc(cx, cy, r, a0, a1, z0 = 0, z1 = z0, step = 0.04) {
    const n = Math.max(8, Math.ceil(Math.abs(rad(a1 - a0)) * r / step));
    return Array.from({ length: n + 1 }, (_, i) => {
        const t = i / n, a = rad(a0 + (a1 - a0) * t);
        return V(cx + r * Math.cos(a), cy + r * Math.sin(a), z0 + (z1 - z0) * t);
    });
}

// Concatène des listes de points en retirant les doublons aux jonctions
function join(...parts) {
    const out = [];
    parts.flat().forEach(p => {
        if (!out.length || out[out.length - 1].distanceTo(p) > 1e-4) out.push(p);
    });
    return out;
}

function tube(pts, r, m) {
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const seg = Math.min(700, Math.max(64, pts.length * 3));
    return mesh(new THREE.TubeGeometry(curve, seg, r, 14, false), m);
}

function lathe(profile, m, seg = 48) {
    return mesh(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg), m);
}

// Pavillon évasé le long de +Y : rayon r0 -> r1, k = force de l'évasement
function bell(len, r0, r1, k, m, rimM = m) {
    const prof = [];
    for (let i = 0; i <= 40; i++) {
        const t = i / 40;
        prof.push([r0 + (r1 - r0) * Math.pow(t, k), t * len]);
    }
    const g = new THREE.Group();
    g.add(lathe(prof, m, 56));
    const rim = mesh(new THREE.TorusGeometry(r1, Math.max(0.008, r1 * 0.035), 10, 56), rimM);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = len;
    g.add(rim);
    return g;
}

// Embouchure de cuivre (tige le long de +Y, cuvette au bout)
function mouthpiece(m, s = 1) {
    return lathe([[0.016, 0], [0.02, 0.12], [0.024, 0.19], [0.03, 0.215], [0.055, 0.24],
        [0.062, 0.265], [0.058, 0.275], [0.035, 0.27]].map(([r, y]) => [r * s, y * s]), m, 32);
}

// Piston vertical avec son bouton nacré
function piston(pos, h, r, buttonUp) {
    const g = new THREE.Group();
    g.add(cyl(r, r, h, M.brass));
    const top = cyl(r * 1.12, r * 1.12, h * 0.08, M.brass);
    top.position.y = h / 2;
    const bottom = cyl(r * 1.1, r * 1.1, h * 0.1, M.brass);
    bottom.position.y = -h / 2;
    const stem = cyl(r * 0.22, r * 0.22, buttonUp, M.silver);
    stem.position.y = h / 2 + buttonUp / 2;
    const btn = cyl(r * 0.9, r * 0.9, r * 0.4, M.pearl);
    btn.position.y = h / 2 + buttonUp;
    g.add(top, bottom, stem, btn);
    g.position.copy(pos);
    return g;
}

// Plateau de clé (bois) orienté selon la normale
function pad(pos, normal, r, m = M.brass, pearl = false) {
    const g = new THREE.Group();
    g.add(cyl(r, r, r * 0.35, m));
    if (pearl) {
        const p = cyl(r * 0.55, r * 0.55, r * 0.25, M.pearl);
        p.position.y = r * 0.25;
        g.add(p);
    }
    return place(g, pos, normal);
}

// Anneau de clé (clarinette, hautbois) sur la face avant
function ringKey(y, r, z) {
    const g = new THREE.Group();
    const ring = mesh(new THREE.TorusGeometry(r, r * 0.27, 8, 24), M.silver);
    ring.position.set(0, y, z);
    const hole = place(cyl(r * 0.72, r * 0.72, 0.004, M.dark), V(0, y, z + 0.001), V(0, 0, 1));
    g.add(ring, hole);
    return g;
}

function hoop(r, tubeR, m) {
    const t = mesh(new THREE.TorusGeometry(r, tubeR, 10, 64), m);
    t.rotation.x = Math.PI / 2;
    return t;
}

/* =========================================================
   CUIVRES
   ========================================================= */

function trompette() {
    const g = new THREE.Group();
    const R = 0.042, zL = 0.12;
    g.add(tube(join(
        line(V(0, 0, zL), V(1.9, 0, zL)),
        arc(1.9, -0.2, 0.2, 90, -90, zL, 0),
        line(V(1.9, -0.4), V(0.75, -0.4)),
        arc(0.75, -0.6, 0.2, 90, 270),
        line(V(0.75, -0.8), V(1.75, -0.8))
    ), R, M.brass));
    g.add(place(bell(1.15, R, 0.3, 4.5, M.brass), V(1.75, -0.8), V(1, 0, 0)));
    g.add(place(mouthpiece(M.silver), V(0, 0, zL), V(-1, 0, 0)));
    [1.0, 1.15, 1.3].forEach(x => g.add(piston(V(x, -0.42, 0), 0.5, 0.056, 0.27)));
    // coulisses de pistons, derrière
    [[1.0, 0.3], [1.3, 0.22]].forEach(([x, d]) => g.add(tube(join(
        line(V(x - 0.03, -0.62, -0.07), V(x - 0.03, -0.62 - d, -0.07)),
        arc(x + 0.03, -0.62 - d, 0.06, 180, 360, -0.07),
        line(V(x + 0.09, -0.62 - d, -0.07), V(x + 0.09, -0.62, -0.07))
    ), 0.018, M.brass)));
    // entretoises
    g.add(between(V(1.6, -0.4), V(1.6, -0.8), 0.012, M.brass));
    g.add(between(V(1.7, 0, zL), V(1.7, -0.4), 0.012, M.brass));
    // crochet de petit doigt
    const hook = mesh(new THREE.TorusGeometry(0.035, 0.008, 8, 16, Math.PI), M.brass);
    hook.position.set(0.9, 0.05, zL);
    g.add(hook);
    return { group: g, view: V(0.3, 0.25, 1) };
}

function trombone() {
    const g = new THREE.Group();
    const R = 0.024;
    g.add(tube(join(
        line(V(0, 0), V(3.0, 0)),
        arc(3.0, -0.11, 0.11, 90, -90),
        line(V(3.0, -0.22), V(-0.35, -0.22)),
        arc(-0.35, 0.14, 0.36, 270, 90),
        line(V(-0.35, 0.5), V(0.9, 0.5))
    ), R, M.brass));
    g.add(place(bell(1.3, R, 0.33, 5, M.brass), V(0.9, 0.5), V(1, 0, 0)));
    g.add(place(mouthpiece(M.silver, 1.2), V(0, 0), V(-1, 0, 0)));
    // coulisse extérieure
    [0, -0.22].forEach(y => g.add(between(V(1.3, y), V(2.95, y), R * 1.4, M.brass)));
    g.add(between(V(1.35, 0), V(1.35, -0.22), 0.016, M.brass));
    g.add(between(V(0.18, 0), V(0.18, -0.22), 0.016, M.brass));
    g.add(between(V(0.2, 0.5), V(0.2, 0), 0.012, M.brass));
    // poignée de coulisse
    g.add(place(cyl(0.018, 0.018, 0.12, M.brass), V(1.42, -0.11), V(0, 1, 0)));
    return { group: g, view: V(0.3, 0.25, 1) };
}

function cor() {
    const g = new THREE.Group();
    const R = 0.032;
    // spirale principale (2,5 tours), finit en bas
    const T = 5 * Math.PI, phi0 = -Math.PI / 2 - T, pts = [];
    for (let i = 0; i <= 260; i++) {
        const th = T * i / 260, r = 0.5 + 0.32 * th / T, a = th + phi0;
        pts.push(V(r * Math.cos(a), r * Math.sin(a), 0));
    }
    const end = pts[pts.length - 1];
    const bellStart = end.clone().add(V(0.26, -0.03));
    g.add(tube(join(pts, line(end, bellStart)), R, M.brass));
    g.add(place(bell(1.05, R, 0.46, 4.2, M.brass), bellStart, V(1, -0.12, 0)));
    // raccord vers les palettes
    g.add(tube([V(0.24, 0.1), V(0.23, 0.28), V(0.13, 0.45), V(0, 0.5)], R, M.brass));
    g.add(tube(line(V(0.24, 0.1), V(-0.3, 0.1)), R, M.brass));
    // palettes (barillets rotatifs) + coulisses + leviers
    [-0.2, 0, 0.2].forEach(x => {
        const v = cyl(0.062, 0.062, 0.17, M.brass);
        v.rotation.x = Math.PI / 2;
        v.position.set(x, 0.1, 0);
        const cap = cyl(0.05, 0.05, 0.02, M.silver);
        cap.rotation.x = Math.PI / 2;
        cap.position.set(x, 0.1, 0.095);
        g.add(v, cap);
        g.add(tube(join(
            line(V(x - 0.035, 0.04), V(x - 0.035, -0.22)),
            arc(x, -0.22, 0.035, 180, 360),
            line(V(x + 0.035, -0.22), V(x + 0.035, 0.04))
        ), 0.017, M.brass));
        g.add(between(V(x, 0.17, 0.06), V(x - 0.12, 0.32, 0.09), 0.01, M.brass));
        g.add(place(cyl(0.022, 0.022, 0.01, M.pearl), V(x - 0.12, 0.32, 0.1), V(0, 0, 1)));
    });
    // branche d'embouchure
    g.add(tube([V(-0.3, 0.1), V(-0.42, 0.18, 0.07), V(-0.66, 0.42, 0.1), V(-0.98, 0.7, 0.12)], 0.026, M.brass));
    g.add(place(mouthpiece(M.silver), V(-0.98, 0.7, 0.12), V(-0.75, 0.62, 0.08)));
    return { group: g, view: V(0.25, 0.1, 1) };
}

function tuba() {
    const g = new THREE.Group();
    g.add(place(bell(1.25, 0.11, 0.56, 3.2, M.brass), V(0, 1.3), Y));
    g.add(between(V(0, 0.25), V(0, 1.3), 0.095, M.brass, 0.11));
    g.add(tube(arc(0.38, 0.25, 0.38, 180, 360), 0.095, M.brass));
    g.add(tube(join(
        line(V(0.76, 0.25), V(0.76, 0.9)),
        arc(0.9, 0.9, 0.14, 180, 90),
        line(V(0.9, 1.04), V(1.55, 1.04))
    ), 0.07, M.brass));
    [1.0, 1.15, 1.3, 1.45].forEach(x => {
        g.add(piston(V(x, 1.04, 0), 0.42, 0.06, 0.22));
        g.add(tube(join(
            line(V(x - 0.032, 0.83, -0.03), V(x - 0.032, 0.58, -0.03)),
            arc(x, 0.58, 0.032, 180, 360, -0.03),
            line(V(x + 0.032, 0.58, -0.03), V(x + 0.032, 0.83, -0.03))
        ), 0.02, M.brass));
    });
    // branche d'embouchure
    g.add(tube([V(1.55, 1.04), V(1.66, 1.15, 0.05), V(1.65, 1.45, 0.15), V(1.5, 1.7, 0.3), V(1.32, 1.8, 0.38)], 0.034, M.brass));
    g.add(place(mouthpiece(M.brass, 1.6), V(1.32, 1.8, 0.38), V(-0.6, 0.25, 0.4)));
    // entretoises
    g.add(between(V(0.1, 0.7), V(0.76, 0.7), 0.015, M.brass));
    g.add(between(V(0.16, 1.6), V(0.92, 1.12), 0.015, M.brass));
    return { group: g, view: V(0.6, 0.15, 1) };
}

/* =========================================================
   BOIS
   ========================================================= */

function flute() {
    const g = new THREE.Group();
    const r = 0.034;
    g.add(between(V(0, 0), V(2.6, 0), r, M.silver));
    // bouchon, jonctions
    g.add(between(V(-0.06, 0), V(0, 0), r * 1.12, M.silver));
    [0.62, 2.2].forEach(x => g.add(between(V(x - 0.02, 0), V(x + 0.02, 0), r * 1.12, M.silver)));
    // plaque d'embouchure + trou
    const plate = cyl(0.07, 0.07, 0.016, M.silver, 32);
    plate.scale.set(1.3, 1, 0.75);
    plate.position.set(0.3, r + 0.004, 0);
    const hole = cyl(0.022, 0.022, 0.004, M.dark, 24);
    hole.scale.set(1.4, 1, 0.9);
    hole.position.set(0.3, r + 0.014, 0);
    g.add(plate, hole);
    // clés à plateaux percés
    [0.95, 1.08, 1.21, 1.38, 1.51, 1.64, 1.8, 1.93, 2.06].forEach((x, i) => {
        g.add(place(cyl(0.03, 0.03, 0.018, M.silver), V(x, r + 0.008), Y));
        if (i % 4 !== 3) g.add(place(cyl(0.009, 0.009, 0.004, M.dark), V(x, r + 0.018), Y));
        g.add(between(V(x, r * 0.8, -0.012), V(x, 0.012, -0.045), 0.005, M.silver));
    });
    g.add(between(V(0.9, 0.012, -0.045), V(2.12, 0.012, -0.045), 0.006, M.silver));
    // patte d'ut
    [2.32, 2.42, 2.52].forEach(x => g.add(place(cyl(0.028, 0.028, 0.016, M.silver), V(x, r + 0.006, 0.01), Y)));
    g.add(between(V(2.3, 0.02, 0.045), V(2.55, 0.02, 0.045), 0.006, M.silver));
    g.rotation.z = 0.35;
    return { group: g, view: V(0.25, 0.4, 1) };
}

function clarinette() {
    const g = new THREE.Group();
    const r = 0.045;
    g.add(between(V(0, 0.28), V(0, 1.16), r, M.ebony));
    g.add(between(V(0, 1.18), V(0, 2.0), r, M.ebony));
    g.add(between(V(0, 2.0), V(0, 2.24), 0.05, M.ebony, 0.054));   // barillet
    g.add(between(V(0, 2.24), V(0, 2.52), 0.045, M.ebony, 0.028));  // bec
    const reed = box(0.04, 0.26, 0.008, M.cane);
    reed.position.set(0, 2.4, -0.036);
    reed.rotation.x = 0.06;
    g.add(reed);
    const lig = mesh(new THREE.TorusGeometry(0.042, 0.006, 8, 32), M.silver);
    lig.rotation.x = Math.PI / 2;
    lig.position.y = 2.33;
    g.add(lig);
    [[0.28, 0.049], [1.16, 0.049], [1.18, 0.049], [2.0, 0.056], [2.24, 0.056]].forEach(([y, rr]) => {
        const t = hoop(rr, 0.007, M.silver);
        t.position.y = y;
        g.add(t);
    });
    g.add(place(bell(0.3, r, 0.12, 2.2, M.ebony, M.silver), V(0, 0.28), V(0, -1, 0)));
    [0.5, 0.62, 0.74, 1.38, 1.5, 1.62].forEach(y => g.add(ringKey(y, 0.017, r)));
    // leviers et tringles
    [0.36, 0.42, 0.86, 0.95, 1.8, 1.88].forEach((y, i) => {
        const k = box(0.022, 0.06, 0.01, M.silver);
        k.position.set(i % 2 ? -0.03 : 0.03, y, r + 0.008);
        g.add(k);
    });
    g.add(between(V(0.03, 0.4, r + 0.006), V(0.03, 1.05, r + 0.006), 0.005, M.silver));
    g.add(between(V(-0.03, 1.25, r + 0.006), V(-0.03, 1.92, r + 0.006), 0.005, M.silver));
    g.add(between(V(r + 0.004, 0.55, 0.01), V(r + 0.004, 1.7, 0.01), 0.005, M.silver));
    // trou de pouce + clé de douzième, porte-pouce
    g.add(place(ringKey(0, 0.017, 0), V(0, 1.55, -r), V(0, 0, -1)));
    const thumb = box(0.03, 0.05, 0.03, M.silver);
    thumb.position.set(0, 1.0, -r - 0.012);
    g.add(thumb);
    g.rotation.z = -0.7;
    return { group: g, view: V(0.4, 0.2, 1) };
}

function hautbois() {
    const g = new THREE.Group();
    // corps conique (plus fin en haut)
    g.add(between(V(0, 0.25), V(0, 1.16), 0.048, M.ebony, 0.04));
    g.add(between(V(0, 1.18), V(0, 2.1), 0.039, M.ebony, 0.03));
    [[0.25, 0.052], [1.16, 0.044], [1.18, 0.043], [2.1, 0.034]].forEach(([y, rr]) => {
        const t = hoop(rr, 0.006, M.silver);
        t.position.y = y;
        g.add(t);
    });
    g.add(place(bell(0.26, 0.048, 0.088, 1.8, M.ebony, M.silver), V(0, 0.25), V(0, -1, 0)));
    // anche double : tube liège + fil + lamelles de roseau
    g.add(between(V(0, 2.1), V(0, 2.19), 0.017, M.cork, 0.012));
    g.add(between(V(0, 2.19), V(0, 2.23), 0.012, M.rubber));
    const reed = box(0.03, 0.12, 0.006, M.cane);
    reed.scale.set(1, 1, 1);
    reed.position.y = 2.29;
    g.add(reed);
    const rAt = y => 0.048 - 0.018 * (y - 0.25) / 1.85;
    [0.5, 0.6, 0.7, 1.4, 1.5, 1.6].forEach(y => g.add(ringKey(y, 0.014, rAt(y))));
    // tringles et clés latérales (le hautbois en a beaucoup)
    [-1, 1].forEach(side => {
        g.add(between(V(side * 0.034, 0.35, 0.03), V(side * 0.031, 1.05, 0.026), 0.0045, M.silver));
        g.add(between(V(side * 0.03, 1.25, 0.024), V(side * 0.027, 1.95, 0.02), 0.0045, M.silver));
    });
    [0.38, 0.85, 0.95, 1.3, 1.75, 1.85].forEach((y, i) => {
        const s = i % 2 ? -1 : 1;
        g.add(pad(V(s * (rAt(y) + 0.008), y, 0.012), V(s, 0, 0.3), 0.016, M.silver));
    });
    [1.7, 1.95].forEach(y => g.add(pad(V(0, y, -(rAt(y) + 0.006)), V(0, 0, -1), 0.014, M.silver)));
    g.rotation.z = -0.7;
    return { group: g, view: V(0.4, 0.2, 1) };
}

function saxophone() {
    const g = new THREE.Group();
    const rb = y => 0.05 + 0.09 * (2.35 - y) / 1.95;
    // corps conique, culasse, pavillon
    g.add(place(lathe([[0.05, 0], [0.14, 1.95]], M.brass, 40), V(0, 2.35), V(0, -1, 0)));
    g.add(tube(arc(0.27, 0.4, 0.27, 180, 360), 0.14, M.brass));
    g.add(place(lathe([[0.15, 0], [0.19, 0.65]], M.brass, 40), V(0.54, 0.4), Y));
    g.add(place(bell(0.4, 0.19, 0.42, 2.2, M.brass), V(0.54, 1.05), V(0.3, 1, 0)));
    // bocal + bec
    g.add(tube([V(0, 2.33), V(0, 2.5), V(-0.06, 2.62), V(-0.2, 2.68), V(-0.36, 2.68)], 0.035, M.brass));
    g.add(between(V(-0.36, 2.68), V(-0.58, 2.68), 0.045, M.ebony, 0.028));
    const lig = mesh(new THREE.TorusGeometry(0.044, 0.007, 8, 24), M.silver);
    lig.rotation.y = Math.PI / 2;
    lig.position.set(-0.42, 2.68, 0);
    g.add(lig);
    g.add(between(V(-0.1, 2.66, 0.04), V(0.0, 2.48, 0.04), 0.006, M.brass)); // clé d'octave
    // clés avant (nacrées pour les doigts principaux)
    for (let i = 0; i <= 10; i++) {
        const y = 0.7 + i * 0.14;
        g.add(pad(V(0, y, rb(y) + 0.012), V(0, 0, 1), 0.045, M.brass, i >= 4 && i <= 9));
    }
    g.add(tube([0.65, 0.95, 1.25, 1.55, 1.85, 2.15].map(y => V(0.07, y, rb(y))), 0.008, M.brass));
    [0.9, 1.3, 1.7].forEach(y => g.add(pad(V(-(rb(y) + 0.012), y, 0), V(-1, 0, 0), 0.04)));
    [0.55, 0.75, 0.95].forEach(y => g.add(pad(V(0.54 + 0.17 + 0.012 * (y / 0.55), y, 0), V(1, 0, 0), 0.05)));
    // porte-pouce
    const thumb = box(0.05, 0.03, 0.04, M.brass);
    thumb.position.set(0, 1.1, -rb(1.1) - 0.015);
    g.add(thumb);
    return { group: g, view: V(0.5, 0.1, 1) };
}

/* =========================================================
   PERCUSSIONS
   ========================================================= */

function stick(a, b) {
    const g = new THREE.Group();
    g.add(between(a, b, 0.02, M.wood, 0.012));
    const tip = mesh(new THREE.SphereGeometry(0.018, 12, 10), M.wood);
    tip.position.copy(b);
    g.add(tip);
    return g;
}

function caisseClaire() {
    const g = new THREE.Group();
    const R = 0.7, H = 0.34;
    g.add(mesh(new THREE.CylinderGeometry(R, R, H, 64, 1, true), M.lacquer));
    [H / 2, -H / 2].forEach(y => {
        const head = cyl(R, R, 0.008, M.head, 64);
        head.position.y = y;
        const h = hoop(R + 0.02, 0.022, M.silver);
        h.position.y = y + Math.sign(y) * 0.01;
        g.add(head, h);
    });
    for (let i = 0; i < 8; i++) {
        const a = i / 8 * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
        const lug = box(0.05, 0.12, 0.06, M.silver);
        lug.position.set(c * (R + 0.02), 0, s * (R + 0.02));
        lug.rotation.y = -a;
        g.add(lug);
        const rr = R + 0.035;
        g.add(between(V(c * rr, 0.05, s * rr), V(c * rr, H / 2 + 0.02, s * rr), 0.008, M.silver));
        g.add(between(V(c * rr, -H / 2 - 0.02, s * rr), V(c * rr, -0.05, s * rr), 0.008, M.silver));
    }
    const strainer = box(0.08, 0.1, 0.05, M.silver);
    strainer.position.set(Math.cos(Math.PI / 8) * (R + 0.03), 0, Math.sin(Math.PI / 8) * (R + 0.03));
    strainer.rotation.y = -Math.PI / 8;
    g.add(strainer);
    g.add(stick(V(-0.5, H / 2 + 0.03, 0.55), V(0.25, H / 2 + 0.03, -0.2)));
    g.add(stick(V(0.55, H / 2 + 0.07, 0.5), V(-0.15, H / 2 + 0.07, -0.25)));
    return { group: g, view: V(0.3, 0.8, 1) };
}

function grosseCaisse() {
    const g = new THREE.Group();
    const R = 1, D = 0.55;
    const shell = mesh(new THREE.CylinderGeometry(R, R, D, 72, 1, true), M.lacquer);
    shell.rotation.x = Math.PI / 2;
    g.add(shell);
    [D / 2, -D / 2].forEach(z => {
        const head = cyl(R, R, 0.01, M.head, 72);
        head.rotation.x = Math.PI / 2;
        head.position.z = z;
        const h = mesh(new THREE.TorusGeometry(R + 0.02, 0.05, 12, 72), M.wood);
        h.position.z = z + Math.sign(z) * 0.02;
        g.add(head, h);
        for (let i = 0; i < 10; i++) {
            const a = (i + 0.5) / 10 * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
            const lug = box(0.06, 0.06, 0.1, M.silver);
            lug.position.set(c * (R + 0.03), s * (R + 0.03), Math.sign(z) * 0.14);
            g.add(lug);
            g.add(between(V(c * (R + 0.05), s * (R + 0.05), Math.sign(z) * 0.19), V(c * (R + 0.05), s * (R + 0.05), z + Math.sign(z) * 0.05), 0.01, M.silver));
        }
    });
    // emblème lyre sur la peau avant
    const z = D / 2 + 0.015, s = 0.035;
    const P = (x, y) => V((x - 12) * s, (12 - y) * s, z);
    g.add(tube([P(7, 3), P(5.3, 5), P(5, 8), P(7, 12), P(7.6, 15), P(7, 18)], 0.016, M.brass));
    g.add(tube([P(17, 3), P(18.7, 5), P(19, 8), P(17, 12), P(16.4, 15), P(17, 18)], 0.016, M.brass));
    g.add(between(P(6.6, 18), P(17.4, 18), 0.016, M.brass));
    g.add(between(P(6, 6.5), P(18, 6.5), 0.016, M.brass));
    [10, 12, 14].forEach(x => g.add(between(P(x, 6.5), P(x, 18), 0.006, M.brass)));
    const ring = mesh(new THREE.TorusGeometry(0.62, 0.012, 8, 72), M.brass);
    ring.position.z = z;
    g.add(ring);
    // pieds et mailloche
    [-1, 1].forEach(sx => g.add(between(V(sx * 0.6, -0.75, 0.1), V(sx * 0.95, -1.2, 0.35), 0.02, M.silver)));
    g.add(between(V(0.85, 1.05, 0.5), V(0.28, 0.2, 0.42), 0.022, M.wood, 0.016));
    const felt = mesh(new THREE.SphereGeometry(0.1, 20, 16), M.felt);
    felt.position.set(0.25, 0.15, 0.42);
    g.add(felt);
    return { group: g, view: V(0.6, 0.2, 1) };
}

function cymbal() {
    const prof = [[0, 0.14], [0.04, 0.14], [0.09, 0.125], [0.13, 0.09], [0.16, 0.07]];
    for (let i = 1; i <= 24; i++) {
        const t = i / 24;
        prof.push([0.16 + 0.74 * t, 0.07 * (1 - t)]);
    }
    const g = new THREE.Group();
    g.add(lathe(prof, M.cymbal, 72));
    // sangle de cuir
    const strap = mesh(new THREE.TorusGeometry(0.06, 0.018, 8, 20), M.leather);
    strap.position.y = 0.2;
    g.add(strap);
    g.add(cyl(0.025, 0.025, 0.06, M.leather));
    g.children[2].position.y = 0.16;
    return g;
}

function cymbales() {
    const g = new THREE.Group();
    const a = cymbal();
    a.rotation.set(0, -0.3, Math.PI / 2);
    a.position.set(-0.5, 0, 0);
    const b = cymbal();
    b.rotation.set(0, 0.3, -Math.PI / 2);
    b.position.set(0.5, 0, 0);
    g.add(a, b);
    return { group: g, view: V(0.7, 0.3, 1) };
}

function xylophone() {
    const g = new THREE.Group();
    const n = 15;
    for (let i = 0; i < n; i++) {
        const t = i / (n - 1), L = 0.95 - 0.45 * t, x = -1 + 2 * t;
        const bar = box(0.115, 0.05, L, M.rosewood);
        bar.position.set(x, 0, 0);
        g.add(bar);
        const h = 0.2 + 0.55 * (1 - t);
        const res = cyl(0.045, 0.045, h, M.silver, 20);
        res.position.set(x, -0.08 - h / 2, 0);
        g.add(res);
    }
    // cadre : rails aux nœuds de vibration, pieds, traverse
    [1, -1].forEach(sz => {
        g.add(between(V(-1.08, -0.04, sz * 0.266), V(1.08, -0.04, sz * 0.14), 0.025, M.wood));
        g.add(between(V(-1.05, -0.05, sz * 0.26), V(-1.05, -1.05, sz * 0.3), 0.025, M.wood));
        g.add(between(V(1.05, -0.05, sz * 0.14), V(1.05, -1.05, sz * 0.2), 0.025, M.wood));
    });
    g.add(between(V(-1.05, -0.95, 0), V(1.05, -0.95, 0), 0.02, M.wood));
    // maillets
    [[V(0.2, 0.08, 0.75), V(-0.25, 0.08, 0.05)], [V(0.5, 0.12, 0.75), V(0.15, 0.12, 0.0)]].forEach(([a, b]) => {
        g.add(between(a, b, 0.01, M.wood));
        const head = mesh(new THREE.SphereGeometry(0.045, 16, 12), M.rubber);
        head.position.copy(b);
        g.add(head);
    });
    return { group: g, view: V(0.3, 0.75, 1) };
}

export const BUILDERS = {
    trompette, trombone, cor, tuba,
    flute, clarinette, hautbois, saxophone,
    'caisse-claire': caisseClaire, 'grosse-caisse': grosseCaisse, cymbales, xylophone,
};

export function build(id) {
    return BUILDERS[id]();
}
