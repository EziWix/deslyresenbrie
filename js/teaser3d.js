/* =========================================================
   Accueil : aperçu 3D d'un instrument qui tourne.
   Chargé seulement quand le bloc approche de l'écran.
   ========================================================= */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// direction de la caméra pour chaque modèle proposé
const VIEWS = {
    'cor': [0.25, 0.15, 1],
    'saxophone': [0.5, 0.1, 1],
    'batterie': [0.45, 0.45, 1],
};

const box = document.getElementById('teaser');
if (box) {
    const io = new IntersectionObserver(entries => {
        if (!entries[0].isIntersecting) return;
        io.disconnect();
        start();
    }, { rootMargin: '400px' });
    io.observe(box);
}

function start() {
    let renderer;
    try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
        box.querySelector('.viewer-loading').textContent = "La 3D n'est pas disponible sur cet appareil.";
        return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    box.prepend(renderer.domElement);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
    pmrem.dispose();
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(3, 5, 4);
    const rim = new THREE.DirectionalLight(0xffd6d6, 1.8);
    rim.position.set(-3, 2, -4);
    scene.add(key, rim);

    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enableZoom = false;
    controls.enablePan = false;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 2.2;
    renderer.domElement.style.touchAction = 'pan-y';  // le doigt peut toujours faire défiler la page

    const resize = () => {
        const { clientWidth: w, clientHeight: h } = box;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    };
    new ResizeObserver(resize).observe(box);
    resize();

    const loader = new GLTFLoader();
    const cache = new Map();
    let current = null, wanted = null, born = 0;

    async function show(id) {
        wanted = id;
        if (!cache.has(id)) cache.set(id, loader.loadAsync(`models/${id}.glb?v=1`).then(g => g.scene));
        let model;
        try { model = await cache.get(id); } catch { return; }
        if (wanted !== id) return;

        // même taille pour tous, centré
        const holder = new THREE.Group();
        holder.add(model);
        model.position.set(0, 0, 0);
        model.scale.setScalar(1);
        const b = new THREE.Box3().setFromObject(model);
        const size = b.getSize(new THREE.Vector3());
        model.scale.setScalar(3 / Math.max(size.x, size.y, size.z));
        b.setFromObject(model);
        model.position.sub(b.getCenter(new THREE.Vector3()));

        if (current) scene.remove(current);
        current = holder;
        scene.add(holder);
        born = performance.now();

        const radius = new THREE.Box3().setFromObject(holder).getBoundingSphere(new THREE.Sphere()).radius;
        const dist = radius / Math.sin(THREE.MathUtils.degToRad(camera.fov) / 2) * 1.08;
        camera.position.copy(new THREE.Vector3(...VIEWS[id]).normalize().multiplyScalar(dist));
        controls.target.set(0, 0, 0);
        box.classList.add('ready');
    }

    // petit effet d'apparition à chaque changement d'instrument
    const loop = now => {
        if (current) {
            const p = Math.min((now - born) / 500, 1);
            current.scale.setScalar(0.6 + 0.4 * (1 - Math.pow(1 - p, 3)));
        }
        controls.update();
        renderer.render(scene, camera);
    };
    new IntersectionObserver(([e]) => renderer.setAnimationLoop(e.isIntersecting ? loop : null)).observe(box);

    const chips = box.querySelectorAll('[data-model]');
    chips.forEach(btn => btn.addEventListener('click', () => {
        chips.forEach(c => c.classList.toggle('active', c === btn));
        show(btn.dataset.model);
    }));
    show(box.querySelector('[data-model].active')?.dataset.model || 'cor');
}
