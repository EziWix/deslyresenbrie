/* =========================================================
   Partitions de l'espace membres.

   Les PDF sont stockés dans un dépôt GitHub privé, un dossier par
   formation (harmonie/, marching/, fanfare/). Dans chaque formation,
   un sous-dossier = un morceau (ex. harmonie/Bolero/Clarinette 1.pdf).
   - Membres  : lecture, avec la clé de lecture contenue dans le
                contenu chiffré de l'espace membres.
   - Éditeurs : dépôt (PDF, dossiers, ZIP) et suppression, avec la clé
                d'écriture chiffrée dans js/editeur-data.js.
   ========================================================= */

window.DLBPartitions = (() => {
    const API = 'https://api.github.com';
    const JSZIP = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
    const STORE_ED = 'dlb_editeur_cle';
    const MAX_MO = 25;
    let read = null;      // { depot, jeton } lecture
    let write = null;     // { depot, jeton } écriture (éditeur déverrouillé)
    let root = null;

    /* ---------- outils ---------- */
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const fromB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
    const toB64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
    const encPath = p => p.split('/').map(encodeURIComponent).join('/');
    const sizeLabel = n => n > 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' Mo' : Math.max(1, Math.round(n / 1024)) + ' Ko';
    const titleOf = name => name.replace(/\.pdf$/i, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
    const safeName = name => name.replace(/[\\/:*?"<>|#%]+/g, '-').replace(/\s+/g, ' ').trim();
    const isPdf = f => /\.pdf$/i.test(f.name) || f.type === 'application/pdf';
    const isZip = f => /\.zip$/i.test(f.name) || /zip/.test(f.type);
    const byName = (a, b) => a.name.localeCompare(b.name, 'fr', { numeric: true });
    const plural = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;

    async function gh(path, { method = 'GET', body, raw = false, cred = read } = {}) {
        const res = await fetch(`${API}/repos/${cred.depot}/contents/${encPath(path)}`, {
            method,
            cache: 'no-store',
            headers: {
                Authorization: `Bearer ${cred.jeton}`,
                Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
                ...(body ? { 'Content-Type': 'application/json' } : {}),
            },
            body: body ? JSON.stringify(body) : undefined,
        });
        if (res.status === 404 && method === 'GET') return null;
        if (!res.ok) throw new Error(`GitHub ${res.status}`);
        return raw ? res.blob() : res.json();
    }

    function blobToB64(blob) {
        return new Promise((ok, ko) => {
            const r = new FileReader();
            r.onload = () => ok(String(r.result).split(',')[1]);
            r.onerror = ko;
            r.readAsDataURL(blob);
        });
    }

    function loadJSZip() {
        if (window.JSZip) return Promise.resolve(window.JSZip);
        return new Promise((ok, ko) => {
            const s = document.createElement('script');
            s.src = JSZIP;
            s.onload = () => ok(window.JSZip);
            s.onerror = () => ko(new Error('JSZip indisponible'));
            document.head.appendChild(s);
        });
    }

    /* ---------- ordre des morceaux : <formation>/_ordre.json (liste de noms de dossiers) ---------- */
    const ORDER_FILE = '_ordre.json';
    const utf8ToB64 = s => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
    const b64ToUtf8 = b => new TextDecoder().decode(Uint8Array.from(atob(b.replace(/\s/g, '')), c => c.charCodeAt(0)));

    async function readOrder(f) {
        try {
            const meta = await gh(`${f}/${ORDER_FILE}`);
            if (!meta || !meta.content) return { names: [], sha: null };
            const names = JSON.parse(b64ToUtf8(meta.content));
            return { names: Array.isArray(names) ? names : [], sha: meta.sha };
        } catch {
            return { names: [], sha: null };
        }
    }

    // Morceaux rangés selon l'ordre enregistré ; ceux qui n'y sont pas encore vont à la fin, par nom
    function applyOrder(dirs, names) {
        const rank = new Map(names.map((n, i) => [n, i]));
        return dirs.sort((a, b) => {
            const ra = rank.has(a.name) ? rank.get(a.name) : Infinity, rb = rank.has(b.name) ? rank.get(b.name) : Infinity;
            return ra !== rb ? ra - rb : byName(a, b);
        });
    }

    function saveOrderSoon(box) {
        clearTimeout(box._saveTimer);
        box._saveTimer = setTimeout(() => saveOrder(box), 700);
    }

    async function saveOrder(box) {
        const f = box.dataset.formation;
        const names = box._tree.dirs.map(d => d.name);
        status(box, 'ok', "Enregistrement de l'ordre…");
        try {
            const body = { message: `Ordre des morceaux : ${f}`, content: utf8ToB64(JSON.stringify(names, null, 1)) };
            if (box._orderSha) body.sha = box._orderSha;
            const res = await gh(`${f}/${ORDER_FILE}`, { method: 'PUT', body, cred: write });
            box._orderSha = res.content.sha;
            status(box, 'ok', 'Ordre enregistré : tous les membres voient les morceaux dans cet ordre.');
        } catch (e) {
            console.warn('Ordre', f, e);
            status(box, 'err', "L'ordre n'a pas pu être enregistré. Rechargez la page et réessayez.");
        }
    }

    function moveDir(box, from, to) {
        const dirs = box._tree.dirs;
        if (to < 0 || to >= dirs.length || from === to) return;
        dirs.splice(to, 0, dirs.splice(from, 1)[0]);
        render(box);
        saveOrderSoon(box);
    }

    /* ---------- lecture : formation -> morceaux (dossiers) + PDF seuls ---------- */
    async function load(box) {
        const f = box.dataset.formation;
        const list = box.querySelector('.part-list');
        list.innerHTML = '<p class="members-empty"><i class="fas fa-spinner fa-spin"></i> Chargement des partitions…</p>';
        try {
            const [top, order] = await Promise.all([gh(f).then(r => r || []), readOrder(f)]);
            const files = top.filter(it => it.type === 'file' && /\.pdf$/i.test(it.name)).sort(byName);
            const dirs = await Promise.all(top.filter(it => it.type === 'dir').map(async d => ({
                name: d.name,
                path: d.path,
                files: ((await gh(d.path)) || []).filter(it => it.type === 'file' && /\.pdf$/i.test(it.name)).sort(byName),
            })));
            box._orderSha = order.sha;
            box._tree = { dirs: applyOrder(dirs.filter(d => d.files.length), order.names), files };
            render(box);
        } catch (e) {
            list.innerHTML = '<p class="members-empty"><i class="fas fa-triangle-exclamation"></i> Impossible de charger les partitions pour le moment.</p>';
            console.warn('Partitions', f, e);
        }
    }

    function allFiles(box) {
        const t = box._tree || { dirs: [], files: [] };
        return t.files.concat(...t.dirs.map(d => d.files));
    }

    function fileHTML(it) {
        return `
            <div class="part-item" data-path="${esc(it.path)}" data-sha="${esc(it.sha)}" data-name="${esc(it.name)}">
                <i class="fas fa-file-pdf part-icon"></i>
                <div class="part-meta"><strong>${esc(titleOf(it.name))}</strong><small>${sizeLabel(it.size)}</small></div>
                <div class="part-actions">
                    <button type="button" data-act="open" title="Ouvrir"><i class="fas fa-eye"></i><span> Ouvrir</span></button>
                    <button type="button" data-act="dl" title="Télécharger"><i class="fas fa-download"></i></button>
                    ${write ? '<button type="button" data-act="del" class="part-del" title="Supprimer"><i class="fas fa-trash"></i></button>' : ''}
                </div>
            </div>`;
    }

    function render(box) {
        const list = box.querySelector('.part-list');
        const t = box._tree || { dirs: [], files: [] };
        const q = (box.querySelector('.part-search')?.value || '').trim().toLowerCase();
        const match = s => titleOf(s).toLowerCase().includes(q);
        const total = allFiles(box).length;
        box.querySelector('.part-count').textContent =
            (t.dirs.length ? plural(t.dirs.length, 'morceau').replace('morceaus', 'morceaux') + ' · ' : '') + plural(total, 'partition');

        // un morceau s'affiche si son nom correspond (tous ses PDF) ou si l'un de ses PDF correspond
        const dirs = t.dirs.map(d => ({ ...d, shown: !q || match(d.name) ? d.files : d.files.filter(x => match(x.name)) }))
            .filter(d => d.shown.length);
        const files = t.files.filter(x => !q || match(x.name));
        if (!dirs.length && !files.length) {
            list.innerHTML = `<p class="members-empty"><i class="fas fa-music"></i> ${q ? 'Aucune partition ne correspond.' : 'Aucune partition pour le moment.'}</p>`;
            return;
        }
        const openSet = box._open || new Set();
        const sortable = !!write && !q && dirs.length > 1;  // réordonner : éditeur, sans recherche en cours
        list.innerHTML = dirs.map((d, i) => `
            <details class="part-folder${sortable ? ' sortable' : ''}" data-dir="${esc(d.path)}"${sortable ? ' draggable="true"' : ''}${q || openSet.has(d.path) ? ' open' : ''}>
                <summary>
                    ${sortable ? '<span class="part-grip" title="Glisser pour déplacer"><i class="fas fa-grip-vertical"></i></span>' : ''}
                    <i class="fas fa-folder part-icon"></i><i class="fas fa-folder-open part-icon"></i>
                    <span class="part-meta"><strong>${esc(d.name)}</strong><small>${plural(d.files.length, 'partition')}</small></span>
                    ${sortable ? `<span class="part-move">
                        <button type="button" data-act="up" title="Monter"${i === 0 ? ' disabled' : ''}><i class="fas fa-arrow-up"></i></button>
                        <button type="button" data-act="down" title="Descendre"${i === dirs.length - 1 ? ' disabled' : ''}><i class="fas fa-arrow-down"></i></button>
                    </span>` : ''}
                    ${write ? `<button type="button" data-act="deldir" class="part-del part-deldir" title="Supprimer tout le morceau"><i class="fas fa-trash"></i></button>` : ''}
                    <i class="fas fa-chevron-down part-chevron"></i>
                </summary>
                <div class="part-folder-files">${d.shown.map(fileHTML).join('')}</div>
            </details>`).join('') + files.map(fileHTML).join('');
        list.querySelectorAll('.part-folder').forEach(det => det.addEventListener('toggle', () => {
            box._open = box._open || new Set();
            det.open ? box._open.add(det.dataset.dir) : box._open.delete(det.dataset.dir);
        }));
        if (sortable) enableDrag(box, list);
    }

    // Glisser-déposer des morceaux dans la liste (éditeurs)
    function enableDrag(box, list) {
        let dragged = null;
        list.querySelectorAll('.part-folder.sortable').forEach(det => {
            det.addEventListener('dragstart', e => {
                dragged = det;
                det.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', det.dataset.dir);
            });
            det.addEventListener('dragend', () => {
                det.classList.remove('dragging');
                if (!dragged) return;
                dragged = null;
                // nouvel ordre = ordre des dossiers à l'écran
                const paths = [...list.querySelectorAll('.part-folder')].map(x => x.dataset.dir);
                const before = box._tree.dirs.map(d => d.path).join('|');
                box._tree.dirs.sort((a, b) => paths.indexOf(a.path) - paths.indexOf(b.path));
                if (box._tree.dirs.map(d => d.path).join('|') !== before) { render(box); saveOrderSoon(box); }
            });
            det.addEventListener('dragover', e => {
                if (!dragged || dragged === det) return;
                e.preventDefault();
                const r = det.getBoundingClientRect();
                det.parentNode.insertBefore(dragged, e.clientY < r.top + r.height / 2 ? det : det.nextSibling);
            });
            det.addEventListener('drop', e => { if (dragged) e.preventDefault(); });
        });
    }

    function armConfirm(btn) {  // confirmation en deux clics, sans fenêtre bloquante
        if (btn.dataset.confirm === '1') return true;
        btn.dataset.confirm = '1';
        const old = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-trash"></i> Confirmer ?';
        setTimeout(() => { if (btn.isConnected) { btn.dataset.confirm = ''; btn.innerHTML = old; } }, 4000);
        return false;
    }

    async function onAction(box, btn) {
        const act = btn.dataset.act;

        if (act === 'up' || act === 'down') {
            const path = btn.closest('.part-folder').dataset.dir;
            const i = box._tree.dirs.findIndex(d => d.path === path);
            moveDir(box, i, act === 'up' ? i - 1 : i + 1);
            return;
        }

        if (act === 'deldir') {
            if (!armConfirm(btn)) return;
            const det = btn.closest('.part-folder');
            const dir = (box._tree.dirs || []).find(d => d.path === det.dataset.dir);
            btn.disabled = true;
            let fails = 0;
            for (const it of dir.files) {
                status(box, 'ok', `Suppression de « ${dir.name} »…`);
                try { await gh(it.path, { method: 'DELETE', body: { message: `Suppression : ${it.path}`, sha: it.sha }, cred: write }); }
                catch { fails++; }
            }
            status(box, fails ? 'err' : 'ok', fails ? `${fails} fichier(s) n'ont pas pu être supprimés.` : `Morceau « ${dir.name} » supprimé.`);
            load(box);
            return;
        }

        const item = btn.closest('.part-item');
        const { path, sha, name } = item.dataset;

        if (act === 'del') {
            if (!armConfirm(btn)) return;
            btn.disabled = true;
            try {
                await gh(path, { method: 'DELETE', body: { message: `Suppression : ${path}`, sha }, cred: write });
                status(box, 'ok', `« ${titleOf(name)} » supprimée.`);
                load(box);
            } catch {
                status(box, 'err', 'La suppression a échoué. Réessayez.');
                btn.disabled = false;
            }
            return;
        }

        // Ouvrir / télécharger : le fichier est récupéré avec la clé, puis affiché localement
        const win = act === 'open' ? window.open('', '_blank') : null;
        if (win) win.document.write('<p style="font:16px sans-serif;padding:24px">Ouverture de la partition…</p>');
        btn.disabled = true;
        try {
            const blob = await gh(path, { raw: true });
            const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
            if (win) win.location.href = url;
            else {
                const a = document.createElement('a');
                a.href = url; a.download = name;
                document.body.appendChild(a); a.click(); a.remove();
            }
            setTimeout(() => URL.revokeObjectURL(url), 60000);
        } catch {
            if (win) win.close();
            status(box, 'err', "Impossible d'ouvrir la partition.");
        } finally {
            btn.disabled = false;
        }
    }

    /* ---------- dépôt (éditeurs) ---------- */
    function status(box, type, text) {
        const el = box.querySelector('.part-status');
        el.className = 'part-status form-status ' + type;
        el.textContent = text;
    }

    // Glisser-déposer : les entrées doivent être lues tout de suite (le DataTransfer expire après)
    function entriesOf(dt) {
        const items = [...(dt.items || [])];
        const entries = items.map(i => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
        return entries.length ? entries : null;
    }

    // Parcourt fichiers et dossiers déposés -> [{ file, dir }] (dir = dossier de premier niveau)
    async function collectEntries(entries) {
        const out = [];
        const walk = async (entry, top) => {
            if (entry.isFile) {
                out.push({ file: await new Promise((ok, ko) => entry.file(ok, ko)), dir: top });
            } else if (entry.isDirectory) {
                const reader = entry.createReader();
                let batch;
                do {
                    batch = await new Promise((ok, ko) => reader.readEntries(ok, ko));
                    for (const e of batch) await walk(e, top || entry.name);
                } while (batch.length);
            }
        };
        for (const e of entries) await walk(e, '');
        return out;
    }

    // ZIP -> PDF qu'il contient, rangés dans un dossier au nom du ZIP
    async function expandZips(list) {
        const out = [];
        for (const it of list) {
            if (!isZip(it.file)) { out.push(it); continue; }
            const JSZip = await loadJSZip();
            const zip = await JSZip.loadAsync(it.file);
            const dir = it.dir || it.file.name.replace(/\.zip$/i, '');
            const pdfs = Object.values(zip.files).filter(z => !z.dir && /\.pdf$/i.test(z.name) && !/(^|\/)__MACOSX\//.test(z.name));
            for (const z of pdfs) {
                const blob = await z.async('blob');
                out.push({ file: new File([blob], z.name.split('/').pop(), { type: 'application/pdf' }), dir });
            }
        }
        return out;
    }

    async function upload(box, rawList) {
        const f = box.dataset.formation;
        let list;
        try {
            status(box, 'ok', 'Préparation des fichiers…');
            list = await expandZips(rawList);
        } catch (e) {
            status(box, 'err', "Impossible d'ouvrir le fichier ZIP.");
            return;
        }
        const pdfs = list.filter(x => isPdf(x.file));
        const refused = list.length - pdfs.length;
        if (!pdfs.length) { status(box, 'err', 'Aucun PDF trouvé (les PDF, dossiers de PDF et ZIP sont acceptés).'); return; }

        const existing = Object.fromEntries(allFiles(box).map(it => [it.path, it.sha]));
        let done = 0, failed = 0;
        for (const { file, dir } of pdfs) {
            if (file.size > MAX_MO * 1048576) { failed++; continue; }
            let name = safeName(file.name);
            if (!/\.pdf$/i.test(name)) name += '.pdf';
            const path = dir ? `${f}/${safeName(dir)}/${name}` : `${f}/${name}`;
            status(box, 'ok', `Envoi ${done + failed + 1}/${pdfs.length} : ${dir ? safeName(dir) + ' › ' : ''}${titleOf(name)}…`);
            try {
                const body = { message: `${existing[path] ? 'Mise à jour' : 'Ajout'} : ${path}`, content: await blobToB64(file) };
                if (existing[path]) body.sha = existing[path];
                await gh(path, { method: 'PUT', body, cred: write });
                done++;
            } catch (e) {
                console.warn('Envoi', path, e);
                failed++;
            }
        }
        const parts = [`${plural(done, 'partition')} en ligne`];
        if (failed) parts.push(`${failed} échec${failed > 1 ? 's' : ''} (fichier de plus de ${MAX_MO} Mo ou erreur)`);
        if (refused) parts.push(`${refused} fichier${refused > 1 ? 's' : ''} ignoré${refused > 1 ? 's' : ''} (pas un PDF)`);
        status(box, failed ? 'err' : 'ok', parts.join(' · ') + '.');
        load(box);
    }

    function dropzoneHTML() {
        return `
            <div class="part-drop" tabindex="0" role="button" aria-label="Déposer des partitions">
                <i class="fas fa-cloud-arrow-up"></i>
                <strong>Glissez ici des PDF, un dossier ou un ZIP</strong>
                <span>Un dossier ou un ZIP devient un morceau (ex. « Bolero » avec un PDF par pupitre) · ${MAX_MO} Mo max par PDF</span>
                <span class="part-pick">
                    <button type="button" class="btn btn-outline" data-pick="files"><i class="fas fa-file-pdf"></i> Choisir des fichiers</button>
                    <button type="button" class="btn btn-outline" data-pick="dir"><i class="fas fa-folder-open"></i> Choisir un dossier</button>
                </span>
                <input type="file" class="pick-files" accept="application/pdf,.pdf,application/zip,.zip" multiple hidden>
                <input type="file" class="pick-dir" webkitdirectory multiple hidden>
            </div>`;
    }

    function enableEditing() {
        root.querySelectorAll('.partitions').forEach(box => {
            if (box.querySelector('.part-drop')) return;
            box.querySelector('.part-tools').insertAdjacentHTML('afterend', dropzoneHTML());
            const zone = box.querySelector('.part-drop');
            const inFiles = zone.querySelector('.pick-files'), inDir = zone.querySelector('.pick-dir');
            zone.addEventListener('click', e => {
                const pick = e.target.closest('[data-pick]');
                if (pick) { e.stopPropagation(); (pick.dataset.pick === 'dir' ? inDir : inFiles).click(); return; }
                if (e.target === zone || !e.target.closest('button')) inFiles.click();
            });
            zone.addEventListener('keydown', e => { if (e.target === zone && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); inFiles.click(); } });
            inFiles.addEventListener('change', () => {
                if (inFiles.files.length) upload(box, [...inFiles.files].map(file => ({ file, dir: '' })));
                inFiles.value = '';
            });
            inDir.addEventListener('change', () => {
                if (inDir.files.length) upload(box, [...inDir.files].map(file => ({ file, dir: (file.webkitRelativePath || '').split('/')[0] || '' })));
                inDir.value = '';
            });
            ['dragenter', 'dragover'].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.add('over'); }));
            ['dragleave', 'drop'].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.remove('over'); }));
            zone.addEventListener('drop', async e => {
                const entries = entriesOf(e.dataTransfer);
                const plain = [...e.dataTransfer.files];
                const list = entries ? await collectEntries(entries) : plain.map(file => ({ file, dir: '' }));
                if (list.length) upload(box, list);
            });
            render(box);
        });
        const bar = root.querySelector('.editor-bar');
        bar.innerHTML = `<span><i class="fas fa-pen-to-square"></i> <strong>Mode éditeur activé</strong> : vous pouvez déposer et supprimer des partitions.</span>
            <button type="button" class="btn btn-outline editor-off"><i class="fas fa-lock"></i> Quitter</button>`;
        bar.classList.add('on');
        bar.querySelector('.editor-off').addEventListener('click', () => {
            try { sessionStorage.removeItem(STORE_ED); } catch { /* rien */ }
            location.reload();
        });
    }

    /* ---------- déverrouillage éditeur ---------- */
    async function decryptEditor(key) {
        const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(EDITEUR_DATA.iv) }, key, fromB64(EDITEUR_DATA.data));
        return JSON.parse(new TextDecoder().decode(plain));
    }
    async function deriveKey(password) {
        const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
        return crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt: fromB64(EDITEUR_DATA.salt), iterations: EDITEUR_DATA.iterations, hash: 'SHA-256' },
            base, { name: 'AES-GCM', length: 256 }, true, ['decrypt']);
    }

    function editorBar() {
        const bar = document.createElement('div');
        bar.className = 'editor-bar';
        bar.innerHTML = `
            <span><i class="fas fa-pen-to-square"></i> Chef d'orchestre ou responsable ? Déverrouillez le dépôt de partitions.</span>
            <form class="editor-form">
                <input type="password" placeholder="Mot de passe éditeur" aria-label="Mot de passe éditeur" autocomplete="current-password" required>
                <button type="submit" class="btn btn-dark"><i class="fas fa-unlock"></i> Déverrouiller</button>
            </form>
            <p class="editor-error" hidden><i class="fas fa-circle-exclamation"></i> Mot de passe éditeur incorrect</p>`;
        const form = bar.querySelector('form'), input = form.querySelector('input'), err = bar.querySelector('.editor-error');
        form.addEventListener('submit', async e => {
            e.preventDefault();
            err.hidden = true;
            try {
                const key = await deriveKey(input.value);
                write = await decryptEditor(key);
                try { sessionStorage.setItem(STORE_ED, toB64(await crypto.subtle.exportKey('raw', key))); } catch { /* rien */ }
                enableEditing();
            } catch {
                err.hidden = false;
                input.value = '';
                input.focus();
            }
        });
        return bar;
    }

    /* ---------- démarrage (appelé après déchiffrement de l'espace membres) ---------- */
    async function init(container) {
        root = container;
        const boxes = root.querySelectorAll('.partitions');
        if (!boxes.length) return;
        try { read = JSON.parse(root.querySelector('#partitionsConfig')?.textContent || 'null'); } catch { read = null; }

        boxes.forEach(box => {
            box.innerHTML = `
                <div class="part-tools">
                    <label class="part-searchwrap"><i class="fas fa-magnifying-glass"></i>
                        <input type="search" class="part-search" placeholder="Rechercher un morceau ou un pupitre…" aria-label="Rechercher un morceau ou un pupitre"></label>
                    <span class="part-count"></span>
                </div>
                <div class="part-status form-status" role="status"></div>
                <div class="part-list"></div>`;
            box.querySelector('.part-search').addEventListener('input', () => render(box));
            box.querySelector('.part-list').addEventListener('click', e => {
                const btn = e.target.closest('button[data-act]');
                if (!btn) return;
                if (['deldir', 'up', 'down'].includes(btn.dataset.act)) e.preventDefault();  // ne pas replier le dossier
                onAction(box, btn);
            });
        });

        if (!read || !read.jeton || read.jeton.includes('{{')) {
            boxes.forEach(box => { box.querySelector('.part-list').innerHTML = '<p class="members-empty"><i class="fas fa-hourglass-half"></i> Le dépôt de partitions sera bientôt ouvert.</p>'; });
            return;
        }
        boxes.forEach(load);

        // Barre éditeur, au-dessus des onglets
        if (typeof EDITEUR_DATA !== 'undefined') {
            root.querySelector('.members-tabs')?.before(editorBar());
            let saved = null;
            try { saved = sessionStorage.getItem(STORE_ED); } catch { /* rien */ }
            if (saved) {
                try {
                    const key = await crypto.subtle.importKey('raw', fromB64(saved), 'AES-GCM', false, ['decrypt']);
                    write = await decryptEditor(key);
                    enableEditing();
                } catch { try { sessionStorage.removeItem(STORE_ED); } catch { /* rien */ } }
            }
        }
    }

    return { init };
})();
