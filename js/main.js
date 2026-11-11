/* =========================================================
   Des Lyres en Brie — scripts communs
   ========================================================= */

const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const FINE_POINTER = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

document.addEventListener('DOMContentLoaded', () => {
    initHeader();
    renderEvents();
    renderGallery();
    initPlayer();
    initContactForm();
    initGuestbook();
    initMarquee();
    initNotes();
    initHeroParallax();
    initTilt();
    initCounters();
    initReveal();  // en dernier : observe aussi les blocs générés ci-dessus
    document.querySelectorAll('.year').forEach(el => { el.textContent = new Date().getFullYear(); });
});

/* ---------- En-tête : fond au défilement, menu mobile, progression, retour en haut ---------- */
function initHeader() {
    const header = document.getElementById('header');
    const burger = document.getElementById('hamburger');
    const nav = document.getElementById('mainNav');
    const progress = document.getElementById('scrollProgress');
    const toTop = document.getElementById('toTop');

    let ticking = false;
    const update = () => {
        ticking = false;
        const y = window.scrollY;
        const max = document.documentElement.scrollHeight - window.innerHeight;
        header.classList.toggle('scrolled', y > 40);
        if (progress) progress.style.transform = `scaleX(${max > 0 ? Math.min(y / max, 1) : 0})`;
        if (toTop) toTop.classList.toggle('show', y > 600);
    };
    update();
    window.addEventListener('scroll', () => {
        if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    window.addEventListener('resize', update);

    if (toTop) toTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: REDUCED_MOTION ? 'auto' : 'smooth' }));

    const setOpen = open => {
        nav.classList.toggle('open', open);
        burger.classList.toggle('open', open);
        burger.setAttribute('aria-expanded', open);
    };
    burger.addEventListener('click', () => setOpen(!nav.classList.contains('open')));
    nav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => setOpen(false)));
    document.addEventListener('click', e => { if (!header.contains(e.target)) setOpen(false); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') setOpen(false); });
}

/* ---------- Apparition des blocs (en cascade dans une même grille) ---------- */
function initReveal() {
    const items = [...document.querySelectorAll('.reveal:not(.visible)')];
    const settle = el => {
        // une fois apparu, on retire les classes pour rendre la main aux effets de survol
        const delay = parseFloat(el.style.getPropertyValue('--d')) || 0;
        setTimeout(() => { el.classList.remove('reveal', 'visible'); el.style.removeProperty('--d'); }, 900 + delay * 1000);
    };
    if (!('IntersectionObserver' in window) || REDUCED_MOTION) {
        items.forEach(el => el.classList.remove('reveal'));
        return;
    }
    // décalage selon la position parmi les frères qui apparaissent aussi
    items.forEach(el => {
        const siblings = [...el.parentElement.children].filter(c => c.classList.contains('reveal'));
        const i = siblings.indexOf(el);
        if (i > 0) el.style.setProperty('--d', Math.min(i * 0.09, 0.6) + 's');
    });
    const io = new IntersectionObserver(entries => {
        entries.forEach(e => {
            if (!e.isIntersecting) return;
            e.target.classList.add('visible');
            io.unobserve(e.target);
            settle(e.target);
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
    items.forEach(el => io.observe(el));
}

/* ---------- Compteurs animés : <span data-count="14" data-suffix=" %"> ---------- */
function animateCount(el) {
    const target = Number(el.dataset.count);
    const prefix = el.dataset.prefix || '', suffix = el.dataset.suffix || '';
    if (REDUCED_MOTION || !isFinite(target)) { el.textContent = prefix + el.dataset.count + suffix; return; }
    const t0 = performance.now(), dur = 1400;
    const tick = now => {
        const p = Math.min((now - t0) / dur, 1);
        el.textContent = prefix + Math.round(target * (1 - Math.pow(1 - p, 3))) + suffix;
        if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
}

function initCounters() {
    const els = document.querySelectorAll('[data-count]');
    if (!els.length) return;
    if (!('IntersectionObserver' in window)) { els.forEach(animateCount); return; }
    const io = new IntersectionObserver(entries => {
        entries.forEach(e => {
            if (!e.isIntersecting) return;
            io.unobserve(e.target);
            animateCount(e.target);
        });
    }, { threshold: 0.4 });
    els.forEach(el => io.observe(el));
}

/* ---------- Bandeau défilant : le contenu est doublé pour boucler sans raccord ---------- */
function initMarquee() {
    document.querySelectorAll('.marquee-track').forEach(track => {
        [...track.children].forEach(c => {
            const clone = c.cloneNode(true);
            clone.setAttribute('aria-hidden', 'true');
            clone.tabIndex = -1;
            track.appendChild(clone);
        });
    });
}

/* ---------- Notes de musique qui montent dans le héros ---------- */
function initNotes() {
    const box = document.querySelector('.notes');
    if (!box || REDUCED_MOTION) return;
    const glyphs = ['♪', '♫', '♩', '♬'];
    const n = window.innerWidth < 700 ? 10 : 20;
    for (let i = 0; i < n; i++) {
        const s = document.createElement('span');
        s.textContent = glyphs[i % glyphs.length];
        s.style.left = (Math.random() * 96 + 2) + '%';
        s.style.fontSize = (18 + Math.random() * 34) + 'px';
        s.style.animationDuration = (11 + Math.random() * 14) + 's';
        s.style.animationDelay = (-Math.random() * 25) + 's';
        box.appendChild(s);
    }
}

/* ---------- Héros : la lueur et le logo suivent légèrement la souris ---------- */
function initHeroParallax() {
    const hero = document.querySelector('.hero');
    if (!hero || !FINE_POINTER || REDUCED_MOTION) return;
    const title = hero.querySelector('.hero-title');
    hero.addEventListener('pointermove', e => {
        const r = hero.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width * 2 - 1, y = (e.clientY - r.top) / r.height * 2 - 1;
        hero.style.setProperty('--mx', x.toFixed(3));
        hero.style.setProperty('--my', y.toFixed(3));
        if (title) title.style.transform = `translate(${(x * -10).toFixed(1)}px, ${(y * -6).toFixed(1)}px)`;
    });
}

/* ---------- Cartes qui s'inclinent sous la souris ---------- */
function initTilt() {
    if (!FINE_POINTER || REDUCED_MOTION) return;
    document.querySelectorAll('.tilt').forEach(el => {
        el.addEventListener('pointermove', e => {
            if (el.classList.contains('reveal')) return;
            const r = el.getBoundingClientRect();
            const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
            el.style.transform = `perspective(700px) translateY(-6px) rotateX(${(-y * 7).toFixed(2)}deg) rotateY(${(x * 9).toFixed(2)}deg)`;
        });
        el.addEventListener('pointerleave', () => { el.style.transform = ''; });
    });
}

/* ---------- Agenda ---------- */
const MOIS_LONGS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

function parseDate(str) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
}

function eventHTML(ev, past, isNext) {
    const d = parseDate(ev.date);
    const lieu = [ev.lieu, ev.ville].filter(Boolean).join(', ');
    const titre = ev.lien
        ? `<a href="${ev.lien}" target="_blank" rel="noopener">${ev.titre} <i class="fas fa-arrow-up-right-from-square" style="font-size:.7em"></i></a>`
        : ev.titre;
    return `
        <article class="event reveal${past ? ' past' : ''}${isNext ? ' next' : ''}">
            <div class="event-date">
                <span class="event-day">${d.getDate()}</span>
                <span class="event-month">${MOIS[d.getMonth()]} ${d.getFullYear()}</span>
            </div>
            <div>
                <h3 class="event-title">${titre}</h3>
                <div class="event-meta">
                    ${ev.heure ? `<span><i class="far fa-clock"></i>${ev.heure}</span>` : ''}
                    ${lieu ? `<span><i class="fas fa-location-dot"></i>${lieu}</span>` : ''}
                </div>
            </div>
            <div class="event-tags">
                ${isNext ? '<span class="event-tag" style="background:var(--red);color:#fff"><i class="fas fa-bolt"></i> Prochain</span>' : ''}
                ${ev.type ? `<span class="event-tag">${ev.type}</span>` : ''}
                ${ev.aConfirmer && !past ? '<span class="event-tag event-tbc"><i class="fas fa-circle-question"></i> À confirmer</span>' : ''}
            </div>
        </article>`;
}

/* Page agenda : dates regroupées par formation (pastille date + titre + lieu) */
const FORMATIONS = [
    { type: 'Harmonie', label: 'Harmonie', icon: 'fa-music' },
    { type: 'Marching band', label: 'Marching Band', icon: 'fa-drum' },
    { type: 'Fanfare', label: 'Fanfare', icon: 'fa-bullhorn' },
    { type: 'Animation', label: 'Animations', icon: 'fa-star' },
];

function agendaItemHTML(ev, past) {
    const d = parseDate(ev.date);
    const lieu = [ev.lieu, ev.ville].filter(Boolean).join(', ');
    const titre = ev.lien
        ? `<a href="${ev.lien}" target="_blank" rel="noopener">${ev.titre} <i class="fas fa-arrow-up-right-from-square" style="font-size:.7em"></i></a>`
        : ev.titre;
    return `
        <article class="agenda-item reveal${past ? ' past' : ''}">
            <div class="agenda-badge">
                <span class="agenda-day">${d.getDate()}</span>
                <span class="agenda-month">${MOIS[d.getMonth()]}</span>
                <span class="agenda-year">${d.getFullYear()}</span>
            </div>
            <div class="agenda-info">
                <h4>${titre}${ev.aConfirmer && !past ? ' <span class="event-tag event-tbc"><i class="fas fa-circle-question"></i> À confirmer</span>' : ''}</h4>
                ${lieu ? `<p><i class="fas fa-location-dot"></i>${lieu}</p>` : ''}
                ${ev.heure ? `<p><i class="fas fa-clock"></i>${ev.heure}</p>` : ''}
            </div>
        </article>`;
}

function agendaGroupsHTML(list, past) {
    const known = FORMATIONS.map(f => f.type);
    const groups = FORMATIONS.concat(
        [...new Set(list.map(e => e.type || 'Autres').filter(t => !known.includes(t)))].map(t => ({ type: t, label: t, icon: 'fa-calendar-day' })));
    return groups.map(g => {
        const items = list.filter(e => (e.type || 'Autres') === g.type);
        if (!items.length) return '';
        return `
            <div class="agenda-group">
                <h3 class="agenda-group-title"><i class="fas ${g.icon}"></i> ${g.label}</h3>
                <div class="agenda-list">${items.map(ev => agendaItemHTML(ev, past)).join('')}</div>
            </div>`;
    }).join('');
}

function emptyHTML(text) {
    return `<div class="events-empty"><i class="far fa-calendar"></i>${text}</div>`;
}

// « dans 11 jours », « demain », « aujourd'hui »
function daysLabel(n) {
    return n === 0 ? "aujourd'hui" : n === 1 ? 'demain' : `dans ${n} jours`;
}

function renderEvents() {
    if (typeof EVENTS === 'undefined') return;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const sorted = [...EVENTS].sort((a, b) => parseDate(a.date) - parseDate(b.date));
    const upcoming = sorted.filter(ev => parseDate(ev.date) >= today);
    const past = sorted.filter(ev => parseDate(ev.date) < today).reverse();
    const next = upcoming[0];
    const daysTo = ev => Math.round((parseDate(ev.date) - today) / 86400000);
    const shortDate = ev => { const d = parseDate(ev.date); return `${d.getDate()} ${MOIS[d.getMonth()]}`; };

    // Accueil : les 3 prochaines dates
    const home = document.getElementById('nextEvents');
    if (home) {
        home.innerHTML = upcoming.length
            ? upcoming.slice(0, 3).map((ev, i) => eventHTML(ev, false, i === 0)).join('')
            : emptyHTML('Les prochaines dates arrivent très bientôt.');
    }

    // Accueil : pastille « prochain rendez-vous » du héros
    const pill = document.getElementById('nextPill');
    if (pill) {
        pill.innerHTML = next
            ? `<small>Prochain rendez-vous · ${daysLabel(daysTo(next))}</small><strong>${shortDate(next)} — ${next.titre}</strong>`
            : `<small>Agenda</small><strong>Les prochaines dates arrivent bientôt</strong>`;
    }

    // Accueil : chiffres calculés depuis l'agenda
    const setStat = (name, value, opts = {}) => {
        const el = document.querySelector(`[data-stat="${name}"]`);
        if (!el) return;
        if (typeof value === 'number') { el.dataset.count = value; Object.assign(el.dataset, opts); el.textContent = (opts.prefix || '') + '0'; }
        else el.textContent = value;
    };
    setStat('upcoming', upcoming.length);
    if (next) {
        const n = daysTo(next);
        if (n === 0) setStat('days', 'Jour J'); else setStat('days', n, { prefix: 'J-' });
    } else setStat('days', '—');

    // Accueil : prochaine date de chaque formation
    document.querySelectorAll('[data-next-type]').forEach(el => {
        const ev = upcoming.find(e => e.type === el.dataset.nextType);
        el.textContent = ev ? `${shortDate(ev)} · ${ev.ville || ev.lieu || ''}` : 'Bientôt annoncée';
    });
    document.querySelectorAll('[data-count-type]').forEach(el => {
        el.textContent = upcoming.filter(e => e.type === el.dataset.countType).length;
    });

    // Page agenda : à venir + déjà joué
    const up = document.getElementById('upcomingEvents');
    if (up) {
        up.innerHTML = upcoming.length
            ? agendaGroupsHTML(upcoming, false)
            : emptyHTML('Aucune date annoncée pour le moment. Suivez-nous sur Facebook pour être prévenus.');
    }
    const pastBox = document.getElementById('pastEvents');
    if (pastBox) {
        const block = document.getElementById('pastBlock');
        if (past.length) pastBox.innerHTML = agendaGroupsHTML(past, true);
        else if (block) block.hidden = true;
    }
}

/* ---------- Galerie + visionneuse ---------- */
function renderGallery() {
    const box = document.getElementById('gallery');
    if (!box || typeof PHOTOS === 'undefined') return;

    if (!PHOTOS.length) {
        box.innerHTML = Array.from({ length: 3 }, () => `
            <div class="gallery-placeholder">
                <div><i class="fas fa-camera"></i>Les premières photos arrivent bientôt</div>
            </div>`).join('');
        return;
    }

    box.innerHTML = PHOTOS.map((p, i) => `
        <figure class="gallery-item" data-index="${i}">
            <img src="${p.src}" alt="${p.legende || 'Photo Des Lyres en Brie'}" loading="lazy">
        </figure>`).join('');

    const lb = document.getElementById('lightbox');
    const img = lb.querySelector('img');
    let current = 0;

    const show = i => {
        current = (i + PHOTOS.length) % PHOTOS.length;
        img.src = PHOTOS[current].src;
        img.alt = PHOTOS[current].legende || '';
    };
    const close = () => lb.classList.remove('open');

    box.querySelectorAll('.gallery-item').forEach(el => el.addEventListener('click', () => {
        show(Number(el.dataset.index));
        lb.classList.add('open');
    }));
    lb.querySelector('.lb-close').addEventListener('click', close);
    lb.querySelector('.lb-prev').addEventListener('click', () => show(current - 1));
    lb.querySelector('.lb-next').addEventListener('click', () => show(current + 1));
    lb.addEventListener('click', e => { if (e.target === lb) close(); });
    document.addEventListener('keydown', e => {
        if (!lb.classList.contains('open')) return;
        if (e.key === 'Escape') close();
        if (e.key === 'ArrowLeft') show(current - 1);
        if (e.key === 'ArrowRight') show(current + 1);
    });
}

/* ---------- Lecteur audio (accueil) ---------- */
function initPlayer() {
    const audio = document.getElementById('audio');
    if (!audio || typeof TRACKS === 'undefined' || !TRACKS.length) return;

    const playBtn = document.getElementById('playBtn');
    const list = document.getElementById('playlist');
    const title = document.getElementById('trackTitle');
    const fill = document.getElementById('progressFill');
    const progress = document.getElementById('progress');
    const tCur = document.getElementById('timeCurrent');
    const tTot = document.getElementById('timeTotal');
    const vol = document.getElementById('volume');
    let current = 0;

    const fmt = s => isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '0:00';

    list.innerHTML = TRACKS.map((t, i) => `
        <li><button type="button" data-i="${i}">
            <span class="track-num">${i + 1}</span>
            <span class="track-name">${t.titre}</span>
            <i class="fas fa-volume-high track-eq"></i>
        </button></li>`).join('');
    const items = [...list.querySelectorAll('button')];

    const load = (i, play) => {
        current = (i + TRACKS.length) % TRACKS.length;
        audio.src = TRACKS[current].src;
        title.textContent = TRACKS[current].titre;
        fill.style.width = '0%';
        tCur.textContent = '0:00';
        items.forEach((b, k) => b.classList.toggle('active', k === current));
        if (play) audio.play();
    };

    items.forEach(b => b.addEventListener('click', () => load(Number(b.dataset.i), true)));
    playBtn.addEventListener('click', () => (audio.paused ? audio.play() : audio.pause()));
    document.getElementById('prevTrack').addEventListener('click', () => load(current - 1, true));
    document.getElementById('nextTrack').addEventListener('click', () => load(current + 1, true));

    const setPlaying = on => {
        playBtn.innerHTML = `<i class="fas fa-${on ? 'pause' : 'play'}"></i>`;
        playBtn.setAttribute('aria-label', on ? 'Pause' : 'Lecture');
        document.getElementById('player').classList.toggle('playing', on);
    };
    audio.addEventListener('play', () => setPlaying(true));
    audio.addEventListener('pause', () => setPlaying(false));
    audio.addEventListener('ended', () => load(current + 1, true));
    audio.addEventListener('loadedmetadata', () => { tTot.textContent = fmt(audio.duration); });
    audio.addEventListener('timeupdate', () => {
        if (!audio.duration) return;
        fill.style.width = (audio.currentTime / audio.duration) * 100 + '%';
        tCur.textContent = fmt(audio.currentTime);
    });

    const seek = x => {
        const r = progress.getBoundingClientRect();
        if (audio.duration) audio.currentTime = Math.min(Math.max((x - r.left) / r.width, 0), 1) * audio.duration;
    };
    progress.addEventListener('click', e => seek(e.clientX));
    progress.addEventListener('keydown', e => {
        if (e.key === 'ArrowRight') audio.currentTime += 5;
        if (e.key === 'ArrowLeft') audio.currentTime -= 5;
    });

    audio.volume = Number(vol.value);
    vol.addEventListener('input', () => { audio.volume = Number(vol.value); });

    load(0, false);
}

/* ---------- Formulaires (Web3Forms : les messages arrivent par mail) ---------- */
function initWebForm(form, statusEl, { subject, ok }) {
    const btn = form.querySelector('button[type="submit"]');
    const setStatus = (type, text) => {
        statusEl.className = 'form-status ' + type;
        statusEl.textContent = text;
    };

    form.addEventListener('submit', async e => {
        e.preventDefault();
        if (!form.reportValidity()) return;

        if (typeof WEB3FORMS_KEY === 'undefined' || !WEB3FORMS_KEY) {
            setStatus('err', "Le formulaire n'est pas encore activé. Écrivez-nous directement par mail en attendant.");
            return;
        }

        const data = new FormData(form);
        data.append('access_key', WEB3FORMS_KEY);
        data.append('subject', subject(data));
        data.append('from_name', 'Site Des Lyres en Brie');

        btn.disabled = true;
        const label = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Envoi…';

        try {
            const res = await fetch('https://api.web3forms.com/submit', { method: 'POST', body: data });
            const json = await res.json();
            if (json.success) {
                form.reset();
                setStatus('ok', ok);
            } else {
                setStatus('err', "L'envoi a échoué. Réessayez ou écrivez-nous par mail.");
            }
        } catch {
            setStatus('err', "Impossible d'envoyer le message (connexion ?). Réessayez dans un instant.");
        } finally {
            btn.disabled = false;
            btn.innerHTML = label;
        }
    });
}

function initContactForm() {
    const form = document.getElementById('contactForm');
    if (!form) return;

    // contact.html?sujet=rejoindre|prestation présélectionne le sujet
    const preset = { rejoindre: "Rejoindre l'association", prestation: 'Demande de prestation' }[
        new URLSearchParams(location.search).get('sujet')];
    if (preset) form.querySelector('#sujet').value = preset;

    initWebForm(form, document.getElementById('formStatus'), {
        subject: d => `Contact — ${d.get('sujet')} — ${d.get('prenom')} ${d.get('nom')}`,
        ok: 'Merci ! Votre message a bien été envoyé, nous vous répondons vite.',
    });
}

/* ---------- Livre d'or ---------- */
const escapeHTML = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function initGuestbook() {
    const list = document.getElementById('guestbook');
    if (list && typeof GUESTBOOK !== 'undefined') {
        const msgs = [...GUESTBOOK].sort((a, b) => parseDate(b.date) - parseDate(a.date));
        document.getElementById('guestCount').textContent =
            msgs.length ? `${msgs.length} message${msgs.length > 1 ? 's' : ''}` : 'Vos messages';
        list.innerHTML = msgs.length
            ? msgs.map(m => {
                const d = parseDate(m.date);
                return `
                <article class="guest-message reveal visible">
                    <div class="guest-header">
                        <strong>${escapeHTML(m.nom)}</strong>
                        <span class="guest-date">${d.getDate()} ${MOIS_LONGS[d.getMonth()]} ${d.getFullYear()}</span>
                    </div>
                    <p>${escapeHTML(m.message).replace(/\n/g, '<br>')}</p>
                </article>`;
            }).join('')
            : `<div class="events-empty"><i class="fas fa-feather-pointed"></i>Aucun message pour l'instant : soyez le premier à écrire dans notre livre d'or !</div>`;
    }

    const form = document.getElementById('guestForm');
    if (form) {
        initWebForm(form, document.getElementById('guestStatus'), {
            subject: d => `Livre d'or — message de ${d.get('nom')}`,
            ok: "Merci pour votre message ! Il apparaîtra dans le livre d'or après relecture.",
        });
    }
}
