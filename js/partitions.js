/* =========================================================
   Partitions de l'espace membres.

   Les PDF sont stockés dans un dépôt GitHub privé, un dossier par
   formation (harmonie/, marching/, fanfare/). Dans chaque formation,
   un dossier = un morceau, qui peut lui-même contenir des sous-dossiers
   (ex. fanfare/La Marseillaise/Chorale/Voix 2.pdf).
   - Membres  : lecture, avec la clé de lecture contenue dans le
                contenu chiffré de l'espace membres.
   - Éditeurs : dépôt (PDF, dossiers, ZIP), classement des morceaux et
                suppression, avec la clé d'écriture chiffrée dans
                js/editeur-data.js.
   ========================================================= */

window.DLBPartitions = (() => {
    const API = 'https://api.github.com';
    const JSZIP = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
    const STORE_ED = 'dlb_editeur_cle';
    const ORDER_FILE = '_ordre.json';
    const MAX_MO = 25;
    let read = null;      // { depot, jeton } lecture
    let write = null;     // { depot, jeton } écriture (éditeur déverrouillé)
    let root = null;

    /* ---------- outils ---------- */
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const fromB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
    const toB64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
    const utf8ToB64 = s => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
    const b64ToUtf8 = b => new TextDecoder().decode(Uint8Array.from(atob(b.replace(/\s/g, '')), c => c.charCodeAt(0)));
    const encPath = p => p.split('/').map(encodeURIComponent).join('/');
    const sizeLabel = n => n > 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' Mo' : Math.max(1, Math.round(n / 1024)) + ' Ko';
    const titleOf = name => name.replace(/\.pdf$/i, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
    const safeName = name => name.replace(/[\\/:*?"<>|#%]+/g, '-').replace(/\s+/g, ' ').trim();
    const safeDir = dir => dir.split('/').map(safeName).filter(Boolean).join('/');
    const isPdf = f => /\.pdf$/i.test(f.name) || f.type === 'application/pdf';
    const isZip = f => /\.zip$/i.test(f.name) || /zip/.test(f.type);
    const byName = (a, b) => a.name.localeCompare(b.name, 'fr', { numeric: true });
    const plural = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;

    function headers(cred, raw, body) {
        return {
            Authorization: `Bearer ${cred.jeton}`,
            Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            ...(body ? { 'Content-Type': 'application/json' } : {}),
        };
    }

    async function gh(path, { method = 'GET', body, raw = false, cred = read } = {}) {
        const res = await fetch(`${API}/repos/${cred.depot}/contents/${encPath(path)}`, {
            method, cache: 'no-store', headers: headers(cred, raw, body),
            body: body ? JSON.stringify(body) : undefined,
        });
        if (res.status === 404 && method === 'GET') return null;
        if (!res.ok) throw new Error(`GitHub ${res.status}`);
        return raw ? res.blob() : res.json();
    }

    // API « git » bas niveau (renommage = déplacer des fichiers sans les renvoyer)
    async function ghGit(path, { method = 'GET', body, cred = write } = {}) {
        const res = await fetch(`${API}/repos/${cred.depot}/git/${path}`, {
            method, cache: 'no-store', headers: headers(cred, false, body),
            body: body ? JSON.stringify(body) : undefined,
        });
        if (!res.ok) throw new Error(`GitHub ${res.status}`);
        return res.json();
    }

    let branchName = null;
    async function branch() {
        if (!branchName) {
            const res = await fetch(`${API}/repos/${write.depot}`, { cache: 'no-store', headers: headers(write) });
            branchName = res.ok ? (await res.json()).default_branch || 'main' : 'main';
        }
        return branchName;
    }

    // Déplace des fichiers (from -> to) en un seul commit ; extra = fichiers à écrire en plus (ex. l'ordre)
    async function movePaths(moves, message, extra = []) {
        const b = await branch();
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                const head = (await ghGit(`ref/heads/${b}`)).object.sha;
                const baseTree = (await ghGit(`commits/${head}`)).tree.sha;
                const entries = moves.flatMap(m => [
                    { path: m.to, mode: '100644', type: 'blob', sha: m.sha },
                    { path: m.from, mode: '100644', type: 'blob', sha: null },
                ]).concat(extra.map(x => ({ path: x.path, mode: '100644', type: 'blob', content: x.content })));
                const tree = await ghGit('trees', { method: 'POST', body: { base_tree: baseTree, tree: entries } });
                const commit = await ghGit('commits', { method: 'POST', body: { message, tree: tree.sha, parents: [head] } });
                await ghGit(`refs/heads/${b}`, { method: 'PATCH', body: { sha: commit.sha } });
                return;
            } catch (e) {
                if (attempt === 1) throw e;  // une 2e tentative si quelqu'un a modifié le dépôt entre-temps
            }
        }
    }

    // Toute l'arborescence du dépôt en une seule requête
    async function ghTree() {
        const res = await fetch(`${API}/repos/${read.depot}/git/trees/HEAD?recursive=1`, { cache: 'no-store', headers: headers(read) });
        if (res.status === 404 || res.status === 409) return [];  // dépôt vide
        if (!res.ok) throw new Error(`GitHub ${res.status}`);
        return (await res.json()).tree || [];
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

    /* ---------- arbre d'une formation ---------- */
    // node = { name, path, folders: [node], files: [{ name, path, sha, size }] }
    function buildTree(items, f) {
        const top = { name: f, path: f, folders: new Map(), files: [] };
        for (const it of items) {
            if (it.type !== 'blob' || !it.path.startsWith(f + '/') || !/\.pdf$/i.test(it.path)) continue;
            const parts = it.path.slice(f.length + 1).split('/');
            const name = parts.pop();
            let node = top;
            for (const p of parts) {
                if (!node.folders.has(p)) node.folders.set(p, { name: p, path: `${node.path}/${p}`, folders: new Map(), files: [] });
                node = node.folders.get(p);
            }
            node.files.push({ name, path: it.path, sha: it.sha, size: it.size });
        }
        const finish = n => {
            n.folders = [...n.folders.values()].map(finish).sort(byName);
            n.files.sort(byName);
            return n;
        };
        return finish(top);
    }

    const filesOf = n => n.files.concat(...n.folders.map(filesOf));
    const countOf = n => filesOf(n).length;
    function findNode(n, path) {
        if (n.path === path) return n;
        for (const c of n.folders) { const r = findNode(c, path); if (r) return r; }
        return null;
    }
    function allFiles(box) {
        const t = box._tree || { dirs: [], files: [] };
        return t.files.concat(...t.dirs.map(filesOf));
    }

    /* ---------- ordre des morceaux (premier niveau) : <formation>/_ordre.json ---------- */
    // Format : ["morceau", …] (ancien) ou { ordre: [...], categories: [{ nom, dossiers: [...] }] }
    async function readOrder(f) {
        const none = { names: [], cats: [], sha: null };
        try {
            const meta = await gh(`${f}/${ORDER_FILE}`);
            if (!meta || !meta.content) return none;
            const data = JSON.parse(b64ToUtf8(meta.content));
            if (Array.isArray(data)) return { names: data, cats: [], sha: meta.sha };
            const cats = (Array.isArray(data.categories) ? data.categories : [])
                .filter(c => c && typeof c.nom === 'string' && c.nom.trim())
                .map(c => ({ name: c.nom, dirs: Array.isArray(c.dossiers) ? c.dossiers : [] }));
            return { names: Array.isArray(data.ordre) ? data.ordre : [], cats, sha: meta.sha };
        } catch {
            return none;
        }
    }

    // Contenu du fichier d'ordre ; ren = { from, to } quand un morceau change de nom
    function orderJSON(box, ren) {
        const fix = n => (ren && n === ren.from ? ren.to : n);
        const names = box._tree.dirs.map(d => fix(d.name));
        const categories = (box._cats || []).map(c => ({
            nom: c.name,
            dossiers: box._tree.dirs.filter(d => catOf(box, d) === c.name).map(d => fix(d.name)),
        }));
        return JSON.stringify(categories.length ? { ordre: names, categories } : names, null, 1);
    }

    // Catégorie d'un morceau de premier niveau ('' = sans catégorie)
    function catOf(box, node) {
        const c = box._assign && box._assign.get(node.name);
        return c && (box._cats || []).some(x => x.name === c) ? c : '';
    }

    // Morceaux rangés selon l'ordre enregistré ; ceux qui n'y sont pas encore vont à la fin, par nom
    function applyOrder(dirs, names) {
        const rank = new Map(names.map((n, i) => [n, i]));
        return dirs.sort((a, b) => {
            const ra = rank.has(a.name) ? rank.get(a.name) : Infinity, rb = rank.has(b.name) ? rank.get(b.name) : Infinity;
            return ra !== rb ? ra - rb : byName(a, b);
        });
    }

    function saveOrderSoon(box, done) {
        clearTimeout(box._saveTimer);
        box._saveTimer = setTimeout(() => {
            box._saving = (box._saving || Promise.resolve()).then(() => saveOrder(box, done));
        }, 700);
    }

    async function saveOrder(box, done) {
        const f = box.dataset.formation;
        status(box, 'ok', 'Enregistrement du classement…');
        try {
            const body = { message: `Classement des morceaux : ${f}`, content: utf8ToB64(orderJSON(box)) };
            if (box._orderSha) body.sha = box._orderSha;
            const res = await gh(`${f}/${ORDER_FILE}`, { method: 'PUT', body, cred: write });
            box._orderSha = res.content.sha;
            status(box, 'ok', done || 'Classement enregistré : tous les membres le voient.');
        } catch (e) {
            console.warn('Ordre', f, e);
            status(box, 'err', "Le classement n'a pas pu être enregistré. Rechargez la page et réessayez.");
        }
    }

    // Monter / descendre un morceau à l'intérieur de sa catégorie
    function moveInGroup(box, path, delta) {
        const dirs = box._tree.dirs;
        const d = dirs.find(x => x.path === path);
        if (!d) return;
        const cat = catOf(box, d);
        const g = dirs.filter(x => catOf(box, x) === cat);
        const other = g[g.indexOf(d) + delta];
        if (!other) return;
        const a = dirs.indexOf(d), b = dirs.indexOf(other);
        [dirs[a], dirs[b]] = [dirs[b], dirs[a]];
        render(box);
        saveOrderSoon(box);
    }

    /* ---------- catégories (regroupent des morceaux, sans déplacer les fichiers) ---------- */
    const findCat = (box, name) => (box._cats || []).find(c => c.name === name);
    const catSection = (box, name) => [...box.querySelectorAll('.part-cat')].find(s => s.dataset.cat === name);

    function newCategory(box) {
        if (!box._tree) return;
        box._cats = box._cats || [];
        let name = 'Nouvelle catégorie', n = 2;
        while (findCat(box, name)) name = `Nouvelle catégorie ${n++}`;
        box._cats.push({ name });
        render(box);
        renameCategory(box, name, true);
    }

    function renameCategory(box, name, isNew) {
        const sec = catSection(box, name);
        const holder = sec && sec.querySelector('.part-cat-name');
        if (!holder || holder.querySelector('input')) return;
        sec.scrollIntoView({ block: 'nearest' });
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'part-rename';
        input.maxLength = 60;
        input.value = name;
        input.setAttribute('aria-label', 'Nom de la catégorie');
        holder.replaceChildren(input);
        input.focus();
        input.select();

        let done = false;
        const finish = commit => {
            if (done) return;
            done = true;
            const value = input.value.replace(/\s+/g, ' ').trim();
            const cat = findCat(box, name);
            if (!cat) return render(box);
            if (!commit || !value) {
                if (isNew) box._cats.splice(box._cats.indexOf(cat), 1);
                return render(box);
            }
            if (value !== name && (box._cats || []).some(c => c !== cat && c.name.toLowerCase() === value.toLowerCase())) {
                status(box, 'err', `Une catégorie « ${value} » existe déjà.`);
                if (isNew) box._cats.splice(box._cats.indexOf(cat), 1);
                return render(box);
            }
            cat.name = value;
            box._assign.forEach((c, k) => { if (c === name) box._assign.set(k, value); });
            if (box._catClosed && box._catClosed.delete(name)) box._catClosed.add(value);
            render(box);
            if (isNew || value !== name) {
                saveOrderSoon(box, isNew ? `Catégorie « ${value} » créée : rangez-y des dossiers avec le bouton de rangement ou en les glissant.` : `Catégorie renommée en « ${value} ».`);
            }
        };
        input.addEventListener('keydown', e => {
            e.stopPropagation();
            if (e.key === 'Enter') { e.preventDefault(); finish(true); }
            else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
        });
        input.addEventListener('click', e => e.stopPropagation());
        input.addEventListener('blur', () => finish(true));
    }

    // Petit menu « Ranger dans… » sous le bouton d'un dossier
    function openCatMenu(box, btn) {
        closeCatMenus();
        const det = btn.closest('.part-folder');
        const d = box._tree.dirs.find(x => x.path === det.dataset.dir);
        if (!d) return;
        const cur = catOf(box, d);
        const opts = [{ name: '', label: 'Sans catégorie' }].concat((box._cats || []).map(c => ({ name: c.name, label: c.name })));
        const menu = document.createElement('div');
        menu.className = 'part-catmenu';
        menu.innerHTML = '<p>Ranger dans…</p>' + opts.map(o =>
            `<button type="button" data-act="setcat" data-cat="${esc(o.name)}"${o.name === cur ? ' class="current"' : ''}>
                <i class="fas ${o.name ? 'fa-layer-group' : 'fa-inbox'}"></i> ${esc(o.label)}${o.name === cur ? ' <i class="fas fa-check"></i>' : ''}</button>`).join('');
        btn.parentElement.appendChild(menu);
        setTimeout(() => document.addEventListener('click', closeCatMenus, { once: true }), 0);
    }
    function closeCatMenus() { document.querySelectorAll('.part-catmenu').forEach(m => m.remove()); }

    /* ---------- chargement ---------- */
    async function load(box) {
        const f = box.dataset.formation;
        const list = box.querySelector('.part-list');
        list.innerHTML = '<p class="members-empty"><i class="fas fa-spinner fa-spin"></i> Chargement des partitions…</p>';
        try {
            const [items, order] = await Promise.all([ghTree(), readOrder(f)]);
            const tree = buildTree(items, f);
            box._orderSha = order.sha;
            box._cats = order.cats.map(c => ({ name: c.name }));
            box._assign = new Map();
            order.cats.forEach(c => c.dirs.forEach(n => box._assign.set(n, c.name)));
            box._tree = { dirs: applyOrder(tree.folders, order.names), files: tree.files, root: tree };
            tree.folders = box._tree.dirs;
            render(box);
        } catch (e) {
            list.innerHTML = '<p class="members-empty"><i class="fas fa-triangle-exclamation"></i> Impossible de charger les partitions pour le moment.</p>';
            console.warn('Partitions', f, e);
        }
    }

    /* ---------- affichage ---------- */
    function fileHTML(it) {
        return `
            <div class="part-item" data-path="${esc(it.path)}" data-sha="${esc(it.sha)}" data-name="${esc(it.name)}">
                <i class="fas fa-file-pdf part-icon"></i>
                <div class="part-meta"><strong>${esc(titleOf(it.name))}</strong><small>${sizeLabel(it.size)}</small></div>
                <div class="part-actions">
                    <button type="button" data-act="open" title="Ouvrir"><i class="fas fa-eye"></i><span> Ouvrir</span></button>
                    <button type="button" data-act="dl" title="Télécharger"><i class="fas fa-download"></i></button>
                    ${write ? '<button type="button" data-act="rename" title="Renommer"><i class="fas fa-pen"></i></button>' : ''}
                    ${write ? '<button type="button" data-act="del" class="part-del" title="Supprimer"><i class="fas fa-trash"></i></button>' : ''}
                </div>
            </div>`;
    }

    // top = { sortable, index, total } pour un morceau de premier niveau, null pour un sous-dossier
    function folderHTML(node, shown, q, openSet, top) {
        const sortable = top && top.sortable;
        return `
            <details class="part-folder${sortable ? ' sortable' : ''}${top ? '' : ' part-sub'}" data-dir="${esc(node.path)}"${sortable ? ' draggable="true"' : ''}${q || openSet.has(node.path) ? ' open' : ''}>
                <summary>
                    ${sortable ? '<span class="part-grip" title="Glisser pour déplacer"><i class="fas fa-grip-vertical"></i></span>' : ''}
                    <i class="fas fa-folder part-icon"></i><i class="fas fa-folder-open part-icon"></i>
                    <span class="part-meta"><strong>${esc(node.name)}</strong><small>${plural(countOf(node), 'partition')}${node.folders.length ? ' · ' + plural(node.folders.length, 'dossier') : ''}</small></span>
                    ${sortable && top.total > 1 ? `<span class="part-move">
                        <button type="button" data-act="up" title="Monter"${top.index === 0 ? ' disabled' : ''}><i class="fas fa-arrow-up"></i></button>
                        <button type="button" data-act="down" title="Descendre"${top.index === top.total - 1 ? ' disabled' : ''}><i class="fas fa-arrow-down"></i></button>
                    </span>` : ''}
                    ${write && top && top.hasCats ? `<span class="part-catwrap"><button type="button" data-act="catmenu" class="part-ren" title="Ranger dans une catégorie"><i class="fas fa-folder-tree"></i></button></span>` : ''}
                    ${write ? `<button type="button" data-act="rename" class="part-ren" title="Renommer le dossier"><i class="fas fa-pen"></i></button>` : ''}
                    ${write ? `<button type="button" data-act="deldir" class="part-del part-deldir" title="Supprimer tout le dossier"><i class="fas fa-trash"></i></button>` : ''}
                    <i class="fas fa-chevron-down part-chevron"></i>
                </summary>
                <div class="part-folder-files">
                    ${shown.folders.map(c => folderHTML(c.node, c, q, openSet, null)).join('')}
                    ${shown.files.map(fileHTML).join('')}
                </div>
            </details>`;
    }

    // Filtre de recherche : un dossier dont le nom correspond montre tout son contenu
    function filterNode(node, q) {
        const match = s => titleOf(s).toLowerCase().includes(q);
        if (!q || match(node.name)) {
            return { node, files: node.files, folders: node.folders.map(c => filterNode(c, '')) };
        }
        const folders = node.folders.map(c => filterNode(c, q)).filter(Boolean);
        const files = node.files.filter(x => match(x.name));
        return folders.length || files.length ? { node, files, folders } : null;
    }

    function render(box) {
        const list = box.querySelector('.part-list');
        const t = box._tree || { dirs: [], files: [] };
        const q = (box.querySelector('.part-search')?.value || '').trim().toLowerCase();
        box.querySelector('.part-count').textContent =
            (t.dirs.length ? plural(t.dirs.length, 'morceau').replace('morceaus', 'morceaux') + ' · ' : '') + plural(allFiles(box).length, 'partition');

        const dirs = t.dirs.map(d => filterNode(d, q)).filter(Boolean);
        const files = t.files.filter(x => !q || titleOf(x.name).toLowerCase().includes(q));
        const cats = box._cats || [];
        if (!dirs.length && !files.length && !(write && cats.length && !q)) {
            list.innerHTML = `<p class="members-empty"><i class="fas fa-music"></i> ${q ? 'Aucune partition ne correspond.' : 'Aucune partition pour le moment.'}</p>`;
            return;
        }
        const openSet = box._open || new Set();
        const closed = box._catClosed || new Set();
        const sortable = !!write && !q;  // réordonner / ranger : éditeur, sans recherche en cours
        const group = cat => dirs.filter(d => catOf(box, d.node) === cat);
        const folders = arr => arr.map((d, i) => folderHTML(d.node, d, q, openSet, { sortable, index: i, total: arr.length, hasCats: cats.length > 0 })).join('');
        const hint = txt => (write && !q ? `<p class="part-cat-empty"><i class="fas fa-hand-pointer"></i> ${txt}</p>` : '');

        const loose = group('');
        let html = `<div class="part-cat-body part-loose" data-cat="">${folders(loose) || (cats.length ? hint('Morceaux sans catégorie : glissez un dossier ici pour le sortir de sa catégorie.') : '')}</div>`;
        cats.forEach((c, ci) => {
            const g = group(c.name);
            if (!g.length && (q || !write)) return;  // catégorie vide : visible seulement des éditeurs
            const isOpen = !!q || !closed.has(c.name);
            html += `
                <section class="part-cat${isOpen ? ' open' : ''}" data-cat="${esc(c.name)}">
                    <div class="part-cat-head" title="Ouvrir / fermer">
                        <i class="fas fa-chevron-right part-cat-chev"></i>
                        <i class="fas fa-layer-group part-cat-icon"></i>
                        <span class="part-cat-title"><strong class="part-cat-name">${esc(c.name)}</strong><small>${plural(g.length, 'morceau').replace('morceaus', 'morceaux')}</small></span>
                        ${write ? `<span class="part-move">
                            <button type="button" data-act="catup" title="Monter la catégorie"${ci === 0 ? ' disabled' : ''}><i class="fas fa-arrow-up"></i></button>
                            <button type="button" data-act="catdown" title="Descendre la catégorie"${ci === cats.length - 1 ? ' disabled' : ''}><i class="fas fa-arrow-down"></i></button>
                        </span>
                        <button type="button" data-act="catrename" class="part-ren" title="Renommer la catégorie"><i class="fas fa-pen"></i></button>
                        <button type="button" data-act="catdel" class="part-del part-deldir" title="Supprimer la catégorie (les dossiers sont gardés)"><i class="fas fa-trash"></i></button>` : ''}
                    </div>
                    <div class="part-cat-body" data-cat="${esc(c.name)}">${folders(g) || hint('Catégorie vide : glissez un dossier ici, ou utilisez le bouton <i class="fas fa-folder-tree"></i> d\'un dossier.')}</div>
                </section>`;
        });
        list.innerHTML = html + files.map(fileHTML).join('');
        list.querySelectorAll('.part-folder').forEach(det => det.addEventListener('toggle', e => {
            e.stopPropagation();
            box._open = box._open || new Set();
            det.open ? box._open.add(det.dataset.dir) : box._open.delete(det.dataset.dir);
        }));
        if (sortable) enableDrag(box, list);
    }

    // Glisser-déposer des morceaux de premier niveau (éditeurs) : ordre + changement de catégorie
    function enableDrag(box, list) {
        let dragged = null;
        const snapshot = () => box._tree.dirs.map(d => d.path + '>' + catOf(box, d)).join('|');

        function commit() {
            const before = snapshot();
            const paths = [];
            list.querySelectorAll('.part-cat-body').forEach(body => body.querySelectorAll(':scope > .part-folder').forEach(det => {
                paths.push(det.dataset.dir);
                const d = box._tree.dirs.find(x => x.path === det.dataset.dir);
                if (!d) return;
                if (body.dataset.cat) box._assign.set(d.name, body.dataset.cat); else box._assign.delete(d.name);
            }));
            const rank = p => { const i = paths.indexOf(p); return i < 0 ? Infinity : i; };
            box._tree.dirs.sort((a, b) => rank(a.path) - rank(b.path));
            render(box);
            if (snapshot() !== before) saveOrderSoon(box);
        }

        list.querySelectorAll('.part-cat-body > .part-folder.sortable').forEach(det => {
            det.addEventListener('dragstart', e => {
                if (e.target !== det) return;
                dragged = det;
                det.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', det.dataset.dir);
            });
            det.addEventListener('dragend', () => {
                det.classList.remove('dragging');
                list.querySelectorAll('.drop-over').forEach(x => x.classList.remove('drop-over'));
                if (!dragged) return;
                dragged = null;
                commit();
            });
            det.addEventListener('dragover', e => {
                if (!dragged || dragged === det) return;
                e.preventDefault();
                e.stopPropagation();
                const r = det.getBoundingClientRect();
                det.parentNode.insertBefore(dragged, e.clientY < r.top + r.height / 2 ? det : det.nextSibling);
            });
        });
        // Déposer sur une catégorie (son titre ou sa zone vide) : le dossier va à la fin de cette catégorie
        list.querySelectorAll('.part-cat-body').forEach(body => {
            const target = body.closest('.part-cat');
            const head = target && target.querySelector('.part-cat-head');
            const into = e => {
                if (!dragged) return;
                e.preventDefault();
                if (target && !target.classList.contains('open')) target.classList.add('open');
                if (dragged.parentNode !== body || e.currentTarget === head) body.appendChild(dragged);
                list.querySelectorAll('.drop-over').forEach(x => x.classList.remove('drop-over'));
                (target || body).classList.add('drop-over');
            };
            body.addEventListener('dragover', into);
            if (head) head.addEventListener('dragover', into);
        });
        if (!list._dropBound) { list._dropBound = true; list.addEventListener('drop', e => { if (e.dataTransfer?.types?.includes('text/plain')) e.preventDefault(); }); }
    }

    function armConfirm(btn) {  // confirmation en deux clics, sans fenêtre bloquante
        if (btn.dataset.confirm === '1') return true;
        btn.dataset.confirm = '1';
        const old = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-trash"></i> Confirmer ?';
        setTimeout(() => { if (btn.isConnected) { btn.dataset.confirm = ''; btn.innerHTML = old; } }, 4000);
        return false;
    }

    /* ---------- renommer (fichier ou dossier) ---------- */
    function startRename(box, btn) {
        const folder = btn.closest('.part-item') ? null : btn.closest('.part-folder');
        const holder = folder ? folder.querySelector(':scope > summary .part-meta strong') : btn.closest('.part-item').querySelector('.part-meta strong');
        if (!holder || holder.querySelector('input')) return;
        const current = folder ? findNode(box._tree.root, folder.dataset.dir)?.name : btn.closest('.part-item').dataset.name.replace(/\.pdf$/i, '');
        if (current == null) return;
        if (folder) folder.draggable = false;

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'part-rename';
        input.value = current;
        input.setAttribute('aria-label', 'Nouveau nom');
        holder.replaceChildren(input);
        input.focus();
        input.select();

        let done = false;
        const finish = commit => {
            if (done) return;
            done = true;
            const value = safeName(input.value);
            if (!commit || !value || value === current) { render(box); return; }
            doRename(box, folder, btn.closest('.part-item'), value);
        };
        input.addEventListener('keydown', e => {
            e.stopPropagation();
            if (e.key === 'Enter') { e.preventDefault(); finish(true); }
            else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
        });
        input.addEventListener('keyup', e => { e.stopPropagation(); if (e.key === ' ') e.preventDefault(); });  // espace : ne pas replier le dossier
        input.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); });
        input.addEventListener('blur', () => finish(true));
    }

    async function doRename(box, folder, item, value) {
        const f = box.dataset.formation;
        let moves, label, extra = [], oldDir = null, newDir = null;

        if (folder) {
            const node = findNode(box._tree.root, folder.dataset.dir);
            if (!node) return;
            const parentPath = node.path.slice(0, node.path.lastIndexOf('/'));
            const parent = findNode(box._tree.root, parentPath) || box._tree.root;
            if (parent.folders.some(d => d !== node && d.name.toLowerCase() === value.toLowerCase())) {
                status(box, 'err', `Un dossier « ${value} » existe déjà ici.`);
                render(box);
                return;
            }
            oldDir = node.path;
            newDir = `${parentPath}/${value}`;
            moves = filesOf(node).map(it => ({ from: it.path, to: newDir + it.path.slice(oldDir.length), sha: it.sha }));
            label = `Dossier « ${node.name} » renommé en « ${value} ».`;
            if (parentPath === f) {  // morceau de premier niveau : garder sa place dans l'ordre
                extra = [{ path: `${f}/${ORDER_FILE}`, content: orderJSON(box, { from: node.name, to: value }) }];
            }
        } else {
            const { path, sha, name } = item.dataset;
            const dir = path.slice(0, path.lastIndexOf('/'));
            const newName = /\.pdf$/i.test(value) ? value : value + '.pdf';
            const to = `${dir}/${newName}`;
            if (allFiles(box).some(x => x.path !== path && x.path.toLowerCase() === to.toLowerCase())) {
                status(box, 'err', `Une partition « ${titleOf(newName)} » existe déjà ici.`);
                render(box);
                return;
            }
            moves = [{ from: path, to, sha }];
            label = `« ${titleOf(name)} » renommée en « ${titleOf(newName)} ».`;
        }
        if (!moves.length) { render(box); return; }

        status(box, 'ok', 'Renommage en cours…');
        try {
            await movePaths(moves, `Renommage : ${moves.length === 1 ? moves[0].from + ' -> ' + moves[0].to : oldDir + ' -> ' + newDir}`, extra);
            if (oldDir && box._open) {  // garder ouverts les dossiers qui l'étaient
                box._open = new Set([...box._open].map(p => p === oldDir || p.startsWith(oldDir + '/') ? newDir + p.slice(oldDir.length) : p));
            }
            status(box, 'ok', label);
        } catch (e) {
            console.warn('Renommage', e);
            status(box, 'err', 'Le renommage a échoué. Rechargez la page et réessayez.');
        }
        load(box);
    }

    async function onAction(box, btn) {
        const act = btn.dataset.act;

        if (act === 'rename') { startRename(box, btn); return; }

        if (act === 'up' || act === 'down') {
            moveInGroup(box, btn.closest('.part-folder').dataset.dir, act === 'up' ? -1 : 1);
            return;
        }

        // Catégories
        if (act === 'catmenu') { openCatMenu(box, btn); return; }
        if (act === 'setcat') {
            const d = box._tree.dirs.find(x => x.path === btn.closest('.part-folder').dataset.dir);
            closeCatMenus();
            if (!d) return;
            const cat = btn.dataset.cat;
            if (cat === catOf(box, d)) return;
            if (cat) box._assign.set(d.name, cat); else box._assign.delete(d.name);
            if (cat && box._catClosed) box._catClosed.delete(cat);
            render(box);
            saveOrderSoon(box, cat ? `« ${d.name} » rangé dans « ${cat} ».` : `« ${d.name} » sorti de sa catégorie.`);
            return;
        }
        if (act.startsWith('cat')) {
            const name = btn.closest('.part-cat')?.dataset.cat;
            const cat = findCat(box, name);
            if (!cat) return;
            if (act === 'catrename') { renameCategory(box, name, false); return; }
            if (act === 'catup' || act === 'catdown') {
                const i = box._cats.indexOf(cat), j = i + (act === 'catup' ? -1 : 1);
                if (j < 0 || j >= box._cats.length) return;
                [box._cats[i], box._cats[j]] = [box._cats[j], box._cats[i]];
                render(box);
                saveOrderSoon(box);
                return;
            }
            if (act === 'catdel') {
                if (!armConfirm(btn)) return;
                box._cats.splice(box._cats.indexOf(cat), 1);
                box._assign.forEach((c, k) => { if (c === name) box._assign.delete(k); });
                render(box);
                saveOrderSoon(box, `Catégorie « ${name} » supprimée : ses dossiers sont revenus dans « sans catégorie ».`);
                return;
            }
            return;
        }

        if (act === 'deldir') {
            if (!armConfirm(btn)) return;
            const node = findNode(box._tree.root, btn.closest('.part-folder').dataset.dir);
            if (!node) return;
            btn.disabled = true;
            const files = filesOf(node);
            let fails = 0, n = 0;
            for (const it of files) {
                status(box, 'ok', `Suppression de « ${node.name} » (${++n}/${files.length})…`);
                try { await gh(it.path, { method: 'DELETE', body: { message: `Suppression : ${it.path}`, sha: it.sha }, cred: write }); }
                catch { fails++; }
            }
            status(box, fails ? 'err' : 'ok', fails ? `${fails} fichier(s) n'ont pas pu être supprimés.` : `Dossier « ${node.name} » supprimé.`);
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
        const entries = [...(dt.items || [])].map(i => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
        return entries.length ? entries : null;
    }

    // Parcourt fichiers et dossiers déposés -> [{ file, dir }] où dir garde tous les niveaux ("A/B/C")
    async function collectEntries(entries) {
        const out = [];
        const walk = async (entry, dir) => {
            if (entry.isFile) {
                out.push({ file: await new Promise((ok, ko) => entry.file(ok, ko)), dir });
            } else if (entry.isDirectory) {
                const sub = dir ? `${dir}/${entry.name}` : entry.name;
                const reader = entry.createReader();
                let batch;
                do {
                    batch = await new Promise((ok, ko) => reader.readEntries(ok, ko));
                    for (const e of batch) await walk(e, sub);
                } while (batch.length);
            }
        };
        for (const e of entries) await walk(e, '');
        return out;
    }

    // ZIP -> PDF qu'il contient, avec ses sous-dossiers, rangés dans un dossier au nom du ZIP
    async function expandZips(list) {
        const out = [];
        for (const it of list) {
            if (!isZip(it.file)) { out.push(it); continue; }
            const JSZip = await loadJSZip();
            const zip = await JSZip.loadAsync(it.file);
            const zipName = it.file.name.replace(/\.zip$/i, '');
            const base = it.dir ? `${it.dir}/${zipName}` : zipName;
            const pdfs = Object.values(zip.files).filter(z => !z.dir && /\.pdf$/i.test(z.name) && !/(^|\/)__MACOSX\//.test(z.name));
            // un ZIP qui contient un seul dossier racine du même nom : on ne le répète pas
            const firsts = new Set(pdfs.map(z => z.name.split('/')[0]));
            const strip = firsts.size === 1 && pdfs.every(z => z.name.includes('/')) && [...firsts][0] === zipName;
            for (const z of pdfs) {
                const parts = z.name.split('/');
                const name = parts.pop();
                if (strip) parts.shift();
                const blob = await z.async('blob');
                out.push({ file: new File([blob], name, { type: 'application/pdf' }), dir: [base, ...parts].filter(Boolean).join('/') });
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
        } catch {
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
            const d = safeDir(dir || '');
            const path = d ? `${f}/${d}/${name}` : `${f}/${name}`;
            status(box, 'ok', `Envoi ${done + failed + 1}/${pdfs.length} : ${d ? d.replace(/\//g, ' › ') + ' › ' : ''}${titleOf(name)}…`);
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
                <span>Un dossier ou un ZIP devient un morceau, sous-dossiers compris (ex. « La Marseillaise » › « Chorale ») · ${MAX_MO} Mo max par PDF</span>
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
            box.querySelector('.part-count').insertAdjacentHTML('beforebegin',
                '<button type="button" class="btn btn-outline part-newcat"><i class="fas fa-folder-plus"></i> Nouvelle catégorie</button>');
            box.querySelector('.part-newcat').addEventListener('click', () => newCategory(box));
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
                if (inDir.files.length) upload(box, [...inDir.files].map(file => ({ file, dir: (file.webkitRelativePath || '').split('/').slice(0, -1).join('/') })));
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
        bar.innerHTML = `<span><i class="fas fa-pen-to-square"></i> <strong>Mode éditeur activé</strong> : vous pouvez déposer, classer et supprimer des partitions.</span>
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
                if (!btn) {
                    // clic sur le titre d'une catégorie : ouvrir / fermer
                    const head = e.target.closest('.part-cat-head');
                    if (head && !e.target.closest('input')) {
                        const sec = head.closest('.part-cat'), name = sec.dataset.cat;
                        box._catClosed = box._catClosed || new Set();
                        sec.classList.toggle('open') ? box._catClosed.delete(name) : box._catClosed.add(name);
                    }
                    return;
                }
                if (['deldir', 'up', 'down', 'rename', 'catmenu', 'setcat'].includes(btn.dataset.act)) e.preventDefault();  // ne pas replier le dossier
                if (btn.dataset.act === 'catmenu' || btn.dataset.act === 'setcat') e.stopPropagation();
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
