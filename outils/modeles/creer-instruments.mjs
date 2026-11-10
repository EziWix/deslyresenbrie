/* =========================================================
   Crée par code les modèles 3D (models/*.glb) de :
   clarinette basse, saxophone ténor, saxophone baryton,
   euphonium, contrebasse, piano à queue, mélodica.

   Matières reprises des modèles existants (Laiton poli, Maillechort
   argenté, Ébène, Nacre…) pour un rendu cohérent sur le site.

   Usage (depuis ce dossier) :  node creer-instruments.mjs [nom…]
   Sans argument : tous les modèles. Unités : mètres, Y vers le haut.
   ========================================================= */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

globalThis.FileReader = class {
    readAsArrayBuffer(blob) { blob.arrayBuffer().then(buf => { this.result = buf; this.onloadend?.(); }); }
};

const MODELS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'models');
const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);
const Y = V(0, 1, 0);
const TAU = Math.PI * 2;

/* ---------- matières ---------- */
const M = {};
async function collectMaterials(files) {
    const loader = new GLTFLoader();
    for (const f of files) {
        const buf = await readFile(path.join(MODELS, f));
        const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
        const scene = await new Promise((ok, ko) => loader.parse(ab, '', g => ok(g.scene), ko));
        scene.traverse(o => { if (o.isMesh && o.material && !M[o.material.name]) M[o.material.name] = o.material; });
    }
}
function newMat(name, rgb, metal, rough, doubleSide = false) {
    const m = new THREE.MeshStandardMaterial({ name, metalness: metal, roughness: rough });
    m.color.setRGB(...rgb);
    if (doubleSide) m.side = THREE.DoubleSide;
    return m;
}
const ds = m => { const c = m.clone(); c.side = THREE.DoubleSide; return c; };

/* ---------- outils de construction ---------- */
const mesh = (geo, mat) => new THREE.Mesh(geo, mat);
const cyl = (rTop, rBot, h, mat, seg = 32, open = false) => mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, open), mat);
const box = (w, h, d, mat) => mesh(new THREE.BoxGeometry(w, h, d), mat);
const sphere = (r, mat, seg = 20) => mesh(new THREE.SphereGeometry(r, seg, Math.round(seg * 0.7)), mat);
const lathe = (pts, mat, seg = 56) => mesh(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg), mat);
const group = (...c) => { const g = new THREE.Group(); c.forEach(o => g.add(o)); return g; };
function at(o, x, y, z) { o.position.set(x, y, z); return o; }
function place(o, pos, dir) { o.position.copy(pos); o.quaternion.setFromUnitVectors(Y, dir.clone().normalize()); return o; }
function between(a, b, r, mat, rB = r, seg = 14) {
    const c = cyl(rB, r, a.distanceTo(b), mat, seg);
    c.position.copy(a).add(b).multiplyScalar(0.5);
    c.quaternion.setFromUnitVectors(Y, b.clone().sub(a).normalize());
    return c;
}
function ring(R, r, mat, normal = Y, seg = 40) {
    const t = mesh(new THREE.TorusGeometry(R, r, 8, seg), mat);
    t.quaternion.setFromUnitVectors(V(0, 0, 1), normal.clone().normalize());
    return t;
}

// Tube courbe dont le rayon varie le long du trajet (corps coniques)
function curveOf(pts) { return new THREE.CatmullRomCurve3(pts, false, 'centripetal'); }
function taperedTube(curve, rFn, mat, seg = 160, radial = 22) {
    const frames = curve.computeFrenetFrames(seg, false);
    const pos = [], nor = [], idx = [];
    for (let i = 0; i <= seg; i++) {
        const t = i / seg, P = curve.getPointAt(t), N = frames.normals[i], B = frames.binormals[i], r = rFn(t);
        for (let j = 0; j <= radial; j++) {
            const a = j / radial * TAU, c = Math.cos(a), s = -Math.sin(a);
            const n = V(c * N.x + s * B.x, c * N.y + s * B.y, c * N.z + s * B.z);
            pos.push(P.x + r * n.x, P.y + r * n.y, P.z + r * n.z);
            nor.push(n.x, n.y, n.z);
        }
    }
    for (let i = 0; i < seg; i++) for (let j = 0; j < radial; j++) {
        const a = i * (radial + 1) + j, b = (i + 1) * (radial + 1) + j;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setIndex(idx);
    return mesh(g, mat);
}
const tube = (pts, r, mat, rEnd = r) => taperedTube(curveOf(pts), t => r + (rEnd - r) * t, mat, Math.max(48, pts.length * 12), 16);

// Pavillon évasé le long de +Y (r0 -> r1), bord roulé
function bell(len, r0, r1, k, mat, rimMat = mat) {
    const prof = [];
    for (let i = 0; i <= 36; i++) { const t = i / 36; prof.push([r0 + (r1 - r0) * t ** k, t * len]); }
    const rim = at(ring(r1, Math.max(0.004, r1 * 0.035), rimMat), 0, len, 0);
    return group(lathe(prof, mat, 64), rim);
}
// Embouchure de cuivre (tige vers +Y, cuvette au bout)
function mouthpiece(mat, s = 1) {
    return lathe([[0.006, 0], [0.007, 0.05], [0.009, 0.075], [0.012, 0.085], [0.021, 0.095], [0.024, 0.105], [0.022, 0.11], [0.013, 0.108]]
        .map(([r, y]) => [r * s, y * s]), mat, 28);
}
// Plateau de clé : disque + bouton nacré facultatif
function pad(pos, normal, r, mat, pearl = false) {
    const g = group(cyl(r, r, r * 0.3, mat, 20));
    if (pearl) g.add(at(cyl(r * 0.6, r * 0.6, r * 0.25, M.pearl, 16), 0, r * 0.25, 0));
    return place(g, pos, normal);
}
// Piston vertical avec bouton nacré
function piston(pos, h, r, up) {
    const g = group(cyl(r, r, h, M.brass, 24),
        at(cyl(r * 1.15, r * 1.15, h * 0.08, M.brass, 24), 0, h / 2, 0),
        at(cyl(r * 1.12, r * 1.12, h * 0.1, M.brass, 24), 0, -h / 2, 0),
        at(cyl(r * 0.2, r * 0.2, up, M.chrome, 10), 0, h / 2 + up / 2, 0),
        at(cyl(r * 0.85, r * 0.85, r * 0.35, M.pearl, 20), 0, h / 2 + up, 0));
    g.position.copy(pos);
    return g;
}

/* =========================================================
   SAXOPHONES
   type : 'tenor' (bocal à bosse) ou 'baryton' (boucle au-dessus du corps)
   ========================================================= */
function saxophone(type) {
    const g = new THREE.Group();
    const H = type === 'baryton' ? 1.05 : 0.8;  // hauteur du corps
    const rBody = t => H * (0.03 + 0.072 * t);

    // corps : descente, culasse en U, remontée vers le pavillon
    const body = curveOf([V(0, H), V(0, 0.72 * H), V(0, 0.36 * H), V(0.025 * H, 0.13 * H), V(0.13 * H, 0.025 * H),
        V(0.26 * H, 0.07 * H), V(type === 'baryton' ? 0.34 * H : 0.32 * H, 0.22 * H), V(type === 'baryton' ? 0.355 * H : 0.335 * H, 0.38 * H)]);
    g.add(taperedTube(body, rBody, M.brass, 200, 26));
    const end = body.getPointAt(1), dir = body.getTangentAt(1).add(V(0.12, 0, 0)).normalize();
    g.add(place(bell(0.2 * H, rBody(1), (type === 'baryton' ? 0.2 : 0.19) * H, 2.4, M.brass), end, dir));
    // anneaux de renfort
    [0.02, 0.62].forEach(t => g.add(place(ring(rBody(t) + 0.003, 0.004, M.brass), body.getPointAt(t), body.getTangentAt(t))));

    // bocal (et boucle du baryton)
    let neckPts;
    if (type === 'baryton') {
        neckPts = [V(0, H), V(0, H * 1.07)];
        for (let i = 1; i <= 16; i++) {
            const a = i / 16 * TAU;
            neckPts.push(V(-0.065 * H + 0.065 * H * Math.cos(a), H * 1.07 + 0.065 * H * Math.sin(a), 0.07 * H * i / 16));
        }
        neckPts.push(V(-0.02 * H, H * 1.17, 0.09 * H), V(-0.1 * H, H * 1.21, 0.11 * H), V(-0.17 * H, H * 1.2, 0.12 * H));
    } else {
        neckPts = [V(0, H), V(0.004 * H, H * 1.08), V(-0.03 * H, H * 1.165), V(-0.1 * H, H * 1.195), V(-0.17 * H, H * 1.175), V(-0.225 * H, H * 1.14)];
    }
    const neck = curveOf(neckPts);
    g.add(taperedTube(neck, t => H * (0.03 - 0.013 * t), M.brass, 140, 18));
    // bec + ligature
    const nEnd = neck.getPointAt(1), nDir = neck.getTangentAt(1);
    const mp = cyl(0.012 * H, 0.022 * H, 0.11 * H, M.ebony, 20);
    g.add(place(mp, nEnd.clone().addScaledVector(nDir, 0.055 * H), nDir));
    g.add(place(ring(0.02 * H, 0.0035, M.chrome), nEnd.clone().addScaledVector(nDir, 0.03 * H), nDir));
    // clé d'octave sur le bocal
    const o1 = neck.getPointAt(0.25), o2 = neck.getPointAt(0.55);
    g.add(between(o1.clone().add(V(0, 0, 0.03 * H)), o2.clone().add(V(0, 0, 0.03 * H)), 0.0035, M.brass));

    // clés avant (nacrées pour les 6 doigts), clés latérales, clés du pavillon
    for (let i = 0; i < 12; i++) {
        const t = 0.06 + i * 0.026;
        const p = body.getPointAt(t);
        g.add(pad(p.clone().add(V(0, 0, rBody(t) + 0.006)), V(0, 0, 1), 0.024 * H, M.brass, i >= 2 && i <= 8 && i !== 5));
    }
    g.add(tube([0.05, 0.15, 0.25, 0.35].map(t => body.getPointAt(t).add(V(0.035 * H, 0, rBody(t) * 0.7))), 0.003, M.brass));
    [0.12, 0.2, 0.28].forEach(t => g.add(pad(body.getPointAt(t).add(V(-rBody(t) - 0.005, 0, 0)), V(-1, 0, 0), 0.02 * H, M.brass)));
    [0.74, 0.82, 0.9].forEach(t => g.add(pad(body.getPointAt(t).add(V(rBody(t) + 0.005, 0, 0)), V(1, 0, 0), 0.03 * H, M.brass)));
    // garde-clé près de la culasse, porte-pouce
    g.add(tube([body.getPointAt(0.5).add(V(0.02, 0, 0.05)), body.getPointAt(0.56).add(V(0.03, -0.01, 0.07)), body.getPointAt(0.62).add(V(0.02, 0, 0.06))], 0.003, M.brass));
    const thumb = body.getPointAt(0.24);
    g.add(at(box(0.04 * H, 0.025 * H, 0.03 * H, M.brass), thumb.x, thumb.y, -rBody(0.24) - 0.01));
    if (type === 'baryton') {  // clé de la grave basse sur le pavillon
        g.add(pad(body.getPointAt(0.95).add(V(-rBody(0.95) - 0.005, 0.02, 0)), V(-1, 0.2, 0), 0.035 * H, M.brass));
    }
    return g;
}

/* =========================================================
   CLARINETTE BASSE
   ========================================================= */
function clarinetteBasse() {
    const g = new THREE.Group();
    const r = 0.03;
    g.add(at(cyl(r, r, 0.4, M.ebony, 28), 0, 0.42, 0));
    g.add(at(cyl(r, r, 0.42, M.ebony, 28), 0, 0.85, 0));
    [0.22, 0.62, 0.64, 1.06].forEach(y => g.add(at(ring(r + 0.003, 0.005, M.chrome), 0, y, 0)));
    // culasse en U et pavillon métallique tourné vers le haut
    const u = curveOf([V(0, 0.23), V(0, 0.15), V(0.02, 0.09), V(0.07, 0.065), V(0.12, 0.09), V(0.14, 0.15), V(0.145, 0.2)]);
    g.add(taperedTube(u, t => r + 0.012 * t, M.chrome, 80, 22));
    g.add(place(bell(0.15, r + 0.012, 0.1, 2.2, M.chrome), u.getPointAt(1), u.getTangentAt(1).add(V(0.15, 0, 0.1))));
    // bocal recourbé + bec
    const crook = curveOf([V(0, 1.06), V(0, 1.13), V(-0.02, 1.19), V(-0.07, 1.22), V(-0.13, 1.2), V(-0.16, 1.15)]);
    g.add(taperedTube(crook, t => 0.017 - 0.004 * t, M.chrome, 90, 16));
    const ce = crook.getPointAt(1), cd = crook.getTangentAt(1);
    g.add(place(cyl(0.009, 0.015, 0.075, M.ebony, 18), ce.clone().addScaledVector(cd, 0.037), cd));
    g.add(place(ring(0.0145, 0.003, M.chrome), ce.clone().addScaledVector(cd, 0.02), cd));
    // anneaux et grands plateaux
    [0.36, 0.43, 0.5, 0.74, 0.81, 0.88].forEach(y => {
        g.add(at(ring(0.013, 0.0035, M.chrome, V(0, 0, 1)), 0, y, r + 0.002));
        g.add(at(cyl(0.009, 0.009, 0.003, M.rubber, 14), 0, y, r + 0.001).rotateX(Math.PI / 2));
    });
    [0.28, 0.56, 0.68, 0.95, 1.0].forEach((y, i) =>
        g.add(pad(V((i % 2 ? -1 : 1) * (r + 0.004), y, 0.012), V(i % 2 ? -1 : 1, 0, 0.3), 0.02, M.chrome)));
    [[0.025, 0.25, 0.6], [-0.025, 0.66, 1.0], [0.028, 0.66, 0.98]].forEach(([x, y0, y1]) =>
        g.add(between(V(x, y0, r + 0.006), V(x, y1, r + 0.006), 0.003, M.chrome)));
    // porte-pouce et pique au sol
    g.add(at(box(0.025, 0.035, 0.025, M.chrome), 0, 0.55, -r - 0.012));
    g.add(between(V(0.07, 0.07, -0.01), V(0.06, 0.0, -0.02), 0.004, M.chrome));
    g.add(at(sphere(0.008, M.rubber, 12), 0.06, 0.006, -0.02));
    return g;
}

/* =========================================================
   EUPHONIUM
   ========================================================= */
function euphonium() {
    const g = new THREE.Group();
    // pavillon vers le haut, légèrement vers l'avant droit
    g.add(place(bell(0.34, 0.042, 0.15, 3, M.brass), V(0, 0.38), V(0.12, 1, 0.05)));
    // grosse branche : descente, culasse, remontée
    const main = curveOf([V(0, 0.385), V(0, 0.25), V(0.01, 0.13), V(0.08, 0.075), V(0.17, 0.09), V(0.2, 0.16), V(0.2, 0.3), V(0.23, 0.37), V(0.27, 0.385)]);
    g.add(taperedTube(main, t => 0.042 - 0.02 * t, M.brass, 160, 22));
    // pistons (3 sur le dessus) + 4e piston latéral
    [0.29, 0.335, 0.38].forEach(x => g.add(piston(V(x, 0.385, 0), 0.13, 0.019, 0.065)));
    g.add(tube([V(0.27, 0.385), V(0.43, 0.385)], 0.015, M.brass));
    const fourth = piston(V(0.44, 0.33, 0.035), 0.12, 0.018, 0.05);
    fourth.rotation.x = 0.35;
    g.add(fourth, tube([V(0.43, 0.385), V(0.45, 0.36, 0.02), V(0.44, 0.33, 0.035)], 0.014, M.brass));
    // coulisses sous les pistons
    [0.29, 0.335, 0.38].forEach((x, i) => {
        const d = 0.09 + i * 0.03;
        g.add(tube([V(x - 0.011, 0.32, -0.012), V(x - 0.011, 0.32 - d, -0.012), V(x, 0.31 - d, -0.012), V(x + 0.011, 0.32 - d, -0.012), V(x + 0.011, 0.32, -0.012)], 0.008, M.brass));
    });
    // grande coulisse d'accord à l'arrière
    g.add(tube([V(0.2, 0.22, -0.02), V(0.3, 0.2, -0.06), V(0.36, 0.15, -0.06), V(0.3, 0.11, -0.05), V(0.21, 0.12, -0.02)], 0.013, M.brass));
    // branche d'embouchure vers le musicien
    const lead = curveOf([V(0.43, 0.39), V(0.47, 0.45, 0.03), V(0.45, 0.54, 0.09), V(0.4, 0.6, 0.14)]);
    g.add(taperedTube(lead, t => 0.011 - 0.003 * t, M.brass, 60, 14));
    g.add(place(mouthpiece(M.chrome, 0.95), lead.getPointAt(1), lead.getTangentAt(1)));
    // entretoises
    g.add(between(V(0.05, 0.3), V(0.19, 0.28), 0.005, M.brass), between(V(0.07, 0.55), V(0.27, 0.43), 0.005, M.brass));
    return g;
}

/* =========================================================
   CONTREBASSE
   ========================================================= */
function contrebasse() {
    const g = new THREE.Group();
    const base = 0.16;  // hauteur du bas de la caisse (pique)

    // caisse : contour à épaules tombantes, extrudé avec bords arrondis
    const half = [[0, 1.1], [0.12, 1.09], [0.2, 1.03], [0.255, 0.9], [0.27, 0.79], [0.245, 0.69], [0.185, 0.61],
        [0.215, 0.52], [0.305, 0.42], [0.34, 0.28], [0.315, 0.11], [0.2, 0.025], [0, 0]];
    const pts = half.map(([x, y]) => new THREE.Vector2(x, y))
        .concat(half.slice(1, -1).reverse().map(([x, y]) => new THREE.Vector2(-x, y)));
    const shape = new THREE.Shape();
    shape.moveTo(pts[0].x, pts[0].y);
    shape.splineThru(pts.slice(1).concat([pts[0]]));
    const D = 0.17;
    const bodyGeo = new THREE.ExtrudeGeometry(shape, { depth: D, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.022, bevelSegments: 3, curveSegments: 14 });
    bodyGeo.translate(0, 0, -D / 2);
    g.add(at(mesh(bodyGeo, M.maple), 0, base, 0));
    const front = D / 2 + 0.035;  // face avant de la table

    // ouïes en f
    [-1, 1].forEach(s => {
        const f = new THREE.Group();
        f.add(at(box(0.012, 0.15, 0.004, M.rubber), 0, 0, 0));
        f.add(at(cyl(0.012, 0.012, 0.004, M.rubber, 12).rotateX(Math.PI / 2), 0.012 * s, 0.078, 0));
        f.add(at(cyl(0.012, 0.012, 0.004, M.rubber, 12).rotateX(Math.PI / 2), -0.012 * s, -0.078, 0));
        f.rotation.z = -0.12 * s;
        g.add(at(f, 0.13 * s, base + 0.5, front + 0.001));
    });

    // manche, touche, chevillier, volute
    g.add(at(box(0.055, 0.6, 0.06, M.maple), 0, base + 1.38, D / 2 - 0.005));
    const board = new THREE.BoxGeometry(1, 1, 1);
    const fb = mesh(board, M.ebony);
    fb.scale.set(0.085, 0.92, 0.016);
    fb.position.set(0, base + 1.24, front + 0.022);
    fb.rotation.x = 0.02;
    g.add(fb);
    const top = base + 1.7;
    g.add(at(box(0.06, 0.2, 0.065, M.maple), 0, top + 0.1, D / 2 - 0.01));
    [0.04, 0.12].forEach(dy => [-1, 1].forEach(s => {
        g.add(between(V(0.03 * s, top + dy, D / 2), V(0.07 * s, top + dy, D / 2), 0.005, M.chrome));
        g.add(at(cyl(0.016, 0.016, 0.006, M.chrome, 16).rotateZ(Math.PI / 2), 0.075 * s, top + dy, D / 2));
    }));
    const scrollPts = [];
    for (let i = 0; i <= 30; i++) { const a = i / 30 * TAU * 1.3, rr = 0.045 * (1 - i / 42); scrollPts.push(V(0, top + 0.24 + rr * Math.sin(a), D / 2 - 0.01 + rr * Math.cos(a))); }
    g.add(taperedTube(curveOf(scrollPts), t => 0.026 - 0.014 * t, M.maple, 90, 14));

    // chevalet, cordier, cordes, pique
    const bridgeY = base + 0.42;
    g.add(at(box(0.16, 0.012, 0.09, M.wood), 0, bridgeY, front + 0.045));
    const tail = mesh(new THREE.CylinderGeometry(0.05, 0.028, 0.26, 4), M.ebony);
    tail.rotation.set(-0.1, Math.PI / 4, 0);
    tail.scale.set(1, 1, 0.25);
    g.add(at(tail, 0, base + 0.2, front + 0.03));
    [-1.5, -0.5, 0.5, 1.5].forEach(k => {
        const a = V(k * 0.012, base + 0.1, front + 0.035), b = V(k * 0.025, bridgeY, front + 0.09), c = V(k * 0.012, top - 0.02, front + 0.035);
        g.add(between(a, b, 0.0016 + Math.abs(k) * 0.0003, M.chrome, 0.0016, 6), between(b, c, 0.0016 + Math.abs(k) * 0.0003, M.chrome, 0.0016, 6));
    });
    g.add(between(V(0, base + 0.02), V(0, 0.012), 0.007, M.chrome));
    g.add(at(sphere(0.012, M.rubber, 12), 0, 0.012, 0));
    return g;
}

/* =========================================================
   PIANO À QUEUE
   Clavier vers +Z (face au pianiste), queue vers -Z.
   ========================================================= */
function piano() {
    const g = new THREE.Group();
    const W = 0.74, caseY = 0.62, caseH = 0.3;

    const outline = () => {
        const s = new THREE.Shape();
        s.moveTo(-W, 0); s.lineTo(W, 0); s.lineTo(W, 0.45);
        s.splineThru([new THREE.Vector2(0.62, 0.82), new THREE.Vector2(0.34, 1.18), new THREE.Vector2(0.12, 1.52),
            new THREE.Vector2(-0.14, 1.83), new THREE.Vector2(-0.45, 1.97), new THREE.Vector2(-0.67, 1.9), new THREE.Vector2(-W, 1.7)]);
        s.lineTo(-W, 0);
        return s;
    };
    // la forme est dessinée vue de dessus (Y du dessin = profondeur) : on la couche
    const flat = (geo) => { geo.rotateX(-Math.PI / 2); return geo; };

    const caseGeo = flat(new THREE.ExtrudeGeometry(outline(), { depth: caseH, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2, curveSegments: 48 }));
    g.add(at(mesh(caseGeo, M.black), 0, caseY, 0));
    // cadre doré + cordes visibles couvercle ouvert
    const frameGeo = flat(new THREE.ShapeGeometry(outline(), 48));
    const frame = at(mesh(frameGeo, M.gold), 0, caseY + caseH + 0.012, 0);
    frame.scale.set(0.93, 1, 0.93);
    frame.position.z = -0.07;
    g.add(frame);
    for (let i = 0; i < 46; i++) {
        const x = -0.62 + i * 0.026;
        const len = 1.75 - (x + 0.62) / 1.24 * 1.1;
        g.add(between(V(x, caseY + caseH + 0.02, -0.12), V(x * 0.97 - 0.02, caseY + caseH + 0.02, -0.12 - len), 0.0012, M.chrome, 0.0012, 5));
    }
    // couvercle ouvert sur sa béquille (charnière côté gauche)
    const lidGeo = flat(new THREE.ExtrudeGeometry(outline(), { depth: 0.018, bevelEnabled: false, curveSegments: 48 }));
    lidGeo.translate(W, 0, 0);
    const lid = group(mesh(lidGeo, M.black));
    lid.position.set(-W, caseY + caseH + 0.012, 0);
    lid.rotation.z = 0.52;
    g.add(lid);
    const lx = 1.18, lz = -0.75;
    g.add(between(V(-W + lx, caseY + caseH + 0.012, lz), V(-W + lx * Math.cos(0.52), caseY + caseH + 0.012 + lx * Math.sin(0.52), lz), 0.008, M.black));

    // clavier : 52 blanches, 36 noires (de La0 à Do8)
    const kbW = 1.3, keyW = kbW / 52, keyY = 0.72, keyZ0 = 0.02;
    g.add(at(box(kbW + 0.16, 0.06, 0.2, M.black), 0, keyY - 0.04, 0.09));
    [-1, 1].forEach(s => g.add(at(box(0.07, 0.1, 0.2, M.black), s * (kbW / 2 + 0.045), keyY - 0.01, 0.09)));
    g.add(at(box(kbW, 0.09, 0.03, M.black), 0, keyY + 0.04, -0.005));  // pupitre bas / cylindre
    const names = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
    for (let i = 0; i < 52; i++) {
        const x = -kbW / 2 + keyW * (i + 0.5);
        g.add(at(box(keyW * 0.92, 0.022, 0.15, M.ivory), x, keyY, keyZ0 + 0.075));
        const n = names[i % 7];
        if (i < 51 && !['B', 'E'].includes(n)) g.add(at(box(keyW * 0.55, 0.02, 0.095, M.ebony), x + keyW / 2, keyY + 0.018, keyZ0 + 0.048));
    }
    // pupitre à partitions
    const desk = at(box(0.78, 0.26, 0.015, M.black), 0, caseY + caseH + 0.13, -0.18);
    desk.rotation.x = -0.28;
    g.add(desk);

    // pieds, lyre et pédales
    [[-W + 0.07, 0.07], [W - 0.07, 0.07], [-0.32, -1.72]].forEach(([x, z]) => {
        g.add(at(cyl(0.05, 0.034, caseY, M.black, 20), x, caseY / 2, z));
        g.add(at(sphere(0.03, M.brass, 14), x, 0.03, z));
    });
    [-1, 1].forEach(s => g.add(at(box(0.025, caseY - 0.1, 0.04, M.black), s * 0.09, caseY / 2 + 0.05, -0.12)));
    g.add(at(box(0.26, 0.04, 0.08, M.black), 0, 0.07, -0.1));
    [-0.06, 0, 0.06].forEach(x => g.add(at(box(0.025, 0.012, 0.09, M.brass), x, 0.07, -0.02)));

    // banquette
    g.add(at(box(0.62, 0.07, 0.34, M.black), 0, 0.5, 0.62));
    [[-0.27, 0.48], [0.27, 0.48], [-0.27, 0.76], [0.27, 0.76]].forEach(([x, z]) => g.add(at(box(0.04, 0.47, 0.04, M.black), x, 0.235, z)));
    return g;
}


/* =========================================================
   MÉLODICA (32 touches, de Fa à Do), posé à plat, embouchure à gauche
   ========================================================= */
function melodica() {
    const g = new THREE.Group();
    const L = 0.47, Dp = 0.11, Hb = 0.035;

    // corps en plastique : rectangle aux coins arrondis, extrudé vers le haut
    const s = new THREE.Shape(), r = 0.03, x0 = -L / 2, z0 = 0;
    s.moveTo(x0 + r, z0); s.lineTo(x0 + L - r, z0); s.quadraticCurveTo(x0 + L, z0, x0 + L, z0 + r);
    s.lineTo(x0 + L, z0 + Dp - r); s.quadraticCurveTo(x0 + L, z0 + Dp, x0 + L - r, z0 + Dp);
    s.lineTo(x0 + r, z0 + Dp); s.quadraticCurveTo(x0, z0 + Dp, x0, z0 + Dp - r);
    s.lineTo(x0, z0 + r); s.quadraticCurveTo(x0, z0, x0 + r, z0);
    const geo = new THREE.ExtrudeGeometry(s, { depth: Hb, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 3, curveSegments: 10 });
    geo.rotateX(-Math.PI / 2);  // le dessin devient horizontal, l'épaisseur monte en Y
    geo.translate(0, 0.008, Dp / 2);  // centré en profondeur, posé sur y = 0
    g.add(mesh(geo, M.redPlastic));

    // clavier : 19 blanches, 13 noires
    const top = Hb + 0.016, kW = 0.38 / 19, kx0 = -0.38 / 2 + 0.03;
    const names = ['F', 'G', 'A', 'B', 'C', 'D', 'E'];
    for (let i = 0; i < 19; i++) {
        const x = kx0 + kW * (i + 0.5);
        g.add(at(box(kW * 0.9, 0.008, 0.072, M.ivory), x, top, 0.012));
        const n = names[i % 7];
        if (i < 18 && !['B', 'E'].includes(n)) g.add(at(box(kW * 0.55, 0.008, 0.044, M.ebony), x + kW / 2, top + 0.007, -0.004));
    }
    // plaque de marque, bouton de purge, embout
    g.add(at(box(0.07, 0.012, 0.002, M.chrome), 0.05, Hb / 2 + 0.008, Dp / 2 + 0.0085));
    g.add(at(cyl(0.006, 0.006, 0.006, M.chrome, 14), L / 2 - 0.035, top - 0.004, -0.035));
    const sock = cyl(0.009, 0.009, 0.018, M.chrome, 16);
    sock.rotation.z = Math.PI / 2;
    g.add(at(sock, -L / 2 - 0.012, Hb / 2 + 0.008, 0));

    // tuyau souple et embouchure
    const hose = curveOf([V(-L / 2 - 0.02, Hb / 2 + 0.008, 0), V(-L / 2 - 0.08, 0.02, 0.03), V(-L / 2 - 0.1, 0.012, 0.12),
        V(-L / 2 - 0.02, 0.012, 0.17), V(-L / 2 + 0.07, 0.014, 0.15)]);
    g.add(taperedTube(hose, () => 0.0075, M.whitePlastic, 90, 14));
    const hEnd = hose.getPointAt(1), hDir = hose.getTangentAt(1);
    g.add(place(cyl(0.006, 0.01, 0.045, M.whitePlastic, 16), hEnd.clone().addScaledVector(hDir, 0.022), hDir));
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
    console.log(`${file.padEnd(24)} ${(glb.byteLength / 1024).toFixed(0).padStart(5)} Ko   ${b.x.toFixed(2)} × ${b.y.toFixed(2)} × ${b.z.toFixed(2)} m`);
}

await collectMaterials(['trompette.glb', 'clarinette.glb', 'caisse-claire.glb', 'xylophone.glb', 'cymbales.glb']);
Object.assign(M, {
    brass: ds(M['Laiton poli']),
    chrome: ds(M['Maillechort argente']),
    pearl: M['Nacre'],
    ebony: M['Ebene'],
    rubber: M['Caoutchouc'],
    maple: newMat('Vernis erable', [0.13, 0.03, 0.008], 0.05, 0.22),
    wood: newMat('Bois clair', [0.62, 0.34, 0.14], 0, 0.5),
    black: newMat('Laque noire', [0.012, 0.012, 0.014], 0.3, 0.12),
    gold: newMat('Fonte doree', [0.42, 0.24, 0.05], 0.95, 0.42),
    ivory: newMat('Ivoire', [0.86, 0.84, 0.78], 0, 0.32),
    redPlastic: newMat('Plastique rouge', [0.6, 0.012, 0.02], 0, 0.34),
    whitePlastic: newMat('Plastique blanc', [0.8, 0.8, 0.78], 0, 0.45),
});
const missing = Object.entries(M).filter(([, v]) => !v).map(([k]) => k);
if (missing.length) throw new Error('Matières introuvables : ' + missing.join(', '));

const ALL = {
    'clarinette-basse': clarinetteBasse,
    'sax-tenor': () => saxophone('tenor'),
    'sax-baryton': () => saxophone('baryton'),
    'euphonium': euphonium,
    'contrebasse': contrebasse,
    'piano': piano,
    'melodica': melodica,
};
const wanted = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(ALL);
for (const id of wanted) await exportGlb(ALL[id](), `${id}.glb`);
