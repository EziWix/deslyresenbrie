/* =========================================================
   La Grande Parade : mini-jeu du marching band (canvas 2D).
   Le tambour-major mène, les rangs suivent avec un temps de
   retard : bouger vite désaligne la troupe. Un obstacle touché
   = un musicien qui quitte le défilé. Plus de musiciens = fin.
   ========================================================= */
(() => {
    const canvas = document.getElementById('parade');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // ---------- Monde (coordonnées logiques) ----------
    const W = 420, H = 700;
    const HOUSE_L = 34, ROAD_L = 58, ROAD_R = 362, HOUSE_R = 386;
    const MAJOR_Y = H - 250;
    const ROW_GAP = 34, COL_GAP = 28, R = 9;
    const MAX_MUSICIANS = 12, START_MUSICIANS = 9;
    const BPM = 112;
    const TOWNS = ['Chailly-en-Brie', 'Coulommiers', 'La Ferté-sous-Jouarre', 'Mareuil-lès-Meaux',
        'Saint-Jean-les-Deux-Jumeaux', 'Pontault-Combault', 'Brie-Comte-Robert', 'Trélou-sur-Marne',
        'Beaumont-sur-Oise', 'Vaires-sur-Marne', 'Paris', 'la tournée mondiale'];
    const TOWN_EVERY = 300; // mètres
    const INSTRUMENTS = ['trompette', 'caisse', 'sax', 'tuba', 'trombone', 'trompette', 'cymbales', 'sax', 'caisse', 'tuba', 'trompette', 'trombone'];

    const C = {
        red: '#e3131f', redHi: '#ff5a63', redSh: '#9a0912', ink: '#16090b', cream: '#fff6f2',
        gold: '#f2c14e', goldSh: '#b8861b', road: '#4a3f41', roadLine: 'rgba(255,246,242,.55)',
        walk: '#c9b8b3', walkSh: '#b3a19c',
    };

    // ---------- Éléments de la page ----------
    const $ = id => document.getElementById(id);
    const startBox = $('paradeStart'), overBox = $('paradeOver'), pauseBox = $('paradePause');
    const btnMusic = $('paradeMusic'), btnPause = $('paradePauseBtn');

    const store = {
        get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
        set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* stockage indisponible */ } },
    };
    let best = parseInt(store.get('parade-best') || '0', 10) || 0;
    let musicOn = store.get('parade-music') !== 'off';
    $('paradeBest').textContent = best ? `Ton record : ${best} points` : '';

    // ---------- Son ----------
    const tracks = (typeof TRACKS !== 'undefined' && TRACKS.length) ? TRACKS : [];
    let music = null, actx = null;
    function playMusic() {
        if (!musicOn || !tracks.length) return;
        if (!music) {
            const t = tracks[Math.floor(Math.random() * tracks.length)];
            music = new Audio(t.src);
            music.loop = true;
            music.volume = 0.45;
        }
        music.play().catch(() => { });
    }
    function stopMusic(reset) {
        if (!music) return;
        music.pause();
        if (reset) music = null;
    }
    function bip(freq, dur, type = 'sine', vol = 0.12, slide = 0) {
        try {
            actx = actx || new (window.AudioContext || window.webkitAudioContext)();
            const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime;
            o.type = type;
            o.frequency.setValueAtTime(freq, t);
            if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
            g.gain.setValueAtTime(vol, t);
            g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            o.connect(g).connect(actx.destination);
            o.start(t); o.stop(t + dur);
        } catch (e) { /* pas de son, tant pis */ }
    }
    function updateMusicBtn() {
        btnMusic.innerHTML = musicOn ? '<i class="fas fa-volume-high"></i> Musique' : '<i class="fas fa-volume-xmark"></i> Musique';
        btnMusic.setAttribute('aria-pressed', musicOn ? 'true' : 'false');
    }
    updateMusicBtn();
    btnMusic.addEventListener('click', () => {
        musicOn = !musicOn;
        store.set('parade-music', musicOn ? 'on' : 'off');
        updateMusicBtn();
        if (musicOn && state === 'play') playMusic(); else stopMusic(false);
    });

    // ---------- Taille du canvas (net sur écrans haute densité) ----------
    function resize() {
        const rect = canvas.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(rect.width * dpr);
        canvas.height = Math.round(rect.height * dpr);
        ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
        if (state !== 'play') draw();
    }
    window.addEventListener('resize', resize);

    // ---------- État ----------
    let state = 'menu'; // menu | play | pause | over
    let g; // partie en cours
    const rand = (a, b) => a + Math.random() * (b - a);
    const pick = arr => arr[Math.floor(Math.random() * arr.length)];
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

    function newGame() {
        g = {
            t: 0, dist: 0, speed: 150, score: 0, notes: 0,
            majorX: W / 2, targetX: W / 2,
            rowX: [W / 2, W / 2, W / 2, W / 2],
            band: INSTRUMENTS.slice(0, START_MUSICIANS),
            align: 0, mult: 1,
            objs: [], fx: [], decor: [], crowd: [],
            nextSpawn: 420, spawnFlip: 0,
            nextTown: TOWN_EVERY, townIdx: 0, town: 'Boissy-le-Châtel',
            toast: { text: 'Départ : Boissy-le-Châtel', t: 2.4 },
            shake: 0, flash: 0, mace: 0,
        };
        // décor initial : maisons + public sur tout l'écran
        for (let y = H + 40; y > -80;) y = addHouses(y);
        for (let i = 0; i < 26; i++) addFan(rand(-60, H));
        state = 'play';
        startBox.hidden = true; overBox.hidden = true; pauseBox.hidden = true;
        btnPause.disabled = false;
        playMusic();
        last = performance.now();
        requestAnimationFrame(loop);
    }

    // ---------- Décor ----------
    const ROOFS = ['#c0392b', '#a93226', '#8e2a20', '#b5483a'];
    const WALLS = ['#f4e7dc', '#efe0d2', '#e8d6c6', '#fbf1e8'];
    function addHouses(yBottom) {
        const h = rand(70, 130);
        g.decor.push({ kind: 'house', side: 0, y: yBottom - h, h, roof: pick(ROOFS), wall: pick(WALLS), win: Math.random() < .5 });
        g.decor.push({ kind: 'house', side: 1, y: yBottom - h + rand(-20, 20), h, roof: pick(ROOFS), wall: pick(WALLS), win: Math.random() < .5 });
        if (Math.random() < .18) g.decor.push({ kind: 'lamp', side: Math.random() < .5 ? 0 : 1, y: yBottom - h / 2 });
        return yBottom - h - 6;
    }
    const SHIRTS = ['#e3131f', '#ffffff', '#2f6fb5', '#f2c14e', '#3b9a5b', '#7b4fa0', '#ff8a3d', '#16090b'];
    function addFan(y) {
        const side = Math.random() < .5 ? 0 : 1;
        const x = side ? rand(HOUSE_R - 20, HOUSE_R - 6) : rand(HOUSE_L + 6, HOUSE_L + 20);
        g.crowd.push({ x, y, shirt: pick(SHIRTS), hair: pick(['#3b2418', '#7a4a22', '#d8b46a', '#222', '#9b9b9b']), ph: Math.random() * 6, flag: Math.random() < .2 });
    }

    // ---------- Apparition des obstacles et bonus ----------
    function freeX(margin) { return rand(ROAD_L + margin, ROAD_R - margin); }
    function spawnObstacles(level) {
        const roll = Math.random();
        const y = -70;
        if (roll < .26) {                           // plots
            const n = 1 + Math.floor(rand(0, 1.6 + level));
            for (let i = 0; i < Math.min(n, 4); i++) g.objs.push({ type: 'cone', x: freeX(16), y: y - i * rand(0, 40), r: 11 });
        } else if (roll < .44) {                    // flaque
            g.objs.push({ type: 'flaque', x: freeX(40), y, w: rand(54, 80), h: 26 });
        } else if (roll < .66) {                    // barrière Vauban avec un passage
            const gap = clamp(150 - level * 22, 104, 150);
            const gx = rand(ROAD_L + 10, ROAD_R - 10 - gap);
            if (gx - ROAD_L > 8) g.objs.push({ type: 'barriere', x: ROAD_L, y, w: gx - ROAD_L, h: 14 });
            if (ROAD_R - (gx + gap) > 8) g.objs.push({ type: 'barriere', x: gx + gap, y, w: ROAD_R - gx - gap, h: 14 });
        } else if (roll < .84) {                    // voiture garée contre le trottoir
            const left = Math.random() < .5;
            g.objs.push({ type: 'voiture', x: left ? ROAD_L + 4 : ROAD_R - 54, y: y - 40, w: 50, h: 90, color: pick(['#2f6fb5', '#ececec', '#3b3b3b', '#3b9a5b', '#f2c14e']) });
        } else {                                     // vélo qui traverse
            const fromLeft = Math.random() < .5;
            g.objs.push({ type: 'velo', x: fromLeft ? ROAD_L - 50 : ROAD_R + 10, y: y - 120, w: 40, h: 16, vx: (fromLeft ? 1 : -1) * rand(70, 110 + level * 30) });
        }
    }
    function spawnItems() {
        const n = g.band.length;
        if (n < MAX_MUSICIANS && Math.random() < .14) {
            g.objs.push({ type: 'lyre', x: freeX(30), y: -40, r: 14, bonus: true });
            return;
        }
        const shape = Math.random();
        const x0 = freeX(50);
        for (let i = 0; i < 5; i++) {
            const x = shape < .5 ? x0 : x0 + Math.sin(i * 1.1) * 40;
            g.objs.push({ type: 'note', x, y: -40 - i * 34, r: 10, bonus: true, ph: i * .5 });
        }
    }

    // ---------- Formation ----------
    function layout() {
        const out = [], n = g.band.length;
        for (let i = 0; i < n; i++) {
            const row = Math.floor(i / 3), inRow = Math.min(3, n - row * 3), col = i % 3;
            const off = (col - (inRow - 1) / 2) * COL_GAP;
            out.push({ i, row, x: g.rowX[row] + off, y: MAJOR_Y + 46 + row * ROW_GAP });
        }
        return out;
    }

    // ---------- Collisions ----------
    function hitCircleRect(cx, cy, r, o) {
        const nx = clamp(cx, o.x, o.x + o.w), ny = clamp(cy, o.y, o.y + o.h);
        return (cx - nx) ** 2 + (cy - ny) ** 2 < r * r;
    }
    function touches(o, x, y, r) {
        if (o.type === 'flaque') return hitCircleRect(x, y, r, { x: o.x - o.w / 2 + 6, y: o.y - o.h / 2 + 4, w: o.w - 12, h: o.h - 8 });
        if (o.w) return hitCircleRect(x, y, r, o);
        return (x - o.x) ** 2 + (y - o.y) ** 2 < (r + o.r) ** 2;
    }

    function loseMusician(index, x, y) {
        const inst = g.band.splice(index, 1)[0];
        g.fx.push({ kind: 'fall', x, y, vx: x < W / 2 ? -140 : 140, vy: -60, rot: 0, t: 1.2, inst });
        g.fx.push({ kind: 'text', x, y: y - 16, text: pick(['Aïe !', 'Oups !', 'Hors du rang !', 'Fausse note !']), t: 1, color: C.redHi });
        g.align = 0;
        g.shake = .3; g.flash = .25;
        bip(180, .25, 'square', .1, -120);
        if (navigator.vibrate) try { navigator.vibrate(60); } catch (e) { /* */ }
        if (!g.band.length) gameOver();
    }

    // ---------- Boucle ----------
    let last = 0;
    const keys = { left: false, right: false };
    function loop(now) {
        if (state !== 'play') return;
        const dt = Math.min(.05, (now - last) / 1000);
        last = now;
        update(dt);
        draw();
        requestAnimationFrame(loop);
    }

    function update(dt) {
        g.t += dt;
        const meters = g.dist / 20;
        const level = Math.min(3, meters / 400);
        g.speed = 150 + Math.min(240, meters * 0.28);
        const dy = g.speed * dt;
        g.dist += dy;

        // tambour-major : clavier ou glisser
        const dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
        if (dir) g.targetX = g.majorX + dir * 40;
        // le tambour-major va jusqu'aux bordures ; la troupe, elle, reste sur la chaussée
        g.targetX = clamp(g.targetX, ROAD_L + R + 2, ROAD_R - R - 2);
        const maxStep = 330 * dt;
        g.majorX += clamp(g.targetX - g.majorX, -maxStep, maxStep);
        g.mace += dt * (dir || Math.abs(g.targetX - g.majorX) > 2 ? 9 : 4);

        // les rangs suivent le rang de devant avec du retard
        const k = 1 - Math.exp(-7 * dt);
        for (let r = 0; r < g.rowX.length; r++) {
            const lead = r === 0 ? g.majorX : g.rowX[r - 1];
            g.rowX[r] += (lead - g.rowX[r]) * k;
            g.rowX[r] = clamp(g.rowX[r], ROAD_L + COL_GAP + R + 2, ROAD_R - COL_GAP - R - 2);
        }

        // alignement : la troupe bien droite fait grimper le multiplicateur
        const rows = Math.ceil(g.band.length / 3);
        let spread = 0;
        for (let r = 0; r < rows; r++) spread = Math.max(spread, Math.abs(g.rowX[r] - g.majorX));
        if (spread < 7) g.align += dt; else g.align = Math.max(0, g.align - dt * 2.5);
        const mult = 1 + Math.min(3, Math.floor(g.align / 3));
        if (mult > g.mult) {
            g.fx.push({ kind: 'text', x: g.majorX, y: MAJOR_Y - 40, text: `Alignement parfait ×${mult}`, t: 1.3, color: C.gold, big: true });
            bip(660, .12, 'triangle', .1); setTimeout(() => bip(880, .16, 'triangle', .1), 90);
        }
        g.mult = mult;
        g.score += dy / 20 * g.mult;

        // apparitions (obstacle puis bonus, en alternance)
        if (g.dist >= g.nextSpawn) {
            const gap = clamp(250 - level * 38, 140, 250);
            if (g.spawnFlip++ % 2 === 0) spawnObstacles(level); else spawnItems();
            g.nextSpawn += gap / 2;
        }

        // villes traversées
        if (meters >= g.nextTown) {
            g.town = TOWNS[Math.min(g.townIdx, TOWNS.length - 1)];
            g.townIdx++;
            g.nextTown += TOWN_EVERY;
            g.objs.push({ type: 'arche', y: -60, text: g.town, deco: true });
            g.toast = { text: `Bienvenue à ${g.town} !`, t: 2.4 };
            bip(523, .12, 'triangle', .09); setTimeout(() => bip(659, .12, 'triangle', .09), 120); setTimeout(() => bip(784, .22, 'triangle', .09), 240);
        }

        // déplacement du monde
        for (const o of g.objs) {
            o.y += dy;
            if (o.vx) {
                o.x += o.vx * dt;
            }
        }
        for (const d of g.decor) d.y += dy;
        for (const f of g.crowd) f.y += dy;
        g.decor = g.decor.filter(d => d.y < H + 20);
        g.crowd = g.crowd.filter(f => f.y < H + 20);
        let top = Math.min(...g.decor.filter(d => d.kind === 'house').map(d => d.y));
        while (top > -60) top = addHouses(top - 6);
        if (Math.random() < dy / 26) addFan(-20);

        // collisions
        const pos = layout();
        for (const o of g.objs) {
            if (o.deco || o.done) continue;
            if (o.bonus) {
                const all = [{ x: g.majorX, y: MAJOR_Y }, ...pos];
                if (all.some(p => touches(o, p.x, p.y, R + 4))) {
                    o.done = true;
                    if (o.type === 'note') {
                        g.notes++;
                        const pts = 10 * g.mult;
                        g.score += pts;
                        g.fx.push({ kind: 'text', x: o.x, y: o.y, text: `+${pts}`, t: .8, color: C.gold });
                        bip(880 + (g.notes % 5) * 110, .09, 'sine', .08);
                    } else {
                        if (g.band.length < MAX_MUSICIANS) {
                            g.band.push(INSTRUMENTS[g.band.length % INSTRUMENTS.length]);
                            g.fx.push({ kind: 'text', x: o.x, y: o.y, text: 'Nouveau musicien !', t: 1.2, color: C.gold, big: true });
                        } else {
                            g.score += 100 * g.mult;
                            g.fx.push({ kind: 'text', x: o.x, y: o.y, text: `+${100 * g.mult}`, t: 1, color: C.gold });
                        }
                        bip(523, .1, 'triangle', .1); setTimeout(() => bip(784, .2, 'triangle', .1), 100);
                    }
                }
                continue;
            }
            if (touches(o, g.majorX, MAJOR_Y, R + 1)) {
                o.done = true;
                const lastOne = pos[pos.length - 1];
                if (lastOne) loseMusician(lastOne.i, g.majorX, MAJOR_Y);
                if (state !== 'play') return;
                continue;
            }
        }
        g.objs = g.objs.filter(o => o.y < H + 120 && !(o.done && o.bonus) && (!o.vx || (o.x > ROAD_L - 80 && o.x < ROAD_R + 80)));

        // effets
        for (const f of g.fx) {
            f.t -= dt;
            if (f.kind === 'fall') { f.x += f.vx * dt; f.y += (f.vy += 160 * dt) * dt + dy * .3; f.rot += dt * 8; }
            else f.y -= 30 * dt;
        }
        g.fx = g.fx.filter(f => f.t > 0);
        if (g.toast) { g.toast.t -= dt; if (g.toast.t <= 0) g.toast = null; }
        g.shake = Math.max(0, g.shake - dt);
        g.flash = Math.max(0, g.flash - dt);
    }

    // ---------- Dessin ----------
    function roundRect(x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    function drawStreet() {
        const off = g ? g.dist : 0;
        // trottoirs
        ctx.fillStyle = C.walk;
        ctx.fillRect(HOUSE_L, 0, ROAD_L - HOUSE_L, H);
        ctx.fillRect(ROAD_R, 0, HOUSE_R - ROAD_R, H);
        ctx.strokeStyle = C.walkSh; ctx.lineWidth = 1;
        for (let y = -(off % 24); y < H; y += 24) {
            ctx.beginPath();
            ctx.moveTo(HOUSE_L, y); ctx.lineTo(ROAD_L, y);
            ctx.moveTo(ROAD_R, y); ctx.lineTo(HOUSE_R, y);
            ctx.stroke();
        }
        // route pavée
        ctx.fillStyle = C.road;
        ctx.fillRect(ROAD_L, 0, ROAD_R - ROAD_L, H);
        ctx.strokeStyle = 'rgba(0,0,0,.14)';
        for (let y = -(off % 18), r = Math.floor(off / 18); y < H; y += 18, r--) {
            ctx.beginPath(); ctx.moveTo(ROAD_L, y); ctx.lineTo(ROAD_R, y); ctx.stroke();
            const shift = (r & 1) ? 0 : 13;
            ctx.beginPath();
            for (let x = ROAD_L + shift; x < ROAD_R; x += 26) { ctx.moveTo(x, y); ctx.lineTo(x, y + 18); }
            ctx.stroke();
        }
        // bordures + ligne centrale
        ctx.fillStyle = '#ece2dd';
        ctx.fillRect(ROAD_L - 3, 0, 3, H); ctx.fillRect(ROAD_R, 0, 3, H);
        ctx.fillStyle = C.roadLine;
        for (let y = -(off % 60) - 60; y < H; y += 60) ctx.fillRect(W / 2 - 2, y, 4, 28);
    }

    function drawDecor() {
        if (!g) return;
        for (const d of g.decor) {
            if (d.kind === 'house') {
                const x = d.side ? HOUSE_R : 0, w = d.side ? W - HOUSE_R : HOUSE_L;
                ctx.fillStyle = d.wall; ctx.fillRect(x, d.y, w, d.h);
                // toit vu du dessus (bande de tuiles côté rue)
                ctx.fillStyle = d.roof;
                ctx.fillRect(d.side ? x : x, d.y, w, d.h);
                ctx.fillStyle = 'rgba(0,0,0,.16)';
                for (let yy = d.y + 6; yy < d.y + d.h; yy += 9) ctx.fillRect(x, yy, w, 2);
                ctx.fillStyle = 'rgba(255,255,255,.16)';
                ctx.fillRect(d.side ? x : x + w - 5, d.y, 5, d.h);
                ctx.fillStyle = 'rgba(0,0,0,.35)';
                ctx.fillRect(x, d.y + d.h - 2, w, 2);
                if (d.win) { ctx.fillStyle = '#6b4a3a'; ctx.fillRect(x + w / 2 - 5, d.y + d.h / 2 - 6, 10, 12); }
            } else if (d.kind === 'lamp') {
                const x = d.side ? ROAD_R + 6 : ROAD_L - 6;
                ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.arc(x + 3, d.y + 3, 6, 0, 7); ctx.fill();
                ctx.fillStyle = '#2b2b2b'; ctx.beginPath(); ctx.arc(x, d.y, 5, 0, 7); ctx.fill();
                ctx.fillStyle = '#ffe9a8'; ctx.beginPath(); ctx.arc(x, d.y, 2.5, 0, 7); ctx.fill();
            }
        }
        // public qui applaudit quand la fanfare passe
        for (const f of g.crowd) {
            const near = Math.abs(f.y - (MAJOR_Y + 60)) < 150;
            const jump = near ? Math.abs(Math.sin(g.t * 9 + f.ph)) * 3 : 0;
            ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.ellipse(f.x + 2, f.y + 3, 7, 5, 0, 0, 7); ctx.fill();
            ctx.fillStyle = f.shirt; ctx.beginPath(); ctx.ellipse(f.x, f.y - jump * .3, 7, 5.5, 0, 0, 7); ctx.fill();
            if (near) {
                ctx.strokeStyle = f.shirt; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
                const a = Math.sin(g.t * 12 + f.ph) * 3;
                ctx.beginPath(); ctx.moveTo(f.x - 5, f.y - 1); ctx.lineTo(f.x - 8, f.y - 8 - a);
                ctx.moveTo(f.x + 5, f.y - 1); ctx.lineTo(f.x + 8, f.y - 8 + a); ctx.stroke();
            }
            ctx.fillStyle = f.hair; ctx.beginPath(); ctx.arc(f.x, f.y - jump - 1, 4.2, 0, 7); ctx.fill();
            if (f.flag) {
                const fx = f.x + (f.x < W / 2 ? 9 : -9);
                ctx.strokeStyle = '#555'; ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(fx, f.y); ctx.lineTo(fx, f.y - 16); ctx.stroke();
                ctx.fillStyle = C.red; ctx.fillRect(fx, f.y - 16, f.x < W / 2 ? 9 : -9, 6);
            }
        }
    }

    function drawObject(o) {
        const { x, y } = o;
        ctx.save();
        switch (o.type) {
            case 'cone':
                ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.arc(x + 3, y + 4, 12, 0, 7); ctx.fill();
                ctx.fillStyle = '#ff7a1a'; ctx.beginPath(); ctx.arc(x, y, 12, 0, 7); ctx.fill();
                ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 7, 0, 7); ctx.stroke();
                ctx.fillStyle = '#c94f00'; ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fill();
                break;
            case 'flaque':
                ctx.fillStyle = 'rgba(120,170,220,.55)'; ctx.beginPath(); ctx.ellipse(x, y, o.w / 2, o.h / 2, 0, 0, 7); ctx.fill();
                ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.ellipse(x - o.w / 6, y - 3, o.w / 6, 3, 0, 0, 7); ctx.fill();
                break;
            case 'barriere':
                ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(o.x + 3, y + 5, o.w, o.h);
                ctx.fillStyle = '#d9d9d9'; ctx.fillRect(o.x, y, o.w, o.h);
                ctx.fillStyle = '#9a9a9a';
                for (let bx = o.x + 4; bx < o.x + o.w - 2; bx += 8) ctx.fillRect(bx, y + 2, 2, o.h - 4);
                ctx.fillStyle = C.red; ctx.fillRect(o.x, y, o.w, 3); ctx.fillRect(o.x, y + o.h - 3, o.w, 3);
                break;
            case 'voiture':
                ctx.fillStyle = 'rgba(0,0,0,.3)'; roundRect(o.x + 4, y + 5, o.w, o.h, 12); ctx.fill();
                ctx.fillStyle = o.color; roundRect(o.x, y, o.w, o.h, 12); ctx.fill();
                ctx.fillStyle = 'rgba(20,30,40,.75)'; roundRect(o.x + 6, y + 16, o.w - 12, 18, 5); ctx.fill();
                roundRect(o.x + 6, y + o.h - 28, o.w - 12, 14, 5); ctx.fill();
                ctx.fillStyle = 'rgba(255,255,255,.22)'; roundRect(o.x + 8, y + 38, o.w - 16, o.h - 70, 5); ctx.fill();
                ctx.fillStyle = '#ffe9a8'; ctx.fillRect(o.x + 5, y + 2, 9, 4); ctx.fillRect(o.x + o.w - 14, y + 2, 9, 4);
                break;
            case 'velo':
                ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(o.x + 3, y + 4, o.w, o.h);
                ctx.fillStyle = '#222'; ctx.fillRect(o.x, y + 6, o.w, 4);
                ctx.beginPath(); ctx.arc(o.x + 4, y + 8, 4, 0, 7); ctx.arc(o.x + o.w - 4, y + 8, 4, 0, 7); ctx.fill();
                ctx.fillStyle = '#3b9a5b'; ctx.beginPath(); ctx.ellipse(o.x + o.w / 2, y + 8, 8, 7, 0, 0, 7); ctx.fill();
                ctx.fillStyle = '#f2c14e'; ctx.beginPath(); ctx.arc(o.x + o.w / 2 + (o.vx > 0 ? 3 : -3), y + 8, 4.5, 0, 7); ctx.fill();
                break;
            case 'note': {
                const bob = Math.sin(g.t * 5 + o.ph) * 3;
                ctx.translate(x, y + bob);
                ctx.fillStyle = 'rgba(242,193,78,.25)'; ctx.beginPath(); ctx.arc(0, 0, 14, 0, 7); ctx.fill();
                ctx.fillStyle = C.gold; ctx.strokeStyle = C.goldSh; ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.ellipse(-3, 5, 5.5, 4, -.4, 0, 7); ctx.fill(); ctx.stroke();
                ctx.fillRect(1.5, -9, 2.2, 15);
                ctx.beginPath(); ctx.moveTo(3.7, -9); ctx.quadraticCurveTo(10, -5, 8, 1); ctx.quadraticCurveTo(8, -4, 3.7, -4); ctx.fill();
                break;
            }
            case 'lyre': {
                const s = 1 + Math.sin(g.t * 6) * .08;
                ctx.translate(x, y); ctx.scale(s, s);
                ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.beginPath(); ctx.arc(0, 0, 17, 0, 7); ctx.fill();
                ctx.strokeStyle = C.red; ctx.lineWidth = 3; ctx.stroke();
                ctx.strokeStyle = C.goldSh; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
                ctx.beginPath(); ctx.moveTo(-7, -9); ctx.quadraticCurveTo(-11, 2, -3, 8); ctx.lineTo(3, 8); ctx.quadraticCurveTo(11, 2, 7, -9); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(-8, -7); ctx.lineTo(8, -7); ctx.stroke();
                ctx.lineWidth = 1; ctx.strokeStyle = C.ink;
                for (const sx of [-3, 0, 3]) { ctx.beginPath(); ctx.moveTo(sx, -7); ctx.lineTo(sx, 7); ctx.stroke(); }
                ctx.fillStyle = C.red; ctx.font = '700 11px Poppins, sans-serif'; ctx.textAlign = 'center';
                ctx.fillText('+1', 0, 30);
                break;
            }
            case 'arche':
                // guirlande de fanions + panneau de la ville
                ctx.strokeStyle = '#ece2dd'; ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.moveTo(ROAD_L - 6, y); ctx.quadraticCurveTo(W / 2, y + 26, ROAD_R + 6, y); ctx.stroke();
                for (let i = 1; i < 16; i++) {
                    const t = i / 16, fx = ROAD_L - 6 + (ROAD_R - ROAD_L + 12) * t, fy = y + 26 * 4 * t * (1 - t) / 2;
                    ctx.fillStyle = i % 2 ? C.red : '#fff';
                    ctx.beginPath(); ctx.moveTo(fx - 6, fy); ctx.lineTo(fx + 6, fy); ctx.lineTo(fx, fy + 11); ctx.fill();
                }
                break;
        }
        ctx.restore();
    }

    function drawInstrument(kind, x, y) {
        ctx.save();
        ctx.translate(x, y);
        ctx.fillStyle = C.gold; ctx.strokeStyle = C.goldSh; ctx.lineWidth = 1.2;
        switch (kind) {
            case 'trompette':
                ctx.fillRect(-1.5, -16, 3, 11);
                ctx.beginPath(); ctx.moveTo(-5, -20); ctx.lineTo(5, -20); ctx.lineTo(1.5, -15); ctx.lineTo(-1.5, -15); ctx.fill(); ctx.stroke();
                break;
            case 'trombone':
                ctx.fillRect(-4, -24, 2, 18); ctx.fillRect(2, -24, 2, 18); ctx.fillRect(-4, -24, 8, 2);
                ctx.beginPath(); ctx.arc(3, -27, 5, 0, 7); ctx.fill(); ctx.stroke();
                break;
            case 'sax':
                ctx.beginPath(); ctx.ellipse(4, -10, 4, 6, .4, 0, 7); ctx.fill(); ctx.stroke();
                ctx.fillRect(-1, -14, 2.5, 8);
                break;
            case 'tuba':
                ctx.beginPath(); ctx.arc(0, -13, 10, 0, 7); ctx.fill(); ctx.stroke();
                ctx.fillStyle = C.goldSh; ctx.beginPath(); ctx.arc(0, -13, 6, 0, 7); ctx.fill();
                ctx.fillStyle = '#6b4a12'; ctx.beginPath(); ctx.arc(0, -13, 3, 0, 7); ctx.fill();
                break;
            case 'caisse':
                ctx.fillStyle = '#fff'; ctx.strokeStyle = C.red; ctx.lineWidth = 2.5;
                ctx.beginPath(); ctx.arc(0, -9, 7.5, 0, 7); ctx.fill(); ctx.stroke();
                ctx.strokeStyle = '#7a5c40'; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
                const b = Math.sin(g ? g.t * BPM / 60 * Math.PI * 2 : 0) * 3;
                ctx.beginPath(); ctx.moveTo(-6, -2); ctx.lineTo(-2, -12 + b); ctx.moveTo(6, -2); ctx.lineTo(2, -12 - b); ctx.stroke();
                break;
            case 'cymbales': {
                const o = Math.abs(Math.sin(g ? g.t * BPM / 120 * Math.PI : 0)) * 4;
                ctx.beginPath(); ctx.arc(-4 - o, -10, 6, 0, 7); ctx.fill(); ctx.stroke();
                ctx.beginPath(); ctx.arc(4 + o, -10, 6, 0, 7); ctx.fill(); ctx.stroke();
                break;
            }
        }
        ctx.restore();
    }

    function drawMusician(x, y, kind, step, blink) {
        if (blink) ctx.globalAlpha = .45;
        // ombre
        ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(x + 3, y + 4, 11, 8, 0, 0, 7); ctx.fill();
        // jambes au pas
        ctx.fillStyle = '#1b1012';
        ctx.beginPath(); ctx.ellipse(x - 4, y + 3 + step * 4, 3, 4.5, 0, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.ellipse(x + 4, y + 3 - step * 4, 3, 4.5, 0, 0, 7); ctx.fill();
        // veste rouge + baudrier blanc
        ctx.fillStyle = C.red; ctx.beginPath(); ctx.ellipse(x, y, 10, 7.5, 0, 0, 7); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x - 7, y - 4); ctx.lineTo(x + 7, y + 4); ctx.stroke();
        ctx.fillStyle = C.gold; ctx.fillRect(x - 10, y - 2, 3, 3); ctx.fillRect(x + 7, y - 2, 3, 3);
        drawInstrument(kind, x, y);
        // shako + plumet blanc
        ctx.fillStyle = C.redSh; ctx.beginPath(); ctx.arc(x, y - 1, 5.5, 0, 7); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y - 3, 2.6, 0, 7); ctx.fill();
        ctx.globalAlpha = 1;
    }

    function drawMajor(x, y, step) {
        ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(x + 3, y + 4, 12, 9, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#1b1012';
        ctx.beginPath(); ctx.ellipse(x - 4, y + 3 + step * 5, 3.2, 5, 0, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.ellipse(x + 4, y + 3 - step * 5, 3.2, 5, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(x, y, 11, 8, 0, 0, 7); ctx.fill();
        ctx.strokeStyle = C.red; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(x - 8, y - 4); ctx.lineTo(x + 8, y + 4); ctx.stroke();
        ctx.fillStyle = C.gold; ctx.fillRect(x - 11, y - 3, 4, 4); ctx.fillRect(x + 7, y - 3, 4, 4);
        // canne qui tournoie
        const a = g ? g.mace : 0;
        const mx = x + 12, my = y - 6;
        ctx.strokeStyle = '#d9d2c6'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(mx - Math.cos(a) * 13, my - Math.sin(a) * 13); ctx.lineTo(mx + Math.cos(a) * 13, my + Math.sin(a) * 13); ctx.stroke();
        ctx.fillStyle = C.gold; ctx.beginPath(); ctx.arc(mx + Math.cos(a) * 13, my + Math.sin(a) * 13, 3.5, 0, 7); ctx.fill();
        // grand plumet
        ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(x, y - 1, 6.5, 0, 7); ctx.fill();
        ctx.fillStyle = C.red; ctx.beginPath(); ctx.ellipse(x, y - 6, 3.5, 6, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y - 9, 2.2, 0, 7); ctx.fill();
    }

    function drawBand() {
        const beat = g ? g.t * BPM / 60 : 0;
        const step = Math.sin(beat * Math.PI);
        const pos = g ? layout() : [];
        for (let j = pos.length - 1; j >= 0; j--) {
            const p = pos[j];
            drawMusician(p.x, p.y + Math.abs(step) * -1.5, g.band[p.i], (p.row % 2 ? -step : step), false);
        }
        drawMajor(g ? g.majorX : W / 2, MAJOR_Y, step);
    }

    function drawFx() {
        for (const f of g.fx) {
            const a = clamp(f.t / .5, 0, 1);
            if (f.kind === 'fall') {
                ctx.save(); ctx.globalAlpha = a; ctx.translate(f.x, f.y); ctx.rotate(f.rot);
                drawMusician(0, 0, f.inst, 0, false);
                ctx.restore();
            } else {
                ctx.globalAlpha = a;
                ctx.font = `${f.big ? 400 : 700} ${f.big ? 20 : 15}px ${f.big ? "'Paytone One'" : 'Poppins'}, sans-serif`;
                ctx.textAlign = 'center';
                ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(22,9,11,.85)';
                const tx = clamp(f.x, 90, W - 90);
                ctx.strokeText(f.text, tx, f.y); ctx.fillStyle = f.color; ctx.fillText(f.text, tx, f.y);
                ctx.globalAlpha = 1;
            }
        }
    }

    function drawHud() {
        ctx.fillStyle = 'rgba(22,9,11,.78)';
        roundRect(10, 10, W - 20, 44, 14); ctx.fill();
        ctx.font = "400 20px 'Paytone One', sans-serif"; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff'; ctx.textAlign = 'left';
        ctx.fillText(Math.floor(g.score).toLocaleString('fr-FR'), 24, 33);
        ctx.textAlign = 'center'; ctx.fillStyle = C.redHi;
        ctx.font = "600 13px Poppins, sans-serif";
        ctx.fillText(`${Math.floor(g.dist / 20)} m`, W / 2, 33);
        ctx.textAlign = 'right'; ctx.fillStyle = '#fff';
        ctx.font = "400 18px 'Paytone One', sans-serif";
        ctx.fillText(`${g.band.length}`, W - 46, 33);
        // petit musicien
        ctx.fillStyle = C.red; ctx.beginPath(); ctx.ellipse(W - 32, 35, 7, 5, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(W - 32, 31, 3.5, 0, 7); ctx.fill();
        if (g.mult > 1) {
            ctx.fillStyle = C.gold; roundRect(W / 2 - 50, 60, 100, 26, 13); ctx.fill();
            ctx.fillStyle = C.ink; ctx.textAlign = 'center'; ctx.font = "400 14px 'Paytone One', sans-serif";
            ctx.fillText(`ALIGNÉS ×${g.mult}`, W / 2, 74);
        } else {
            // jauge d'alignement
            const p = (g.align % 3) / 3;
            ctx.fillStyle = 'rgba(22,9,11,.55)'; roundRect(W / 2 - 50, 62, 100, 8, 4); ctx.fill();
            ctx.fillStyle = C.gold; roundRect(W / 2 - 50, 62, Math.max(8, 100 * p), 8, 4); ctx.fill();
        }
        if (g.toast) {
            const a = clamp(g.toast.t / .4, 0, 1);
            ctx.globalAlpha = a;
            ctx.font = "400 22px 'Paytone One', sans-serif";
            const tw = Math.min(W - 30, ctx.measureText(g.toast.text).width + 36);
            ctx.fillStyle = C.red; roundRect(W / 2 - tw / 2, 150, tw, 44, 22); ctx.fill();
            ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
            ctx.fillText(g.toast.text, W / 2, 173, W - 50);
            ctx.globalAlpha = 1;
        }
        ctx.textBaseline = 'alphabetic';
    }

    function draw() {
        ctx.save();
        if (g && g.shake > 0) ctx.translate(rand(-4, 4) * g.shake * 3, rand(-4, 4) * g.shake * 3);
        ctx.fillStyle = '#d8c8c2'; ctx.fillRect(-10, -10, W + 20, H + 20);
        drawStreet();
        if (g) {
            drawDecor();
            for (const o of g.objs) if (o.type !== 'arche' && !o.done) drawObject(o);
            for (const o of g.objs) if (o.done && !o.bonus) drawObject(o);
            drawBand();
            for (const o of g.objs) if (o.type === 'arche') drawObject(o);
            drawFx();
            if (g.flash > 0) { ctx.fillStyle = `rgba(227,19,31,${g.flash})`; ctx.fillRect(0, 0, W, H); }
            drawHud();
        } else {
            drawBand();
        }
        ctx.restore();
    }

    // ---------- Fin de partie ----------
    function gameOver() {
        state = 'over';
        stopMusic(true);
        bip(392, .2, 'triangle', .1); setTimeout(() => bip(330, .2, 'triangle', .1), 200); setTimeout(() => bip(262, .5, 'triangle', .1), 400);
        const score = Math.floor(g.score);
        const record = score > best;
        if (record) { best = score; store.set('parade-best', String(best)); }
        $('paradeScore').textContent = score.toLocaleString('fr-FR');
        $('paradeDetail').textContent = `${Math.floor(g.dist / 20)} m parcourus · ${g.notes} notes · dernière ville : ${g.town}`;
        $('paradeRecord').textContent = record ? 'Nouveau record !' : `Record : ${best.toLocaleString('fr-FR')} points`;
        $('paradeRecord').classList.toggle('is-record', record);
        $('paradeBest').textContent = `Ton record : ${best.toLocaleString('fr-FR')} points`;
        btnPause.disabled = true;
        prepareSend({ score, metres: Math.floor(g.dist / 20), notes: g.notes, duree: Math.round(g.t * 10) / 10 });
        setTimeout(() => { overBox.hidden = false; draw(); }, 700);
        draw();
    }

    function setPause(on) {
        if (on && state === 'play') {
            state = 'pause'; pauseBox.hidden = false; stopMusic(false); draw();
        } else if (!on && state === 'pause') {
            state = 'play'; pauseBox.hidden = true; playMusic();
            last = performance.now(); requestAnimationFrame(loop);
        }
    }

    // ---------- Commandes ----------
    document.querySelectorAll('[data-parade-start]').forEach(b => b.addEventListener('click', newGame));
    $('paradeResume').addEventListener('click', () => setPause(false));
    btnPause.addEventListener('click', () => setPause(state === 'play'));

    window.addEventListener('keydown', e => {
        const k = e.key;
        if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
        if (k === 'ArrowLeft' || k === 'q' || k === 'Q' || k === 'a' || k === 'A') { keys.left = true; if (state === 'play') e.preventDefault(); }
        else if (k === 'ArrowRight' || k === 'd' || k === 'D') { keys.right = true; if (state === 'play') e.preventDefault(); }
        else if (k === 'p' || k === 'P' || k === 'Escape') { if (state === 'play' || state === 'pause') setPause(state === 'play'); }
        else if ((k === ' ' || k === 'Enter') && (state === 'menu' || state === 'over') && document.activeElement === document.body) { e.preventDefault(); newGame(); }
    });
    window.addEventListener('keyup', e => {
        const k = e.key;
        if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
        if (k === 'ArrowLeft' || k === 'q' || k === 'Q' || k === 'a' || k === 'A') keys.left = false;
        if (k === 'ArrowRight' || k === 'd' || k === 'D') keys.right = false;
    });

    // glisser (doigt ou souris) : déplacement relatif, le doigt ne cache pas le tambour-major
    let drag = null;
    canvas.addEventListener('pointerdown', e => {
        if (state !== 'play') return;
        drag = { x: e.clientX, from: g.majorX, scale: W / canvas.getBoundingClientRect().width };
        canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', e => {
        if (!drag || state !== 'play') return;
        g.targetX = drag.from + (e.clientX - drag.x) * drag.scale * 1.25;
    });
    const endDrag = () => { drag = null; };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);

    document.addEventListener('visibilitychange', () => { if (document.hidden) setPause(true); });
    window.addEventListener('blur', () => setPause(true));

    // ---------- Classement en ligne (script Google, cf. outils/classement-apps-script.gs) ----------
    const URL_TOP = (typeof CLASSEMENT_URL !== 'undefined' && CLASSEMENT_URL) ? CLASSEMENT_URL : '';
    const board = $('paradeBoard'), topList = $('paradeTop'), boardFoot = $('paradeBoardFoot');
    const sendForm = $('paradeSend'), pseudoInput = $('paradePseudo'), sendMsg = $('paradeSendMsg');
    const sendBtn = sendForm.querySelector('button');
    const PSEUDO_OK = /^[\p{L}\p{N} _.\-']{2,16}$/u;
    let pending = null, sent = false;
    pseudoInput.value = store.get('parade-pseudo') || '';

    function cleTxt(p) { return String(p).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

    function renderTop(top, joueurs, moi) {
        topList.textContent = '';
        if (!top || !top.length) {
            const li = document.createElement('li');
            li.className = 'parade-top-empty';
            li.textContent = 'Personne pour l’instant : à toi de jouer !';
            topList.appendChild(li);
        }
        const mine = cleTxt(moi || store.get('parade-pseudo') || '');
        (top || []).forEach((r, i) => {
            const li = document.createElement('li');
            if (i < 3) li.classList.add('podium', 'p' + (i + 1));
            if (mine && cleTxt(r.pseudo) === mine) li.classList.add('is-me');
            const rank = document.createElement('span'); rank.className = 'rk'; rank.textContent = i + 1;
            const name = document.createElement('span'); name.className = 'nm'; name.textContent = r.pseudo;
            const pts = document.createElement('span'); pts.className = 'pt'; pts.textContent = Number(r.score).toLocaleString('fr-FR');
            li.append(rank, name, pts);
            topList.appendChild(li);
        });
        boardFoot.textContent = joueurs ? `${joueurs} joueur${joueurs > 1 ? 's' : ''} classé${joueurs > 1 ? 's' : ''}` : '';
    }

    function loadTop() {
        if (!URL_TOP) return;
        fetch(URL_TOP, { cache: 'no-store' })
            .then(r => r.json())
            .then(d => { if (d && d.ok) renderTop(d.top, d.joueurs); })
            .catch(() => { topList.innerHTML = '<li class="parade-top-empty">Classement indisponible pour le moment.</li>'; });
    }

    function prepareSend(result) {
        if (!URL_TOP) return;
        pending = result; sent = false;
        sendForm.hidden = result.score <= 0;
        sendBtn.disabled = false;
        sendMsg.textContent = ''; sendMsg.className = 'parade-send-msg';
    }

    sendForm.addEventListener('submit', e => {
        e.preventDefault();
        if (!pending || sent) return;
        const pseudo = pseudoInput.value.trim().replace(/\s+/g, ' ');
        if (!PSEUDO_OK.test(pseudo)) {
            sendMsg.textContent = 'Pseudo de 2 à 16 caractères (lettres, chiffres, espace, - _ .).';
            sendMsg.className = 'parade-send-msg is-error';
            return;
        }
        store.set('parade-pseudo', pseudo);
        sendBtn.disabled = true;
        sendMsg.textContent = 'Envoi…'; sendMsg.className = 'parade-send-msg';
        fetch(URL_TOP, { method: 'POST', body: JSON.stringify(Object.assign({ pseudo }, pending)) })
            .then(r => r.json())
            .then(d => {
                if (!d || !d.ok) throw new Error((d && d.erreur) || 'Envoi refusé.');
                sent = true;
                sendMsg.textContent = d.rang ? `Envoyé ! Tu es ${d.rang === 1 ? '1er' : d.rang + 'e'} sur ${d.joueurs} 🎉` : 'Envoyé !';
                sendMsg.className = 'parade-send-msg is-ok';
                renderTop(d.top, d.joueurs, pseudo);
            })
            .catch(err => {
                sendBtn.disabled = false;
                sendMsg.textContent = err && err.message && !/fetch|network/i.test(err.message) ? err.message : 'Envoi impossible, réessaie dans un instant.';
                sendMsg.className = 'parade-send-msg is-error';
            });
    });

    if (URL_TOP) { board.hidden = false; loadTop(); }

    // ---------- Plein écran ----------
    const stage = $('paradeStage'), btnFull = $('paradeFull');
    const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement;
    if (!(stage.requestFullscreen || stage.webkitRequestFullscreen)) {
        btnFull.hidden = true; // iPhone : pas de plein écran pour un élément de page
    } else {
        btnFull.addEventListener('click', () => {
            const req = stage.requestFullscreen || stage.webkitRequestFullscreen;
            Promise.resolve(req.call(stage)).catch(() => { });
        });
        $('paradeExitFull').addEventListener('click', () => {
            const exit = document.exitFullscreen || document.webkitExitFullscreen;
            if (fsElement()) Promise.resolve(exit.call(document)).catch(() => { });
        });
        const onFs = () => requestAnimationFrame(resize);
        document.addEventListener('fullscreenchange', onFs);
        document.addEventListener('webkitfullscreenchange', onFs);
    }

    resize();
    // les polices du titre arrivent après le premier dessin
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (state !== 'play') draw(); });
})();
