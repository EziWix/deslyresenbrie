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
        img.src = 'images/saisons/noel.webp';
        img.classList.add('noel-logo');
        img.removeAttribute('width'); img.removeAttribute('height');
    });

    // grand logo de l'accueil : lyre de Noël + texte « Des Lyres en Brie »
    document.querySelectorAll('img.hero-logo').forEach(img => {
        img.src = 'images/saisons/noel-grand.webp';
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
    if (reduced) return;
    const cv = document.createElement('canvas');
    cv.className = 'noel-snow';
    cv.setAttribute('aria-hidden', 'true');
    document.body.appendChild(cv);
    const ctx = cv.getContext('2d');
    let W = 0, H = 0, flakes = [];
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    function size() {
        W = window.innerWidth; H = window.innerHeight;
        cv.width = W * dpr; cv.height = H * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const target = Math.round(Math.min(110, W * H / 14000));
        while (flakes.length < target) flakes.push(flake(true));
        flakes.length = target;
    }
    function flake(anywhere) {
        const r = Math.random() * 2.4 + .8;
        return { x: Math.random() * W, y: anywhere ? Math.random() * H : -10, r, vy: 18 + r * 14, sway: Math.random() * 6.28, sp: .4 + Math.random() * .8, a: .45 + Math.random() * .45 };
    }
    let last = performance.now();
    function frame(now) {
        const dt = Math.min(.05, (now - last) / 1000);
        last = now;
        ctx.clearRect(0, 0, W, H);
        for (const f of flakes) {
            f.y += f.vy * dt;
            f.sway += f.sp * dt;
            f.x += Math.sin(f.sway) * 12 * dt;
            if (f.y > H + 6) Object.assign(f, flake(false));
            if (f.x < -6) f.x = W + 5; else if (f.x > W + 6) f.x = -5;
            ctx.globalAlpha = f.a;
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 6.283); ctx.fill();
        }
        ctx.globalAlpha = 1;
        if (!document.hidden) requestAnimationFrame(frame);
    }
    size();
    window.addEventListener('resize', size);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { last = performance.now(); requestAnimationFrame(frame); } });
    requestAnimationFrame(frame);
})();
