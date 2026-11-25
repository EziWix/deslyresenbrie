/* =========================================================
   Mode Noël : neige, guirlande lumineuse sur l'en-tête,
   logo de Noël à la place de la lyre, petit message dans l'accueil.
   S'active avec MODE_NOEL = true dans js/data.js.
   ========================================================= */
(() => {
    if (typeof MODE_NOEL === 'undefined' || !MODE_NOEL) return;
    const root = document.documentElement;
    root.classList.add('noel');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ---------- Logo de Noël à la place de la lyre (en-tête, écran du jeu) ----------
    document.querySelectorAll('img.logo-mark, .parade-overlay img[src*="logo-mark"]').forEach(img => {
        img.src = 'images/saisons/noel.webp?v=3';
        img.classList.add('noel-logo');
        img.removeAttribute('width'); img.removeAttribute('height');
    });

    // grand logo de l'accueil : lyre de Noël + texte « Des Lyres en Brie »
    document.querySelectorAll('img.hero-logo').forEach(img => {
        img.src = 'images/saisons/noel-grand.webp?v=3';
        img.width = 706; img.height = 782;
    });

    // ---------- Guirlande lumineuse sous la pilule d'en-tête ----------
    const COLORS = ['#ff3b3b', '#ffd34d', '#4cd97b', '#4db2ff', '#ff8ad8'];
    const inner = document.querySelector('.header-inner');
    if (inner) {
        const box = document.createElement('div');
        box.className = 'noel-lights';
        box.setAttribute('aria-hidden', 'true');
        inner.appendChild(box);
        const build = () => {
            const w = inner.clientWidth - 40;
            if (w <= 0) return;
            const n = Math.max(8, Math.round(w / 46));
            const sag = 7;
            let path = 'M0 0';
            const step = w / n;
            for (let i = 0; i < n; i++) path += ` Q${(i + .5) * step} ${sag * 2} ${(i + 1) * step} 0`;
            let html = `<svg width="${w}" height="${sag * 2 + 4}" viewBox="0 -2 ${w} ${sag * 2 + 4}"><path d="${path}" fill="none" stroke="#2c1a12" stroke-width="1.6"/></svg>`;
            for (let i = 0; i < n; i++) {
                const x = (i + .5) * step;
                html += `<span style="left:${x}px;top:${sag + 1}px;--c:${COLORS[i % COLORS.length]};--d:${(i % 4) * .35}s"></span>`;
            }
            box.innerHTML = html;
        };
        build();
        let t;
        window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(build, 150); });
    }

    // ---------- Message de fêtes sur l'accueil ----------
    const badge = document.querySelector('.hero-badge');
    if (badge) badge.insertAdjacentHTML('beforebegin', '<span class="noel-greeting"><i class="fas fa-snowflake"></i> Joyeuses fêtes de fin d’année !</span>');

    // ---------- Neige ----------
    // Trois plans de profondeur (poudreuse au loin, vrais cristaux qui tournent, gros flocons
    // flous au premier plan), du vent avec des rafales, la souris qui écarte les flocons,
    // une gerbe de cristaux au clic, et la neige qui s'accumule sur le haut du menu.
    if (reduced) return;
    const cv = document.createElement('canvas');
    cv.className = 'noel-snow';
    cv.setAttribute('aria-hidden', 'true');
    document.body.appendChild(cv);
    const ctx = cv.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0, H = 0;
    const rnd = (a, b) => a + Math.random() * (b - a);

    // -- dessins des cristaux, préparés une seule fois (images hors écran) --
    function crystal(size, variant) {
        const c = document.createElement('canvas');
        const pad = Math.ceil(size * .35);
        c.width = c.height = Math.ceil((size + pad * 2) * dpr);
        const g = c.getContext('2d');
        g.scale(dpr, dpr);
        g.translate(size / 2 + pad, size / 2 + pad);
        g.strokeStyle = '#fff'; g.fillStyle = '#fff';
        g.lineCap = 'round';
        g.shadowColor = 'rgba(190,225,255,.9)'; g.shadowBlur = size * .25;
        const R = size / 2, lw = Math.max(1, size / 13);
        const branches = variant === 0 ? [[.45, .3], [.72, .22]] : variant === 1 ? [[.35, .38], [.62, .26], [.84, .14]] : [[.55, .36]];
        for (let k = 0; k < 6; k++) {
            g.save(); g.rotate(k * Math.PI / 3);
            g.lineWidth = lw;
            g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -R); g.stroke();
            g.lineWidth = lw * .85;
            for (const [at, len] of branches) {
                g.beginPath();
                g.moveTo(0, -R * at); g.lineTo(-R * len, -R * (at + len * .9));
                g.moveTo(0, -R * at); g.lineTo(R * len, -R * (at + len * .9));
                g.stroke();
            }
            if (variant === 2) { g.beginPath(); g.moveTo(-R * .16, -R * .95); g.lineTo(0, -R * 1.08); g.lineTo(R * .16, -R * .95); g.stroke(); }
            g.restore();
        }
        g.beginPath(); g.arc(0, 0, lw * 1.3, 0, 6.283); g.fill();
        return { img: c, half: size / 2 + pad };
    }
    function bokeh(size) {
        const c = document.createElement('canvas');
        c.width = c.height = Math.ceil(size * dpr);
        const g = c.getContext('2d');
        const r = c.width / 2;
        const grd = g.createRadialGradient(r, r, 0, r, r, r);
        grd.addColorStop(0, 'rgba(255,255,255,.95)');
        grd.addColorStop(.45, 'rgba(255,255,255,.5)');
        grd.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grd; g.fillRect(0, 0, c.width, c.height);
        return { img: c, half: size / 2 };
    }
    const CRYSTALS = [];
    for (const sz of [9, 12, 15, 19]) for (let v = 0; v < 3; v++) CRYSTALS.push(crystal(sz, v));
    const BIG = [crystal(30, 1), crystal(36, 0), crystal(32, 2)];
    const BOKEH = bokeh(26);

    // -- les flocons : z 0 = loin (poudreuse), 1 = milieu (cristaux), 2 = premier plan --
    let flakes = [];
    function flake(anywhere, z) {
        if (z === undefined) { const r = Math.random(); z = r < .58 ? 0 : r < .93 ? 1 : 2; }
        const f = { z, x: rnd(-20, W + 20), y: anywhere ? rnd(-20, H) : rnd(-70, -12), vx: 0, vy: 0, ph: rnd(0, 6.28), sp: rnd(.5, 1.3), rot: rnd(0, 6.28), vr: rnd(-1.1, 1.1) };
        if (z === 0) { f.r = rnd(.7, 1.9); f.fall = rnd(16, 30); f.a = rnd(.35, .7); }
        else if (z === 1) { f.spr = CRYSTALS[Math.floor(Math.random() * CRYSTALS.length)]; f.fall = rnd(34, 58); f.a = rnd(.7, .95); }
        else { f.spr = Math.random() < .45 ? BOKEH : BIG[Math.floor(Math.random() * BIG.length)]; f.fall = rnd(70, 110); f.a = rnd(.22, .42); }
        return f;
    }

    // -- vent qui ondule, avec des rafales de temps en temps --
    let t = 0, gust = 0, gustTarget = 0, nextGust = rnd(6, 12), gustEnd = 0;
    function wind(dt) {
        t += dt; nextGust -= dt;
        if (nextGust <= 0) { gustTarget = rnd(-75, 75); gustEnd = t + rnd(1.8, 3.2); nextGust = rnd(9, 17); }
        if (gustEnd && t > gustEnd) { gustTarget = 0; gustEnd = 0; }
        gust += (gustTarget - gust) * Math.min(1, dt * 1.2);
        return Math.sin(t * .15) * 14 + Math.sin(t * .041 + 1) * 8 + gust;
    }

    // -- la souris écarte les flocons ; un clic fait jaillir une gerbe de cristaux --
    let mx = -999, my = -999;
    window.addEventListener('pointermove', e => { mx = e.clientX; my = e.clientY; }, { passive: true });
    document.documentElement.addEventListener('pointerleave', () => { mx = my = -999; });
    document.addEventListener('pointerdown', e => {
        if (e.target.closest && e.target.closest('#parade, input, textarea, select')) return;
        for (let i = 0; i < 14; i++) {
            const f = flake(false, 1);
            const a = (i / 14) * 6.283 + rnd(-.2, .2), v = rnd(90, 220);
            Object.assign(f, { x: e.clientX, y: e.clientY, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, life: 4, spr: CRYSTALS[Math.floor(rnd(0, 6))] });
            flakes.push(f);
        }
    }, { passive: true });

    // -- parallaxe quand on fait défiler la page --
    let lastScroll = window.scrollY, scrollShift = 0;
    window.addEventListener('scroll', () => { scrollShift += window.scrollY - lastScroll; lastScroll = window.scrollY; }, { passive: true });

    // -- la neige s'accumule sur le haut du menu --
    const pill = document.querySelector('.header-inner');
    const BIN = 4, CAP_MAX = 9, CAP_H = 18;
    let cap = null, capCtx = null, capBins = new Float32Array(0), capRect = null;
    if (pill) {
        cap = document.createElement('canvas');
        cap.className = 'noel-cap';
        cap.setAttribute('aria-hidden', 'true');
        pill.appendChild(cap);
        capCtx = cap.getContext('2d');
    }
    // forme vers laquelle la couche tend : des congères douces, différentes à chaque visite
    let capTarget = new Float32Array(0);
    function measureCap() {
        if (!cap) return;
        const r = pill.getBoundingClientRect();
        const n = Math.ceil(r.width / BIN) + 1;
        if (capBins.length !== n) {
            const old = capBins;
            capBins = new Float32Array(n);
            for (let i = 0; i < Math.min(n, old.length); i++) capBins[i] = old[i];
            capTarget = new Float32Array(n);
            const p1 = rnd(0, 6.28), p2 = rnd(0, 6.28), p3 = rnd(0, 6.28);
            for (let i = 0; i < n; i++) {
                capTarget[i] = 5 + 1.6 * Math.sin(i / 9 + p1) + 1.1 * Math.sin(i / 3.7 + p2) + .7 * Math.sin(i / 1.9 + p3);
                if (!old.length) capBins[i] = capTarget[i] * .35; // un peu de neige dès l'arrivée
            }
        }
        cap.width = Math.ceil(r.width * dpr); cap.height = CAP_H * dpr;
        cap.style.width = r.width + 'px';
        capCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function landOnCap(x) {
        const i = Math.round(x / BIN);
        for (let k = -3; k <= 3; k++) {
            const j = i + k;
            if (j >= 0 && j < capBins.length) capBins[j] = Math.min(CAP_MAX, capBins[j] + .7 * Math.exp(-k * k / 4));
        }
    }
    function drawCap(dt) {
        const w = capRect.width, n = capBins.length;
        // la couche s'épaissit peu à peu vers ses congères, se tasse (lissage), et les bosses
        // laissées par les flocons qui s'y posent redescendent doucement
        for (let i = 0; i < n; i++) capBins[i] += (capTarget[i] - capBins[i]) * Math.min(1, dt * .06);
        for (let i = 1; i < n - 1; i++) capBins[i] = capBins[i] * .96 + (capBins[i - 1] + capBins[i + 1]) * .02;
        capCtx.clearRect(0, 0, w, CAP_H);
        capCtx.beginPath();
        capCtx.moveTo(0, CAP_H);
        for (let i = 0; i < n; i++) {
            const x = Math.min(w, i * BIN);
            const edge = Math.min(1, Math.min(x, w - x) / 26); // plus fine dans les coins arrondis
            capCtx.lineTo(x, CAP_H - capBins[i] * edge * edge);
        }
        capCtx.lineTo(w, CAP_H);
        capCtx.closePath();
        capCtx.fillStyle = '#fff';
        capCtx.shadowColor = 'rgba(160,200,255,.7)'; capCtx.shadowBlur = 4;
        capCtx.fill();
        capCtx.shadowBlur = 0;
    }

    function size() {
        W = window.innerWidth; H = window.innerHeight;
        cv.width = Math.ceil(W * dpr); cv.height = Math.ceil(H * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const target = Math.round(Math.min(170, W * H / 9000));
        let base = flakes.filter(f => f.life === undefined);
        while (base.length < target) base.push(flake(true));
        flakes = base.slice(0, target);
        measureCap();
    }

    // -- boucle d'animation --
    let last = performance.now();
    function frame(now) {
        const dt = Math.min(.05, (now - last) / 1000);
        last = now;
        const wv = wind(dt);
        const shift = scrollShift; scrollShift = 0;
        if (cap) capRect = pill.getBoundingClientRect();
        ctx.clearRect(0, 0, W, H);
        for (let i = flakes.length - 1; i >= 0; i--) {
            const f = flakes[i];
            const depth = f.z === 0 ? .45 : f.z === 1 ? .8 : 1.35;
            f.ph += f.sp * dt;
            // souris : poussée douce qui écarte les flocons proches
            const dx = f.x - mx, dy = f.y - my, d2 = dx * dx + dy * dy;
            if (d2 < 9000 && d2 > 1) { const d = Math.sqrt(d2), k = (1 - d / 95) * 520 * dt; f.vx += dx / d * k; f.vy += dy / d * k; }
            const damp = 1 - Math.min(1, dt * 2.2);
            f.vx *= damp; f.vy *= damp;
            const py = f.y;
            f.x += (wv * depth + Math.sin(f.ph) * 14 * depth + f.vx) * dt;
            f.y += (f.fall + f.vy) * dt - shift * depth * .35;
            f.rot += f.vr * dt;
            if (f.life !== undefined) { f.life -= dt; if (f.life <= 0) { flakes.splice(i, 1); continue; } }
            // atterrissage sur le haut du menu (poudreuse et cristaux seulement)
            if (cap && f.z < 2 && py < capRect.top && f.y >= capRect.top && f.x > capRect.left && f.x < capRect.right && Math.random() < .5) {
                landOnCap(f.x - capRect.left);
                if (f.life !== undefined) flakes.splice(i, 1); else Object.assign(f, flake(false, f.z));
                continue;
            }
            if (f.y > H + 40 || f.y < -90) {
                if (f.life !== undefined) { flakes.splice(i, 1); continue; }
                Object.assign(f, flake(false, f.z));
                if (shift < 0) f.y = H + 20; // on remonte la page : la neige revient par le bas
            }
            if (f.x < -50) f.x = W + 40; else if (f.x > W + 50) f.x = -40;
            ctx.globalAlpha = f.life !== undefined ? Math.min(1, f.life) * f.a : f.a;
            if (f.z === 0) {
                ctx.fillStyle = '#fff';
                ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 6.283); ctx.fill();
            } else {
                const s = f.spr;
                ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.rot);
                ctx.drawImage(s.img, -s.half, -s.half, s.half * 2, s.half * 2);
                ctx.restore();
            }
        }
        ctx.globalAlpha = 1;
        if (cap) drawCap(dt);
        if (!document.hidden) requestAnimationFrame(frame);
    }
    size();
    let rt;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(size, 120); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { last = performance.now(); requestAnimationFrame(frame); } });
    requestAnimationFrame(frame);
})();
