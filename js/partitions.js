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

    /* ---------- chargement ---------- */
    async function load(box) {
        const f = box.dataset.formation;
        const list = box.querySelector('.part-list');
        list.innerHTML = '<p class="members-empty"><i class="fas fa-spinner fa-spin"></i> Chargement des partitions…</p>';
        try {
            const [items, order] = await Promise.all([ghTree(), readOrder(f)]);
            const tree = buildTree(items, f);
            box._orderSha = order.sha;
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
                    ${sortable ? `<span class="part-move">
                        <button type="button" data-act="up" title="Monter"${top.index === 0 ? ' disabled' : ''}><i class="fas fa-arrow-up"></i></button>
                        <button type="button" data-act="down" title="Descendre"${top.index === top.total - 1 ? ' disabled' : ''}><i class="fas fa-arrow-down"></i></button>
                    </span>` : ''}
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
        if (!dirs.length && !files.length) {
            list.innerHTML = `<p class="members-empty"><i class="fas fa-music"></i> ${q ? 'Aucune partition ne correspond.' : 'Aucune partition pour le moment.'}</p>`;
            return;
        }
        const openSet = box._open || new Set();
        const sortable = !!write && !q && dirs.length > 1;  // réordonner : éditeur, sans recherche en cours
        list.innerHTML = dirs.map((d, i) => folderHTML(d.node, d, q, openSet, { sortable, index: i, total: dirs.length })).join('')
            + files.map(fileHTML).join('');
        list.querySelectorAll('.part-folder').forEach(det => det.addEventListener('toggle', e => {
            e.stopPropagation();
            box._open = box._open || new Set();
            det.open ? box._open.add(det.dataset.dir) : box._open.delete(det.dataset.dir);
        }));
        if (sortable) enableDrag(box, list);
    }

    // Glisser-déposer des morceaux de premier niveau (éditeurs)
    function enableDrag(box, list) {
        let dragged = null;
        list.querySelectorAll(':scope > .part-folder.sortable').forEach(det => {
            det.addEventListener('dragstart', e => {
                if (e.target !== det) return;
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
                const paths = [...list.querySelectorAll(':scope > .part-folder')].map(x => x.dataset.dir);
                const before = box._tree.dirs.map(d => d.path).join('|');
                box._tree.dirs.sort((a, b) => paths.indexOf(a.path) - paths.indexOf(b.path));
                if (box._tree.dirs.map(d => d.path).join('|') !== before) { render(box); saveOrderSoon(box); }
            });
            det.addEventListener('dragover', e => {
                if (!dragged || dragged === det) return;
                e.preventDefault();
                const r = det.getBoundingClientRect();
                list.insertBefore(dragged, e.clientY < r.top + r.height / 2 ? det : det.nextSibling);
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
