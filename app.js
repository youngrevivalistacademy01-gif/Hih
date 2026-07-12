'use strict';

/* ---------------------------------------------------------------
   Safe storage layer
   FIX: original code did JSON.parse(localStorage.getItem(x)) with
   no try/catch — one corrupted write and the app white-screens on
   load. Also every setItem was unguarded, so hitting the quota
   (easy to do once you import a couple of base64 images) failed
   silently while the UI kept claiming "Sync Active".
------------------------------------------------------------------ */
const Storage = {
    get(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            if (raw === null) return fallback;
            return JSON.parse(raw);
        } catch (err) {
            console.warn(`Storage: failed to read "${key}", using fallback.`, err);
            return fallback;
        }
    },
    set(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (err) {
            console.error(`Storage: failed to write "${key}".`, err);
            return false;
        }
    }
};

let fsData = Storage.get('v_ide_fs', null) || { root: { id: 'root', type: 'folder', name: 'Workspace', children: [] } };
let openTabs = Storage.get('v_ide_tabs', []);
let activeFileId = localStorage.getItem('v_ide_active_tab_id') || null;
let currentTheme = localStorage.getItem('v_ide_theme') || 'dark';

let rightClickedItemId = null;
let liveServerActive = false;
let updateTimeout = null;
let modalResolveCallback = null;

let splitViewMode = false;
let secondaryFileId = null;
let activePaneIsSecondary = false;

const explorerRoot = document.getElementById('explorer-root');
const fileTitle = document.getElementById('file-title');
const contextMenu = document.getElementById('context-menu');
const editorContextMenu = document.getElementById('editor-context-menu');
const themeToggleBtn = document.getElementById('btn-theme-toggle');
const sidebar = document.getElementById('sidebar');
const btnSidebarToggle = document.getElementById('btn-sidebar-toggle');
const btnSplitToggle = document.getElementById('btn-split-toggle');
const tabsContainer = document.getElementById('tabs-container');
const statusMode = document.getElementById('status-mode');
const statusSync = document.getElementById('status-sync');

const liveServerPanel = document.getElementById('live-server-panel');
const livePreviewFrame = document.getElementById('live-preview-frame');
const btnCloseLive = document.getElementById('btn-close-live');
const btnFullscreenLive = document.getElementById('btn-fullscreen-live');

const customModal = document.getElementById('custom-modal');
const modalTitle = document.getElementById('modal-title');
const modalDesc = document.getElementById('modal-desc');
const modalInput = document.getElementById('modal-input');
const modalError = document.getElementById('modal-error');
const modalCancelBtn = document.getElementById('modal-cancel-btn');
const modalConfirmBtn = document.getElementById('modal-confirm-btn');

const cmdPalette = document.getElementById('cmd-palette');
const cmdInput = document.getElementById('cmd-input');
const cmdResults = document.getElementById('cmd-results');

const paneSecondary = document.getElementById('pane-secondary');

/* ---------------------------------------------------------------
   Editors
------------------------------------------------------------------ */
const cmInstance = CodeMirror.fromTextArea(document.getElementById('editor'), {
    lineNumbers: true,
    mode: "htmlmixed",
    theme: currentTheme === 'dark' ? 'monokai' : 'neo',
    lineWrapping: true,
    inputStyle: "contenteditable"
});

const cmSecondary = CodeMirror.fromTextArea(document.getElementById('editor-secondary'), {
    lineNumbers: true,
    mode: "htmlmixed",
    theme: currentTheme === 'dark' ? 'monokai' : 'neo',
    lineWrapping: true,
    inputStyle: "contenteditable"
});

cmInstance.on("focus", () => { activePaneIsSecondary = false; setActivePane(false); });
cmSecondary.on("focus", () => { activePaneIsSecondary = true; setActivePane(true); });

cmInstance.on("change", () => {
    if (activeFileId) {
        const targetNode = findNode(activeFileId);
        if (targetNode) targetNode.content = cmInstance.getValue();
    }
    queueLiveUpdate();
    queueAutosave();
});

cmSecondary.on("change", () => {
    if (secondaryFileId) {
        const targetNode = findNode(secondaryFileId);
        if (targetNode) targetNode.content = cmSecondary.getValue();
    }
    queueLiveUpdate();
    queueAutosave();
});

function setActivePane(isSecondary) {
    document.getElementById('pane-primary').classList.toggle('active-pane', !isSecondary);
    paneSecondary.classList.toggle('active-pane', isSecondary);
}

/* ---------------------------------------------------------------
   Autosave — debounced + reports failures instead of lying
------------------------------------------------------------------ */
let autosaveTimeout = null;
function queueAutosave() {
    clearTimeout(autosaveTimeout);
    autosaveTimeout = setTimeout(saveToStorage, 250);
}

function saveToStorage() {
    const ok = Storage.set('v_ide_fs', fsData);
    setSyncStatus(ok);
    return ok;
}

function setSyncStatus(ok) {
    statusSync.classList.remove('ok', 'error');
    if (ok) {
        statusSync.classList.add('ok');
        statusSync.textContent = '\u{1F7E2} Saved';
        statusSync.title = 'Workspace saved to this browser\'s local storage';
    } else {
        statusSync.classList.add('error');
        statusSync.textContent = '\u{1F534} Save failed';
        statusSync.title = 'Local storage is full or unavailable — free up space (e.g. remove large imported images) and try again.';
    }
}

/* ---------------------------------------------------------------
   Sidebar toggle
------------------------------------------------------------------ */
btnSidebarToggle.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed-sidebar');
    setTimeout(() => { cmInstance.refresh(); cmSecondary.refresh(); }, 310);
});

/* ---------------------------------------------------------------
   Theme
------------------------------------------------------------------ */
function setTheme(theme) {
    currentTheme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('v_ide_theme', theme);
    cmInstance.setOption('theme', theme === 'dark' ? 'monokai' : 'neo');
    cmSecondary.setOption('theme', theme === 'dark' ? 'monokai' : 'neo');
    themeToggleBtn.innerHTML = theme === 'dark' ? '☀️ Light Mode' : '🌙 Dark Mode';
}
themeToggleBtn.addEventListener('click', () => setTheme(currentTheme === 'dark' ? 'light' : 'dark'));
setTheme(currentTheme);

/* ---------------------------------------------------------------
   Modal (with inline validation support)
------------------------------------------------------------------ */
function openCustomModal(title, description, defaultValue = '', isDanger = false, validate = null) {
    return new Promise((resolve) => {
        modalTitle.textContent = title;
        modalDesc.textContent = description;
        modalInput.value = defaultValue;
        modalInput.classList.remove('input-error');
        modalError.classList.remove('visible');
        const isPrompt = !description.toLowerCase().includes('delete');
        modalInput.style.display = isPrompt ? 'block' : 'none';
        modalConfirmBtn.className = 'modal-btn ' + (isDanger ? 'modal-btn-danger' : 'modal-btn-confirm');
        customModal.classList.add('active');
        if (isPrompt) setTimeout(() => { modalInput.focus(); modalInput.select(); }, 50);

        modalResolveCallback = (value) => {
            if (isPrompt && value !== null && validate) {
                const errMsg = validate(value);
                if (errMsg) {
                    modalInput.classList.add('input-error');
                    modalError.textContent = errMsg;
                    modalError.classList.add('visible');
                    return false; // keep modal open
                }
            }
            customModal.classList.remove('active');
            resolve(value);
            return true;
        };
    });
}

function attemptClose(value) {
    if (modalResolveCallback) {
        const closed = modalResolveCallback(value);
        if (closed) modalResolveCallback = null;
    }
}

modalConfirmBtn.addEventListener('click', () => {
    attemptClose(modalInput.style.display === 'none' ? true : modalInput.value.trim());
});
modalCancelBtn.addEventListener('click', () => {
    customModal.classList.remove('active');
    if (modalResolveCallback) { modalResolveCallback = null; }
});
modalInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') modalConfirmBtn.click();
    else if (e.key === 'Escape') modalCancelBtn.click();
});
modalInput.addEventListener('input', () => {
    modalInput.classList.remove('input-error');
    modalError.classList.remove('visible');
});

/* ---------------------------------------------------------------
   Filesystem helpers
------------------------------------------------------------------ */
function generateId() { return 'node_' + Math.random().toString(36).substr(2, 9); }

function findNode(id, node = fsData.root) {
    if (node.id === id) return node;
    if (node.children) {
        for (const child of node.children) {
            const found = findNode(id, child);
            if (found) return found;
        }
    }
    return null;
}

function findParent(id, node = fsData.root) {
    if (!node.children) return null;
    for (const child of node.children) {
        if (child.id === id) return node;
        const found = findParent(id, child);
        if (found) return found;
    }
    return null;
}

function deleteNode(id, node = fsData.root) {
    if (!node.children) return [];
    const index = node.children.findIndex(child => child.id === id);
    if (index !== -1) {
        const removed = node.children.splice(index, 1)[0];
        return collectIds(removed);
    }
    for (const child of node.children) {
        const ids = deleteNode(id, child);
        if (ids.length) return ids;
    }
    return [];
}

// FIX: deleting a folder used to leave its descendants' ids dangling in
// openTabs/localStorage — collect every id under a node so callers can
// clean up tabs and split-view references properly.
function collectIds(node, acc = []) {
    acc.push(node.id);
    if (node.children) node.children.forEach(child => collectIds(child, acc));
    return acc;
}

function siblingNames(parentId, excludeId = null) {
    const parent = findNode(parentId);
    if (!parent || !parent.children) return [];
    return parent.children.filter(c => c.id !== excludeId).map(c => c.name.toLowerCase());
}

function validateName(name, parentId, excludeId = null) {
    if (!name || !name.trim()) return 'Name can\'t be empty.';
    if (/[\/\\]/.test(name)) return 'Name can\'t contain / or \\.';
    if (siblingNames(parentId, excludeId).includes(name.trim().toLowerCase())) {
        return 'An item with that name already exists here.';
    }
    return null;
}

/* ---------------------------------------------------------------
   Path resolution for bundling <link>/<script src>
   FIX: original findSiblingByName matched by filename anywhere in
   the tree, so "css/style.css" and "old/style.css" were
   indistinguishable — bundling could silently grab the wrong file.
   This resolves relative to the current file's own folder first.
------------------------------------------------------------------ */
function getAncestors(id, node = fsData.root, chain = []) {
    if (node.id === id) return chain;
    if (node.children) {
        for (const child of node.children) {
            const result = getAncestors(id, child, [...chain, node]);
            if (result) return result;
        }
    }
    return null;
}

function resolveRelativePath(fromFileId, relPath) {
    if (!relPath) return null;
    const cleanPath = relPath.split('?')[0].split('#')[0];
    const segments = cleanPath.split('/').filter(s => s !== '.' && s !== '');

    const ancestors = getAncestors(fromFileId) || [fsData.root];
    let currentFolder = ancestors[ancestors.length - 1] || fsData.root;
    let folderStack = [...ancestors];

    for (let i = 0; i < segments.length - 1; i++) {
        if (segments[i] === '..') {
            folderStack.pop();
            currentFolder = folderStack[folderStack.length - 1] || fsData.root;
            continue;
        }
        const next = (currentFolder.children || []).find(c => c.type === 'folder' && c.name === segments[i]);
        if (!next) { currentFolder = null; break; }
        folderStack.push(next);
        currentFolder = next;
    }

    const targetName = segments[segments.length - 1];
    if (currentFolder) {
        const match = (currentFolder.children || []).find(c => c.type === 'file' && c.name === targetName);
        if (match) return match;
    }

    // Fallback: last resort, search whole tree by filename (legacy behaviour)
    return findSiblingByName(targetName);
}

function findSiblingByName(name, node = fsData.root) {
    if (node.type === 'file' && node.name === name) return node;
    if (node.children) {
        for (const child of node.children) {
            const found = findSiblingByName(name, child);
            if (found) return found;
        }
    }
    return null;
}

/* ---------------------------------------------------------------
   Live preview
   FIX: switched Blob+createObjectURL to iframe.srcdoc — fewer moving
   parts, no revoke-timing edge cases, noticeably snappier on
   lower-powered devices (tablets).
------------------------------------------------------------------ */
function queueLiveUpdate() {
    if (!liveServerActive) return;
    clearTimeout(updateTimeout);
    updateTimeout = setTimeout(updateLiveServer, 300);
}

window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'LIVE_SERVER_NAVIGATE') {
        const targetNode = resolveRelativePath(activeFileId, e.data.fileName);
        if (targetNode && targetNode.type === 'file') selectFile(targetNode.id);
    }
});

function updateLiveServer() {
    if (!activeFileId || !liveServerActive) return;
    const currentFile = findNode(activeFileId);
    if (!currentFile) return;

    let codeContent = currentFile.content || '';
    const extension = (currentFile.name.split('.').pop() || '').toLowerCase();

    if (extension === 'html' || extension === 'htm') {
        const parsedDOM = new DOMParser().parseFromString(codeContent, 'text/html');

        parsedDOM.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
            const href = link.getAttribute('href');
            if (href && !/^https?:\/\//.test(href)) {
                const sibling = resolveRelativePath(activeFileId, href);
                if (sibling) {
                    const styleTag = parsedDOM.createElement('style');
                    styleTag.textContent = sibling.content || '';
                    link.replaceWith(styleTag);
                }
            }
        });

        parsedDOM.querySelectorAll('script[src]').forEach(script => {
            const src = script.getAttribute('src');
            if (src && !/^https?:\/\//.test(src)) {
                const sibling = resolveRelativePath(activeFileId, src);
                if (sibling) {
                    const newScript = parsedDOM.createElement('script');
                    newScript.textContent = sibling.content || '';
                    script.replaceWith(newScript);
                }
            }
        });

        const runtimeInterceptor = parsedDOM.createElement('script');
        runtimeInterceptor.textContent = `
            document.addEventListener('click', (e) => {
                const targetElement = e.target.closest('a, [href]');
                if (!targetElement) return;
                const locationPath = targetElement.getAttribute('href');
                if (locationPath && !/^https?:\\/\\//.test(locationPath) && !locationPath.startsWith('#') && !locationPath.startsWith('javascript:')) {
                    e.preventDefault();
                    window.parent.postMessage({ type: 'LIVE_SERVER_NAVIGATE', fileName: locationPath }, '*');
                }
            });
        `;
        parsedDOM.body.appendChild(runtimeInterceptor);
        codeContent = '<!DOCTYPE html>\n' + parsedDOM.documentElement.outerHTML;
    }

    livePreviewFrame.srcdoc = codeContent;
}

function toggleLiveServer() {
    liveServerActive = !liveServerActive;
    if (liveServerActive) {
        liveServerPanel.style.display = 'flex';
        updateLiveServer();
    } else {
        liveServerPanel.style.display = 'none';
        liveServerPanel.classList.remove('fullscreen-preview');
        livePreviewFrame.srcdoc = '';
    }
    cmInstance.refresh();
    cmSecondary.refresh();
}

btnCloseLive.addEventListener('click', toggleLiveServer);
btnFullscreenLive.addEventListener('click', () => liveServerPanel.classList.toggle('fullscreen-preview'));

/* ---------------------------------------------------------------
   Icons
------------------------------------------------------------------ */
function getIconClass(name, type) {
    if (type === 'folder') return 'icon-folder';
    const ext = (name.split('.').pop() || '').toLowerCase();
    if (ext === 'html' || ext === 'htm') return 'icon-html';
    if (ext === 'css') return 'icon-css';
    if (ext === 'js') return 'icon-js';
    if (ext === 'json') return 'icon-json';
    if (ext === 'md') return 'icon-md';
    if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) return 'icon-image';
    return 'icon-unknown';
}

/* ---------------------------------------------------------------
   Touch support
   FIX: original only listened for `contextmenu` (right-click), which
   doesn't exist on touch devices — file rename/delete/"Go Live" were
   completely unreachable on a tablet. Long-press now triggers the
   same menus everywhere a right-click did.
------------------------------------------------------------------ */
function attachLongPress(el, handler) {
    let timer = null;
    let startX = 0, startY = 0;
    const THRESHOLD_MS = 480;
    const MOVE_TOLERANCE = 10;

    el.addEventListener('touchstart', (e) => {
        const touch = e.touches[0];
        startX = touch.clientX; startY = touch.clientY;
        el.classList.add('pressing');
        timer = setTimeout(() => {
            timer = null;
            el.classList.remove('pressing');
            if (navigator.vibrate) navigator.vibrate(12);
            handler(touch.clientX, touch.clientY);
        }, THRESHOLD_MS);
    }, { passive: true });

    el.addEventListener('touchmove', (e) => {
        const touch = e.touches[0];
        if (Math.abs(touch.clientX - startX) > MOVE_TOLERANCE || Math.abs(touch.clientY - startY) > MOVE_TOLERANCE) {
            clearTimeout(timer); timer = null;
            el.classList.remove('pressing');
        }
    }, { passive: true });

    ['touchend', 'touchcancel'].forEach(evt => {
        el.addEventListener(evt, () => {
            clearTimeout(timer); timer = null;
            el.classList.remove('pressing');
        });
    });
}

const editorElement = document.querySelector('.CodeMirror');
function triggerEditorMenu(clientX, clientY) {
    hideContextMenu();
    const liveOption = document.getElementById('edit-ctx-live');
    if (activeFileId) {
        const activeFile = findNode(activeFileId);
        const isHtml = activeFile && (activeFile.name.split('.').pop() || '').toLowerCase() === 'html';
        liveOption.style.display = isHtml ? 'flex' : 'none';
    }
    positionMenu(editorContextMenu, clientX, clientY);
}
document.querySelectorAll('.CodeMirror').forEach(el => {
    el.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); triggerEditorMenu(e.clientX, e.clientY); });
    attachLongPress(el, triggerEditorMenu);
});

function positionMenu(menuEl, x, y) {
    menuEl.style.display = 'flex';
    const rect = menuEl.getBoundingClientRect();
    const maxX = window.innerWidth - rect.width - 8;
    const maxY = window.innerHeight - rect.height - 8;
    menuEl.style.left = `${Math.min(x, Math.max(8, maxX))}px`;
    menuEl.style.top = `${Math.min(y, Math.max(8, maxY))}px`;
}

/* ---------------------------------------------------------------
   Tabs
------------------------------------------------------------------ */
function renderTabs() {
    tabsContainer.innerHTML = '';
    openTabs.forEach(id => {
        const node = findNode(id);
        if (!node) return;

        const tab = document.createElement('div');
        tab.className = `tab-item ${id === activeFileId ? 'active' : ''} ${id === secondaryFileId ? 'in-split' : ''}`;

        const label = document.createElement('span');
        label.textContent = node.name;
        label.addEventListener('click', () => selectFile(id));

        const splitBtn = document.createElement('span');
        splitBtn.className = 'tab-close';
        splitBtn.title = 'Open in split view';
        splitBtn.innerHTML = '⇄';
        splitBtn.addEventListener('click', (e) => { e.stopPropagation(); openInSplit(id); });

        const closeBtn = document.createElement('span');
        closeBtn.className = 'tab-close';
        closeBtn.innerHTML = '×';
        closeBtn.addEventListener('click', (e) => { e.stopPropagation(); closeTab(id); });

        tab.appendChild(label);
        tab.appendChild(splitBtn);
        tab.appendChild(closeBtn);
        tabsContainer.appendChild(tab);
    });
    localStorage.setItem('v_ide_tabs', JSON.stringify(openTabs));
    localStorage.setItem('v_ide_active_tab_id', activeFileId || '');
}

function closeTab(id) {
    openTabs = openTabs.filter(t => t !== id);
    if (activeFileId === id) activeFileId = openTabs.length ? openTabs[openTabs.length - 1] : null;
    if (secondaryFileId === id) closeSplitView();

    if (activeFileId) {
        selectFile(activeFileId);
    } else {
        cmInstance.setValue('');
        fileTitle.textContent = 'Vivid IDE Active';
        statusMode.textContent = 'Mode: Plain Text';
    }
    renderTabs();
    renderTree();
}

/* ---------------------------------------------------------------
   Split view
   FIX: the original shipped a fully-wired secondary CodeMirror
   instance with no button anywhere that could ever show it — dead
   code. Wired it to the tab's "⇄" action and a header toggle.
------------------------------------------------------------------ */
function openInSplit(id) {
    if (id === activeFileId && !splitViewMode) {
        // nothing else open — just mirror current file for now
    }
    splitViewMode = true;
    paneSecondary.style.display = 'flex';
    btnSplitToggle.classList.add('btn-accent');
    selectFile(id, true);
    setTimeout(() => cmSecondary.refresh(), 50);
    renderTabs();
}

function closeSplitView() {
    splitViewMode = false;
    secondaryFileId = null;
    paneSecondary.style.display = 'none';
    btnSplitToggle.classList.remove('btn-accent');
    setActivePane(false);
    renderTabs();
}

btnSplitToggle.addEventListener('click', () => {
    if (splitViewMode) {
        closeSplitView();
        return;
    }
    // Prefer another already-open tab; otherwise mirror the active file
    const candidate = openTabs.find(id => id !== activeFileId) || activeFileId;
    if (!candidate) return;
    openInSplit(candidate);
});

/* ---------------------------------------------------------------
   Tree rendering
------------------------------------------------------------------ */
function renderTree() {
    explorerRoot.innerHTML = '';
    fsData.root.children.forEach(child => explorerRoot.appendChild(createDOMNode(child)));
}

function createDOMNode(node) {
    const container = document.createElement('div');
    const item = document.createElement('div');
    item.className = `tree-item ${node.type === 'folder' ? 'tree-folder' : 'tree-file'}`;
    if (node.id === activeFileId) item.classList.add('active');
    item.dataset.id = node.id;

    const icon = document.createElement('span');
    icon.className = `ide-icon ${getIconClass(node.name, node.type)}`;

    const label = document.createElement('span');
    label.textContent = node.name;
    label.style.overflow = 'hidden';
    label.style.textOverflow = 'ellipsis';
    label.style.whiteSpace = 'nowrap';

    item.appendChild(icon);
    item.appendChild(label);
    container.appendChild(item);

    const openMenuHere = (x, y) => { showContextMenu(x, y, node.id); };

    if (node.type === 'folder') {
        const plusBtn = document.createElement('span');
        plusBtn.className = 'folder-plus-trigger';
        plusBtn.textContent = '➕';
        plusBtn.addEventListener('click', (e) => {
            e.stopPropagation(); e.preventDefault();
            hideContextMenu();
            const rect = plusBtn.getBoundingClientRect();
            openMenuHere(rect.left, rect.bottom);
        });
        item.appendChild(plusBtn);

        const childrenContainer = document.createElement('div');
        childrenContainer.className = 'folder-children';
        if (node.collapsed) childrenContainer.classList.add('collapsed');
        node.children.forEach(child => childrenContainer.appendChild(createDOMNode(child)));
        container.appendChild(childrenContainer);

        item.addEventListener('click', () => {
            node.collapsed = !node.collapsed;
            childrenContainer.classList.toggle('collapsed');
            queueAutosave();
        });
    } else {
        item.addEventListener('click', () => selectFile(node.id));
    }

    item.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); hideContextMenu(); openMenuHere(e.clientX, e.clientY); });
    attachLongPress(item, (x, y) => openMenuHere(x, y));

    return container;
}

/* ---------------------------------------------------------------
   File selection / asset preview
   FIX: broken/missing image content used to silently fall back to a
   random remote stock photo (misleading, and dead offline). Now
   shows an explicit "can't preview" state.
------------------------------------------------------------------ */
function selectFile(id, isSecondary = false) {
    const file = findNode(id);
    if (!file) return;

    if (!isSecondary) {
        activeFileId = id;
        if (!openTabs.includes(id)) openTabs.push(id);
    } else {
        secondaryFileId = id;
    }

    const ext = (file.name.split('.').pop() || '').toLowerCase();
    let targetMode = "htmlmixed";
    if (ext === "js") targetMode = "javascript";
    if (ext === "css") targetMode = "css";
    if (ext === "json") targetMode = "javascript";

    const targetPane = isSecondary ? paneSecondary : document.getElementById('pane-primary');
    const targetInstance = isSecondary ? cmSecondary : cmInstance;
    const cmWrapper = targetPane.querySelector('.CodeMirror');

    const oldPreview = targetPane.querySelector('.asset-preview-container');
    if (oldPreview) oldPreview.remove();

    if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) {
        cmWrapper.style.display = 'none';

        const hasValidImage = typeof file.content === 'string' && file.content.startsWith('data:image');
        const previewElement = document.createElement('div');
        previewElement.className = 'asset-preview-container';
        previewElement.innerHTML = hasValidImage
            ? `<div class="asset-preview-card">
                    <img src="${file.content}" alt="${file.name}">
                    <div class="asset-info-grid">
                        <p><strong>Name:</strong> ${file.name}</p>
                        <p><strong>Type:</strong> Image/${ext.toUpperCase()}</p>
                    </div>
               </div>`
            : `<div class="asset-preview-card">
                    <div class="asset-broken-badge">⚠ No image data</div>
                    <div class="asset-info-grid"><p><strong>Name:</strong> ${file.name}</p></div>
               </div>`;
        targetPane.appendChild(previewElement);
    } else {
        cmWrapper.style.display = 'block';
        targetInstance.setOption("mode", targetMode);
        targetInstance.setValue(file.content || '');
    }

    if (!isSecondary) {
        fileTitle.textContent = file.name;
        statusMode.textContent = `Mode: ${ext.toUpperCase()}`;
        document.querySelectorAll('.tree-item').forEach(el => el.classList.remove('active'));
        const activeEl = document.querySelector(`[data-id="${id}"]`);
        if (activeEl) activeEl.classList.add('active');
        queueAutosave();
        renderTabs();
        if (liveServerActive) queueLiveUpdate();
    }
}

/* ---------------------------------------------------------------
   Create / rename / delete
------------------------------------------------------------------ */
async function createNewItem(type, parentId = 'root') {
    const defaultName = type === 'file' ? 'index.html' : 'components';
    const name = await openCustomModal(
        `New ${type === 'folder' ? 'Folder' : 'File'}`,
        'Enter a name:',
        defaultName,
        false,
        (val) => validateName(val, parentId)
    );
    if (!name) return;

    const targetParent = findNode(parentId);
    if (!targetParent) return;

    const newItem = { id: generateId(), type, name: name.trim(), ...(type === 'folder' ? { children: [], collapsed: false } : { content: '' }) };
    targetParent.children.push(newItem);
    queueAutosave();
    renderTree();
    if (type === 'file') selectFile(newItem.id);
}

/* ---------------------------------------------------------------
   Context menus
------------------------------------------------------------------ */
function showContextMenu(x, y, itemId) {
    rightClickedItemId = itemId;
    const targetNode = findNode(itemId);
    if (!targetNode) return;
    const newFileOption = document.getElementById('ctx-new-file');
    const importImageOption = document.getElementById('ctx-import-image');
    const liveOption = document.getElementById('ctx-live');

    newFileOption.style.display = targetNode.type === 'file' ? 'none' : 'flex';
    importImageOption.style.display = targetNode.type === 'file' ? 'none' : 'flex';

    const isHtml = targetNode.type === 'file' && (targetNode.name.split('.').pop() || '').toLowerCase() === 'html';
    liveOption.style.display = isHtml ? 'flex' : 'none';

    positionMenu(contextMenu, x, y);
}

function hideContextMenu() {
    contextMenu.style.display = 'none';
    editorContextMenu.style.display = 'none';
}

document.getElementById('btn-new-folder').addEventListener('click', () => createNewItem('folder', 'root'));
document.getElementById('btn-new-file').addEventListener('click', () => createNewItem('file', 'root'));

document.getElementById('btn-save').addEventListener('click', () => {
    if (activeFileId) {
        const file = findNode(activeFileId);
        if (file) file.content = cmInstance.getValue();
    }
    if (secondaryFileId) {
        const fileSec = findNode(secondaryFileId);
        if (fileSec) fileSec.content = cmSecondary.getValue();
    }
    saveToStorage();
});

document.getElementById('ctx-new-file').addEventListener('click', () => { createNewItem('file', rightClickedItemId); hideContextMenu(); });

document.getElementById('ctx-import-image').addEventListener('click', () => {
    document.getElementById('vivid-image-device-hook').click();
    hideContextMenu();
});

document.getElementById('vivid-image-device-hook').addEventListener('change', function (e) {
    const uploadedFile = e.target.files[0];
    if (!uploadedFile || !rightClickedItemId) return;

    const targetDirectory = findNode(rightClickedItemId);
    if (!targetDirectory || targetDirectory.type !== 'folder') return;

    // Guard: warn before importing something that will likely blow the
    // localStorage quota (base64 inflates size ~33%).
    if (uploadedFile.size > 2 * 1024 * 1024) {
        openCustomModal(
            'Large image',
            `"${uploadedFile.name}" is ${(uploadedFile.size / (1024 * 1024)).toFixed(1)}MB. Storing it as base64 in browser storage may fail or evict other files. Continue anyway?`,
            '',
            true
        ).then((confirmed) => {
            if (confirmed) importImageFile(uploadedFile, targetDirectory);
            e.target.value = '';
        });
        return;
    }
    importImageFile(uploadedFile, targetDirectory);
    e.target.value = '';
});

function importImageFile(uploadedFile, targetDirectory) {
    const reader = new FileReader();
    reader.readAsDataURL(uploadedFile);
    reader.onload = function (event) {
        const newAssetNode = { id: generateId(), type: 'file', name: uploadedFile.name, content: event.target.result };
        targetDirectory.children.push(newAssetNode);
        const ok = saveToStorage();
        renderTree();
        selectFile(newAssetNode.id);
        if (!ok) {
            openCustomModal('Save failed', 'The image was added to this session but could not be saved to local storage (likely full). Consider removing other large files.', '', true);
        }
    };
    reader.onerror = function () {
        openCustomModal('Import failed', `Could not read "${uploadedFile.name}".`, '', true);
    };
}

document.getElementById('ctx-live').addEventListener('click', () => { selectFile(rightClickedItemId); toggleLiveServer(); hideContextMenu(); });

document.getElementById('ctx-rename').addEventListener('click', async () => {
    const targetNode = findNode(rightClickedItemId);
    if (targetNode) {
        const parent = findParent(rightClickedItemId);
        const newName = await openCustomModal(
            'Rename', 'Enter a new name for this asset:', targetNode.name, false,
            (val) => validateName(val, parent ? parent.id : 'root', rightClickedItemId)
        );
        if (newName) {
            targetNode.name = newName.trim();
            if (activeFileId === rightClickedItemId) fileTitle.textContent = newName.trim();
            queueAutosave(); renderTree(); renderTabs();
        }
    }
    hideContextMenu();
});

document.getElementById('ctx-delete').addEventListener('click', async () => {
    if (await openCustomModal('Confirm Delete', 'Are you sure you want to permanently delete this item?', '', true)) {
        const removedIds = deleteNode(rightClickedItemId);
        removedIds.forEach(id => {
            openTabs = openTabs.filter(t => t !== id);
            if (secondaryFileId === id) closeSplitView();
        });
        if (removedIds.includes(activeFileId)) {
            activeFileId = openTabs.length ? openTabs[openTabs.length - 1] : null;
        }
        queueAutosave();
        if (activeFileId) selectFile(activeFileId);
        else { cmInstance.setValue(''); fileTitle.textContent = 'Vivid IDE Active'; }
        renderTabs();
        renderTree();
    }
    hideContextMenu();
});

document.getElementById('edit-ctx-copy').addEventListener('click', () => { document.execCommand('copy'); hideContextMenu(); });
document.getElementById('edit-ctx-cut').addEventListener('click', () => { document.execCommand('cut'); hideContextMenu(); });
document.getElementById('edit-ctx-selectall').addEventListener('click', () => { (activePaneIsSecondary ? cmSecondary : cmInstance).execCommand('selectAll'); hideContextMenu(); });
document.getElementById('edit-ctx-live').addEventListener('click', () => { toggleLiveServer(); hideContextMenu(); });
document.getElementById('edit-ctx-paste').addEventListener('click', async () => {
    try {
        const text = await navigator.clipboard.readText();
        (activePaneIsSecondary ? cmSecondary : cmInstance).replaceSelection(text);
    } catch (err) {
        console.warn('Clipboard read blocked by browser permissions.', err);
    }
    hideContextMenu();
});

/* ---------------------------------------------------------------
   Command palette
------------------------------------------------------------------ */
const commandsList = [
    { name: "Switch Theme", desc: "Toggle between workspace Dark/Light profiles", action: () => themeToggleBtn.click() },
    { name: "Go Live", desc: "Toggle interactive live preview window", action: () => toggleLiveServer() },
    { name: "Toggle Split View", desc: "Show/hide the second editor pane", action: () => btnSplitToggle.click() },
    { name: "New File", desc: "Create a new file in the workspace root", action: () => createNewItem('file', 'root') },
    { name: "New Folder", desc: "Create a new folder in the workspace root", action: () => createNewItem('folder', 'root') },
    { name: "Save Workspace", desc: "Persist all open files to local storage", action: () => document.getElementById('btn-save').click() },
    { name: "Clear Editor", desc: "Clear the active editor's content", action: () => cmInstance.setValue('') },
    { name: "Toggle Sidebar", desc: "Show or hide the file explorer", action: () => btnSidebarToggle.click() }
];

let selectedCmdIndex = 0;

function showCommandPalette() {
    cmdPalette.style.display = 'flex';
    cmdInput.value = '';
    cmdInput.focus();
    selectedCmdIndex = 0;
    renderCommandItems(commandsList);
}
function hideCommandPalette() { cmdPalette.style.display = 'none'; }

function renderCommandItems(filteredList) {
    cmdResults.innerHTML = '';
    if (filteredList.length === 0) {
        cmdResults.innerHTML = `<div style="padding:12px; font-size:13px; color:var(--text-muted);">No actions found matching search term.</div>`;
        return;
    }
    filteredList.forEach((cmd, index) => {
        const row = document.createElement('div');
        row.className = `cmd-item ${index === selectedCmdIndex ? 'selected' : ''}`;
        row.innerHTML = `<strong>&gt; ${cmd.name}</strong> <span>${cmd.desc}</span>`;
        row.addEventListener('click', () => { cmd.action(); hideCommandPalette(); });
        cmdResults.appendChild(row);
    });
}

function filteredCommands() {
    const term = cmdInput.value.toLowerCase();
    return commandsList.filter(c => c.name.toLowerCase().includes(term) || c.desc.toLowerCase().includes(term));
}

cmdInput.addEventListener('input', () => { selectedCmdIndex = 0; renderCommandItems(filteredCommands()); });

cmdInput.addEventListener('keydown', (e) => {
    const matches = filteredCommands();
    if (e.key === 'ArrowDown') { e.preventDefault(); selectedCmdIndex = (selectedCmdIndex + 1) % matches.length; renderCommandItems(matches); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); selectedCmdIndex = (selectedCmdIndex - 1 + matches.length) % matches.length; renderCommandItems(matches); }
    else if (e.key === 'Enter') { if (matches[selectedCmdIndex]) { matches[selectedCmdIndex].action(); hideCommandPalette(); } }
    else if (e.key === 'Escape') { hideCommandPalette(); }
});

window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        if (cmdPalette.style.display === 'flex') hideCommandPalette(); else showCommandPalette();
    }
});
cmdPalette.addEventListener('click', (e) => { if (e.target === cmdPalette) hideCommandPalette(); });

// FIX: no on-screen way to reach the command palette without a keyboard —
// tapping the file-title pill now opens it too (tablet-friendly entry point).
fileTitle.style.cursor = 'pointer';
fileTitle.addEventListener('click', showCommandPalette);

window.addEventListener('click', hideContextMenu);
window.addEventListener('blur', hideContextMenu);

/* ---------------------------------------------------------------
   Boot
------------------------------------------------------------------ */
renderTree();
renderTabs();
if (activeFileId && findNode(activeFileId)) {
    selectFile(activeFileId);
} else {
    activeFileId = null;
}
setSyncStatus(true);
