/* =========================================================
   Des Lyres en Brie — scripts communs
   ========================================================= */

document.addEventListener('DOMContentLoaded', () => {
    initHeader();
    initReveal();
    renderEvents();
    renderGallery();
    initContactForm();
    document.querySelectorAll('.year').forEach(el => { el.textContent = new Date().getFullYear(); });
});

/* ---------- En-tête : fond au défilement + menu mobile ---------- */
function initHeader() {
    const header = document.getElementById('header');
    const burger = document.getElementById('hamburger');
    const nav = document.getElementById('mainNav');

    const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    burger.addEventListener('click', () => {
        const open = nav.classList.toggle('open');
        burger.classList.toggle('open', open);
        burger.setAttribute('aria-expanded', open);
    });
    nav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
        nav.classList.remove('open');
        burger.classList.remove('open');
    }));
}

/* ---------- Apparition des blocs ---------- */
function initReveal() {
    const items = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window)) {
        items.forEach(el => el.classList.add('visible'));
        return;
    }
    const io = new IntersectionObserver(entries => {
        entries.forEach(e => {
            if (e.isIntersecting) {
                e.target.classList.add('visible');
                io.unobserve(e.target);
            }
        });
    }, { threshold: 0.12 });
    items.forEach(el => io.observe(el));
}

/* ---------- Agenda ---------- */
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

function parseDate(str) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
}

function eventHTML(ev, past) {
    const d = parseDate(ev.date);
    const lieu = [ev.lieu, ev.ville].filter(Boolean).join(', ');
    const titre = ev.lien
        ? `<a href="${ev.lien}" target="_blank" rel="noopener">${ev.titre} <i class="fas fa-arrow-up-right-from-square" style="font-size:.7em"></i></a>`
        : ev.titre;
    return `
        <article class="event${past ? ' past' : ''}">
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
            ${ev.type ? `<span class="event-tag">${ev.type}</span>` : ''}
        </article>`;
}

function emptyHTML(text) {
    return `<div class="events-empty"><i class="far fa-calendar"></i>${text}</div>`;
}

function renderEvents() {
    if (typeof EVENTS === 'undefined') return;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const sorted = [...EVENTS].sort((a, b) => parseDate(a.date) - parseDate(b.date));
    const upcoming = sorted.filter(ev => parseDate(ev.date) >= today);
    const past = sorted.filter(ev => parseDate(ev.date) < today).reverse();

    // Accueil : les 3 prochaines dates
    const home = document.getElementById('nextEvents');
    if (home) {
        home.innerHTML = upcoming.length
            ? upcoming.slice(0, 3).map(ev => eventHTML(ev, false)).join('')
            : emptyHTML('Les prochaines dates arrivent très bientôt.');
    }

    // Page agenda : à venir + déjà joué
    const up = document.getElementById('upcomingEvents');
    if (up) {
        up.innerHTML = upcoming.length
            ? upcoming.map(ev => eventHTML(ev, false)).join('')
            : emptyHTML('Aucune date annoncée pour le moment. Suivez-nous sur Facebook pour être prévenus.');
    }
    const pastBox = document.getElementById('pastEvents');
    if (pastBox) {
        const block = document.getElementById('pastBlock');
        if (past.length) pastBox.innerHTML = past.map(ev => eventHTML(ev, true)).join('');
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

/* ---------- Formulaire de contact (Web3Forms) ---------- */
function initContactForm() {
    const form = document.getElementById('contactForm');
    if (!form) return;
    const status = document.getElementById('formStatus');
    const btn = form.querySelector('button[type="submit"]');

    // contact.html?sujet=rejoindre|prestation présélectionne le sujet
    const preset = { rejoindre: "Rejoindre l'association", prestation: 'Demande de prestation' }[
        new URLSearchParams(location.search).get('sujet')];
    if (preset) form.querySelector('#sujet').value = preset;

    const setStatus = (type, text) => {
        status.className = 'form-status ' + type;
        status.textContent = text;
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
        data.append('subject', 'Nouveau message — ' + (data.get('sujet') || 'site Des Lyres en Brie'));
        data.append('from_name', 'Site Des Lyres en Brie');

        btn.disabled = true;
        const label = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Envoi…';

        try {
            const res = await fetch('https://api.web3forms.com/submit', { method: 'POST', body: data });
            const json = await res.json();
            if (json.success) {
                form.reset();
                setStatus('ok', 'Merci ! Votre message a bien été envoyé, nous vous répondons vite.');
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
