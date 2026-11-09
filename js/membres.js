/* =========================================================
   Espace membres : déchiffre le contenu avec le mot de passe.
   Le contenu (js/membres-data.js) est chiffré : sans le bon mot
   de passe, il est illisible, même dans le code source de la page.
   ========================================================= */

(() => {
    const STORE = 'dlb_membres_cle';
    const loginSection = document.getElementById('loginSection');
    const membersSection = document.getElementById('membersSection');
    const content = document.getElementById('membersContent');
    const form = document.getElementById('loginForm');
    const input = document.getElementById('passwordInput');
    const error = document.getElementById('loginError');
    const btn = form.querySelector('button[type="submit"]');

    const fromB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
    const toB64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));

    async function deriveKey(password) {
        const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
        return crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt: fromB64(MEMBRES_DATA.salt), iterations: MEMBRES_DATA.iterations, hash: 'SHA-256' },
            base, { name: 'AES-GCM', length: 256 }, true, ['decrypt']);
    }

    async function decrypt(key) {
        const plain = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: fromB64(MEMBRES_DATA.iv) }, key, fromB64(MEMBRES_DATA.data));
        return new TextDecoder().decode(plain);
    }

    function show(html) {
        content.innerHTML = html;
        loginSection.hidden = true;
        membersSection.hidden = false;

        // Onglets
        const tabs = content.querySelectorAll('.members-tab');
        tabs.forEach(tab => tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.toggle('active', t === tab));
            content.querySelectorAll('.members-panel').forEach(p =>
                p.classList.toggle('active', p.id === 'tab-' + tab.dataset.tab));
        }));

        // Lignes du planning déjà passées
        const today = new Date().toISOString().slice(0, 10);
        content.querySelectorAll('tr[data-date]').forEach(tr => {
            if (tr.dataset.date < today) tr.classList.add('past');
        });
    }

    // Déjà connecté pendant cette session : la clé est gardée jusqu'à la fermeture de l'onglet
    (async () => {
        let saved = null;
        try { saved = sessionStorage.getItem(STORE); } catch { /* stockage indisponible */ }
        if (!saved) return;
        try {
            const key = await crypto.subtle.importKey('raw', fromB64(saved), 'AES-GCM', false, ['decrypt']);
            show(await decrypt(key));
        } catch {
            try { sessionStorage.removeItem(STORE); } catch { /* rien */ }
        }
    })();

    form.addEventListener('submit', async e => {
        e.preventDefault();
        error.hidden = true;
        btn.disabled = true;
        try {
            const key = await deriveKey(input.value);
            const html = await decrypt(key);  // échoue si le mot de passe est faux
            try { sessionStorage.setItem(STORE, toB64(await crypto.subtle.exportKey('raw', key))); } catch { /* rien */ }
            show(html);
        } catch {
            error.hidden = false;
            input.value = '';
            input.focus();
        } finally {
            btn.disabled = false;
        }
    });

    document.getElementById('logoutBtn').addEventListener('click', () => {
        try { sessionStorage.removeItem(STORE); } catch { /* rien */ }
        location.reload();
    });
})();
