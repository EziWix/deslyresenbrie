/* =========================================================
   Page Instruments : visionneuse 3D + fiches
   ========================================================= */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { build } from './instruments-models.js';

/* ---------- Modèles 3D (.glb dans models/) ----------
   Un fichier models/<id>.glb remplace le modèle codé de l'instrument.
   view : direction de la caméra au premier affichage
   rot  : rotation [x, y, z] en degrés appliquée au modèle (facultatif) */
const MODELS_VERSION = 1;  // à incrémenter quand on remplace un .glb
const GLB = {
    'trompette':     { view: [0.3, 0.25, 1] },
    'trombone':      { view: [0.3, 0.25, 1] },
    'cor':           { view: [0.25, 0.15, 1] },
    'tuba':          { view: [0.6, 0.15, 1] },
    'flute':         { view: [0.25, 0.4, 1] },
    'clarinette':    { view: [0.4, 0.2, 1], rot: [0, 0, -40] },
    'hautbois':      { view: [0.4, 0.2, 1], rot: [0, 0, -40] },
    'saxophone':     { view: [0.5, 0.1, 1] },
    'caisse-claire': { view: [0.3, 0.8, 1] },
    'grosse-caisse': { view: [0.6, 0.2, 1] },
    'cymbales':      { view: [0.3, 0.75, 1] },
    'xylophone':     { view: [0.3, 0.75, 1] },
};

/* ---------- Contenu ---------- */
const CATEGORIES = [
    {
        id: 'cuivres', label: 'Cuivres', icon: 'fa-bullhorn',
        intro: "Instruments à vent : le son naît de la vibration des lèvres du musicien dans une embouchure en forme de petite coupe."
    },
    {
        id: 'bois', label: 'Bois', icon: 'fa-feather',
        intro: "Instruments à vent aussi : le son vient d'une anche qui vibre (clarinette, saxophone, hautbois) ou du souffle sur un biseau (flûte). Ce n'est pas la matière qui compte : la flûte et le saxophone sont en métal, mais ce sont bien des bois !"
    },
    {
        id: 'percussions', label: 'Percussions', icon: 'fa-drum',
        intro: "Frappées, secouées ou entrechoquées : elles donnent le rythme et colorent l'orchestre."
    },
];

const INSTRUMENTS = [
    { id: 'trompette', cat: 'cuivres', nom: 'Trompette',
      resume: "La plus aiguë des cuivres de l'harmonie. Brillante et puissante, elle porte souvent la mélodie et les sonneries de fanfare.",
      role: "Mélodies, fanfares, solos éclatants.",
      anecdote: "Déplié, son tube mesure près d'un mètre cinquante." },
    { id: 'trombone', cat: 'cuivres', nom: 'Trombone',
      resume: "Reconnaissable à sa coulisse : on change de note en allongeant ou en raccourcissant le tube.",
      role: "Harmonies chaudes et contre-chants puissants.",
      anecdote: "C'est l'un des rares instruments capables de glisser d'une note à l'autre sans interruption : le glissando." },
    { id: 'cor', cat: 'cuivres', nom: 'Cor',
      resume: "Son tube enroulé sur lui-même lui donne un son rond et doux. Le musicien garde une main dans le pavillon pour ajuster le timbre.",
      role: "Fait le lien entre les cuivres et les bois.",
      anecdote: "Déroulé, son tube dépasse 3,50 mètres." },
    { id: 'tuba', cat: 'cuivres', nom: 'Tuba',
      resume: "Le plus grave et le plus imposant des cuivres. Il pose les fondations sur lesquelles tout l'orchestre s'appuie.",
      role: "Ligne de basse et soutien rythmique.",
      anecdote: "Un tuba en si bémol compte environ 5,50 mètres de tube." },
    { id: 'flute', cat: 'bois', nom: 'Flûte traversière',
      resume: "Pas d'anche ici : le son naît du souffle dirigé contre le bord de l'embouchure, un peu comme quand on souffle sur une bouteille.",
      role: "Mélodies aériennes et traits virtuoses dans l'aigu.",
      anecdote: "Elle est en métal, mais les premières flûtes étaient en bois : c'est pour ça qu'elle reste dans la famille des bois." },
    { id: 'clarinette', cat: 'bois', nom: 'Clarinette',
      resume: "Une anche simple vibre contre le bec. Son registre très étendu va d'un grave chaleureux à un aigu brillant.",
      role: "Souvent les mélodies principales : c'est un peu le violon de l'harmonie.",
      anecdote: "Dans une harmonie, les clarinettes forment souvent le pupitre le plus nombreux." },
    { id: 'hautbois', cat: 'bois', nom: 'Hautbois',
      resume: "Son anche double, faite de deux fines lamelles de roseau, lui donne un timbre chantant et très expressif.",
      role: "Solos expressifs et couleurs délicates.",
      anecdote: "C'est le hautbois qui donne le « la » pour accorder l'orchestre symphonique." },
    { id: 'saxophone', cat: 'bois', nom: 'Saxophone',
      resume: "Inventé par le Belge Adolphe Sax dans les années 1840, il marie un corps en laiton et l'anche d'une clarinette.",
      role: "Contre-chants, mélodies, et une touche de jazz.",
      anecdote: "Malgré son corps en métal, c'est un bois : son son vient de son anche." },
    { id: 'caisse-claire', cat: 'percussions', nom: 'Caisse claire',
      resume: "Un tambour peu profond avec, sous la peau du bas, des fils métalliques tendus (le timbre) qui donnent son claquement sec.",
      role: "Rythme, roulements, marches.",
      anecdote: "Les roulements s'obtiennent en faisant rebondir les baguettes très vite sur la peau." },
    { id: 'grosse-caisse', cat: 'percussions', nom: 'Grosse caisse',
      resume: "Le cœur battant de l'orchestre : un grand tambour frappé avec une mailloche en feutre.",
      role: "Les temps forts et la pulsation.",
      anecdote: "Dans les défilés, c'est elle qui donne le pas à tout l'orchestre." },
    { id: 'cymbales', cat: 'percussions', nom: 'Cymbales',
      resume: "Deux disques de bronze qu'on frappe l'un contre l'autre pour des éclats spectaculaires.",
      role: "Accents et moments forts.",
      anecdote: "Elles sont faites d'un alliage de cuivre et d'étain, souvent martelé à la main." },
    { id: 'xylophone', cat: 'percussions', nom: 'Xylophone',
      resume: "Des lames de bois accordées, frappées avec des maillets. Les tubes placés dessous amplifient le son.",
      role: "Mélodies sautillantes et couleurs brillantes.",
      anecdote: "Plus la lame est courte, plus la note est aiguë." },
];

const byId = Object.fromEntries(INSTRUMENTS.map(i => [i.id, i]));
const catOf = id => CATEGORIES.find(c => c.id === id);

/* ---------- 3D : outils communs ---------- */
function makeRenderer(opts = {}) {
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, ...opts });
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    return r;
}

function makeScene(renderer) {
    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
    pmrem.dispose();
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(3, 5, 4);
    // lumière de contour, pour détacher les instruments sombres du fond
    const rim = new THREE.DirectionalLight(0xfff1d6, 1.6);
    rim.position.set(-3, 2, -4);
    scene.add(key, rim, new THREE.HemisphereLight(0xfff4dd, 0x1d2a24, 0.5));
    return scene;
}

// Ombre douce posée sous l'instrument
const shadowTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    const grd = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(0,0,0,0.45)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
})();
const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false });

const loader = new GLTFLoader();
const glbCache = new Map();

// Charge models/<id>.glb une seule fois ; null si absent ou illisible
function loadGlb(id) {
    if (!GLB[id]) return Promise.resolve(null);
    if (!glbCache.has(id)) {
        glbCache.set(id, loader.loadAsync(`models/${id}.glb?v=${MODELS_VERSION}`)
            .then(gltf => gltf.scene)
            .catch(err => {
                console.warn(`Modèle ${id}.glb indisponible, modèle codé utilisé`, err);
                return null;
            }));
    }
    return glbCache.get(id);
}

// Le .glb s'il existe, sinon le modèle codé
async function instrumentObject(id) {
    const scene = await loadGlb(id);
    if (!scene) return { ...build(id), shared: false };
    const cfg = GLB[id];
    const group = new THREE.Group();
    const model = scene.clone(true);  // les géométries restent partagées avec le cache
    if (cfg.rot) model.rotation.set(...cfg.rot.map(THREE.MathUtils.degToRad));
    group.add(model);
    return { group, view: new THREE.Vector3(...cfg.view), shared: true };
}

// Met l'instrument à une taille commune, centré, avec son ombre
async function prepare(id) {
    const { group, view, shared } = await instrumentObject(id);
    const box = new THREE.Box3().setFromObject(group);
    const size = box.getSize(new THREE.Vector3());
    group.scale.setScalar(3.2 / Math.max(size.x, size.y, size.z));
    box.setFromObject(group);
    group.position.sub(box.getCenter(new THREE.Vector3()));

    const root = new THREE.Group();
    root.add(group);
    box.setFromObject(root);
    const s = box.getSize(new THREE.Vector3());
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.set(s.x * 1.3 + 0.4, s.z * 1.3 + 0.4, 1);
    shadow.position.y = box.min.y - 0.02;
    root.add(shadow);

    const radius = box.getBoundingSphere(new THREE.Sphere()).radius;
    return { root, view, radius, shared };
}

// Libère les géométries, sauf celles d'un .glb gardé en cache
function dispose(p) {
    if (p.shared) return;
    p.root.traverse(o => { if (o.geometry) o.geometry.dispose(); });
}

// Distance de caméra pour que l'instrument tienne dans le cadre
function fitDistance(camera, radius) {
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
    return radius / Math.sin(Math.min(vFov, hFov) / 2) * 1.02;
}

/* ---------- Interface ---------- */
const viewerEl = document.getElementById('viewer');
const infoEl = document.getElementById('viewerInfo');
const gridEl = document.getElementById('instruGrid');
const tabsEl = document.getElementById('instruTabs');
let filter = 'all';
let currentId = null;

function renderGrid() {
    gridEl.innerHTML = CATEGORIES.map(c => `
        <div class="instru-cat" data-cat="${c.id}">
            <div class="instru-cat-head">
                <h2><i class="fas ${c.icon}"></i> ${c.label}</h2>
                <p>${c.intro}</p>
            </div>
            <div class="instru-cards">
                ${INSTRUMENTS.filter(i => i.cat === c.id).map(i => `
                    <button class="instru-card" type="button" data-id="${i.id}">
                        <span class="instru-thumb"><img data-thumb="${i.id}" alt=""></span>
                        <span class="instru-name">${i.nom}</span>
                    </button>`).join('')}
            </div>
        </div>`).join('');

    gridEl.querySelectorAll('.instru-card').forEach(btn => btn.addEventListener('click', () => {
        show(btn.dataset.id);
        if (window.innerWidth < 960) viewerEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
}

function renderInfo(inst) {
    const c = catOf(inst.cat);
    infoEl.innerHTML = `
        <span class="section-tag"><i class="fas ${c.icon}"></i> ${c.label}</span>
        <h2>${inst.nom}</h2>
        <p class="instru-resume">${inst.resume}</p>
        <dl class="instru-facts">
            <div><dt><i class="fas fa-music"></i> Rôle dans l'orchestre</dt><dd>${inst.role}</dd></div>
            <div><dt><i class="fas fa-lightbulb"></i> Le saviez-vous ?</dt><dd>${inst.anecdote}</dd></div>
        </dl>
        <a href="association.html#rejoindre" class="btn btn-dark">J'ai envie d'en jouer <i class="fas fa-arrow-right"></i></a>`;
}

function visibleList() {
    return INSTRUMENTS.filter(i => filter === 'all' || i.cat === filter);
}

function setFilter(cat) {
    filter = cat;
    tabsEl.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.cat === cat));
    gridEl.querySelectorAll('.instru-cat').forEach(el => { el.hidden = cat !== 'all' && el.dataset.cat !== cat; });
    if (cat !== 'all' && byId[currentId]?.cat !== cat) show(visibleList()[0].id);
}

/* ---------- Visionneuse ---------- */
let renderer, scene, camera, controls, current = null, homePos = null;

function setAutoRotate(on) {
    controls.autoRotate = on;
    document.getElementById('btnRotate').classList.toggle('active', on);
}

async function show(id) {
    const inst = byId[id];
    if (!inst) return;
    currentId = id;
    renderInfo(inst);
    gridEl.querySelectorAll('.instru-card').forEach(b => b.classList.toggle('active', b.dataset.id === id));
    history.replaceState(null, '', '#' + id);
    if (!renderer) return;

    viewerEl.classList.add('loading');
    const next = await prepare(id);
    if (currentId !== id) {  // un autre instrument a été demandé entre-temps
        dispose(next);
        return;
    }
    viewerEl.classList.remove('loading');
    if (current) {
        scene.remove(current.root);
        dispose(current);
    }
    current = next;
    scene.add(current.root);
    homePos = current.view.clone().normalize().multiplyScalar(fitDistance(camera, current.radius));
    camera.position.copy(homePos);
    controls.target.set(0, 0, 0);
    controls.update();
}

function step(delta) {
    const list = visibleList();
    const i = list.findIndex(x => x.id === currentId);
    show(list[(i + delta + list.length) % list.length].id);
}

function initViewer() {
    try {
        renderer = makeRenderer();
    } catch {
        viewerEl.classList.add('no-webgl');
        viewerEl.querySelector('.viewer-loading').innerHTML =
            '<i class="fas fa-triangle-exclamation"></i> La 3D n\'est pas disponible sur cet appareil.';
        return false;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    viewerEl.prepend(renderer.domElement);
    scene = makeScene(renderer);
    camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = 1.8;
    controls.maxDistance = 12;
    controls.autoRotateSpeed = 1.4;
    controls.addEventListener('start', () => {
        setAutoRotate(false);
        viewerEl.classList.add('touched');
    });

    const resize = () => {
        const { clientWidth: w, clientHeight: h } = viewerEl;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    };
    new ResizeObserver(resize).observe(viewerEl);
    resize();

    // On ne dessine que quand la visionneuse est à l'écran
    const loop = () => { controls.update(); renderer.render(scene, camera); };
    new IntersectionObserver(([e]) => renderer.setAnimationLoop(e.isIntersecting ? loop : null))
        .observe(viewerEl);

    document.getElementById('btnRotate').addEventListener('click', () => setAutoRotate(!controls.autoRotate));
    document.getElementById('btnReset').addEventListener('click', () => {
        camera.position.copy(homePos);
        controls.target.set(0, 0, 0);
    });
    document.getElementById('btnPrev').addEventListener('click', () => step(-1));
    document.getElementById('btnNext').addEventListener('click', () => step(1));
    setAutoRotate(true);
    viewerEl.classList.add('ready');
    return true;
}

// Vignettes des cartes : chaque instrument est rendu une fois en image
async function makeThumbs() {
    const W = 360, H = 270;
    const tr = makeRenderer({ preserveDrawingBuffer: true });
    tr.setPixelRatio(1);
    tr.setSize(W, H, false);
    const ts = makeScene(tr);
    const cam = new THREE.PerspectiveCamera(35, W / H, 0.1, 100);
    for (const inst of INSTRUMENTS) {
        await new Promise(r => setTimeout(r, 16));
        const p = await prepare(inst.id);
        ts.add(p.root);
        cam.position.copy(p.view.clone().normalize().multiplyScalar(fitDistance(cam, p.radius) * 0.92));
        cam.lookAt(0, 0, 0);
        tr.render(ts, cam);
        const img = gridEl.querySelector(`[data-thumb="${inst.id}"]`);
        if (img) img.src = tr.domElement.toDataURL('image/png');
        ts.remove(p.root);
        dispose(p);
    }
    tr.dispose();
}

/* ---------- Démarrage ---------- */
renderGrid();
tabsEl.querySelectorAll('button').forEach(b => b.addEventListener('click', () => setFilter(b.dataset.cat)));
const ok = initViewer();
show(byId[location.hash.slice(1)] ? location.hash.slice(1) : 'trompette');
if (ok) makeThumbs();
