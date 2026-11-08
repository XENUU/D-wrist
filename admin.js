/* ==========================================================================
   D-wrist — Studio paroles (admin)
   --------------------------------------------------------------------------
   Permet d'écrire les paroles d'un morceau, de les caler en rythme en
   tapant une touche au bon moment, puis de les enregistrer directement
   dans tracks.js (ou de copier / télécharger le code LRC).

   Les brouillons sont sauvegardés automatiquement dans le navigateur
   (localStorage), donc rien n'est perdu en cas de fermeture de l'onglet.

   1. Utilitaires & état
   2. Conversion texte ⇄ lignes ⇄ LRC
   3. Brouillons
   4. Onglets & choix du morceau
   5. Synchro (TAP, annuler, ajuster)
   6. Lecteur audio
   7. Enregistrement (tracks.js, copier, télécharger)
   8. Clavier & démarrage
   ========================================================================== */

(function () {
  'use strict';

  /* ========================================================================
     1. UTILITAIRES & ÉTAT
     ======================================================================== */

  const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
  const TRACK_LIST = (typeof TRACKS !== 'undefined' && Array.isArray(TRACKS)) ? TRACKS : [];
  const DRAFT_KEY = 'dwrist-lyrics-draft:';
  const SPEEDS = [1, 0.75, 0.5];

  const $ = (sel) => document.querySelector(sel);
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const round2 = (t) => Math.round(t * 100) / 100;

  const dom = {
    app: $('#app'),
    trackSelect: $('#trackSelect'),
    tabs: document.querySelectorAll('.adm-tab'),
    panes: document.querySelectorAll('.pane'),
    status: $('#status'),
    statusText: $('#statusText'),
    resetBtn: $('#resetBtn'),
    text: $('#lyricsText'),
    lineCount: $('#lineCount'),
    rows: $('#rows'),
    rowsEmpty: $('#rowsEmpty'),
    saveSummary: $('#saveSummary'),
    saveFileBtn: $('#saveFileBtn'),
    copyBtn: $('#copyBtn'),
    downloadBtn: $('#downloadBtn'),
    saveNote: $('#saveNote'),
    lrcOut: $('#lrcOut'),
    fileInput: $('#fileInput'),
    progress: $('#tpProgress'),
    fill: $('#tpFill'),
    thumb: $('#tpThumb'),
    marks: $('#tpMarks'),
    time: $('#tpTime'),
    total: $('#tpTotal'),
    playBtn: $('#playBtn'),
    rewBtn: $('#rewBtn'),
    fwdBtn: $('#fwdBtn'),
    speedBtn: $('#speedBtn'),
    tapBtn: $('#tapBtn'),
    tapNext: $('#tapNext'),
    toast: $('#toast'),
    audio: $('#audio'),
  };
  const audio = dom.audio;

  const state = {
    index: -1,         // morceau sélectionné
    tab: 'text',
    lines: [],         // [{ text: string ('' = pause ♪), time: number | null }]
    siteLines: [],     // version actuellement dans tracks.js
    cursor: 0,         // prochaine ligne à caler
    playing: -1,       // ligne en cours de lecture (aperçu)
    rowEls: [],
    speed: 0,
  };

  /** 75.3 → "1:15.30" */
  function formatStamp(t) {
    const cs = Math.max(0, Math.round(t * 100));
    const m = Math.floor(cs / 6000);
    const s = Math.floor((cs % 6000) / 100);
    const c = cs % 100;
    return `${m}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
  }

  /** 75.3 → "01:15.30" (format LRC) */
  function formatLRCStamp(t) {
    const cs = Math.max(0, Math.round(t * 100));
    const m = Math.floor(cs / 6000);
    const s = Math.floor((cs % 6000) / 100);
    const c = cs % 100;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
  }

  function formatShort(t) {
    if (!isFinite(t)) return '0:00';
    return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  }

  let toastTimer = 0;
  function toast(message) {
    dom.toast.textContent = message;
    dom.toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => dom.toast.classList.remove('is-visible'), 2800);
  }

  const currentTrack = () => TRACK_LIST[state.index];
  const stampedCount = () => state.lines.filter((l) => l.time !== null).length;

  /* ========================================================================
     2. CONVERSION TEXTE ⇄ LIGNES ⇄ LRC
     ======================================================================== */

  /** Paroles LRC (tracks.js) → lignes éditables */
  function lrcToLines(lrc) {
    if (!lrc || !lrc.trim()) return [];
    const out = [];
    const lineRe = /^\s*((?:\[\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?\]\s*)+)(.*)$/;
    const stampRe = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
    lrc.split(/\r?\n/).forEach((raw) => {
      const m = raw.match(lineRe);
      if (!m) {
        // Ligne sans timestamp (hors métadonnées [ti:]...) : on la garde à caler
        const plain = raw.trim();
        if (plain && !/^\[[a-z]+:.*\]$/i.test(plain)) out.push({ text: plain, time: null });
        return;
      }
      let s;
      stampRe.lastIndex = 0;
      while ((s = stampRe.exec(m[1]))) {
        const frac = s[3] ? Number(s[3]) / Math.pow(10, s[3].length) : 0;
        out.push({ text: m[2].trim(), time: round2(Number(s[1]) * 60 + Number(s[2]) + frac) });
      }
    });
    // Tri par temps (les lignes non calées restent à leur place relative)
    const timed = out.filter((l) => l.time !== null).sort((a, b) => a.time - b.time);
    const merged = out.some((l) => l.time === null) ? out : timed;
    return normalizeGaps(merged);
  }

  /** Supprime les pauses en début/fin et les pauses consécutives */
  function normalizeGaps(lines) {
    const out = [];
    lines.forEach((l) => {
      if (!l.text && (!out.length || !out[out.length - 1].text)) return;
      out.push(l);
    });
    while (out.length && !out[out.length - 1].text) out.pop();
    return out;
  }

  const linesToText = (lines) => lines.map((l) => l.text).join('\n');

  /**
   * Texte de l'éditeur → lignes, en conservant au mieux les temps déjà
   * calés : une ligne inchangée garde son temps, une ligne modifiée aussi,
   * une ligne ajoutée arrive sans temps.
   */
  function textToLines(text, old) {
    const texts = [];
    text.replace(/\r/g, '').split('\n').forEach((raw) => {
      const t = raw.trim();
      if (t) texts.push(t);
      else if (texts.length && texts[texts.length - 1] !== '') texts.push('');
    });
    while (texts.length && texts[texts.length - 1] === '') texts.pop();

    let j = 0;
    return texts.map((t, i) => {
      // 1) même texte un peu plus loin → on le retrouve
      for (let k = j; k < Math.min(old.length, j + 6); k++) {
        if (old[k].text === t) { j = k + 1; return { text: t, time: old[k].time }; }
      }
      if (j < old.length) {
        // 2) la ligne suivante correspond à l'ancienne → ligne insérée
        if (texts[i + 1] !== undefined && texts[i + 1] === old[j].text) return { text: t, time: null };
        // 3) sinon → ligne modifiée, elle garde son temps
        if (Boolean(old[j].text) === Boolean(t)) { const time = old[j].time; j++; return { text: t, time }; }
      }
      return { text: t, time: null };
    });
  }

  /** Lignes → code LRC (seules les lignes calées sont exportées) */
  function linesToLRC(lines) {
    return lines
      .filter((l) => l.time !== null)
      .slice()
      .sort((a, b) => a.time - b.time)
      .map((l) => `[${formatLRCStamp(l.time)}]${l.text}`)
      .join('\n');
  }

  const sameLines = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  /* ========================================================================
     3. BROUILLONS (localStorage)
     ======================================================================== */

  function loadDraft(id) {
    try {
      const raw = localStorage.getItem(DRAFT_KEY + id);
      const data = raw ? JSON.parse(raw) : null;
      return data && Array.isArray(data.lines) ? data.lines : null;
    } catch (_) { return null; }
  }

  function saveDraft() {
    const track = currentTrack();
    if (!track) return;
    try {
      if (sameLines(state.lines, state.siteLines)) localStorage.removeItem(DRAFT_KEY + track.id);
      else localStorage.setItem(DRAFT_KEY + track.id, JSON.stringify({ lines: state.lines, at: Date.now() }));
    } catch (_) { /* stockage indisponible : tant pis */ }
    updateStatus();
  }

  function updateStatus() {
    const dirty = !sameLines(state.lines, state.siteLines);
    dom.status.hidden = !dirty;
    if (dirty) {
      dom.statusText.textContent = state.siteLines.length
        ? 'Modifications pas encore enregistrées dans le site.'
        : 'Brouillon pas encore enregistré dans le site.';
    }
  }

  /* ========================================================================
     4. ONGLETS & CHOIX DU MORCEAU
     ======================================================================== */

  function setTab(name) {
    flushText();
    if (name === state.tab) return;
    state.tab = name;
    dom.app.dataset.tab = name;
    dom.tabs.forEach((t) => t.classList.toggle('is-active', t.dataset.tab === name));
    dom.panes.forEach((p) => p.classList.toggle('is-active', p.dataset.pane === name));
    if (document.activeElement === dom.text && name !== 'text') dom.text.blur();
    if (name === 'sync') requestAnimationFrame(() => scrollToRow(state.cursor, false));
    if (name === 'save') renderSave();
  }

  function fillTrackSelect() {
    dom.trackSelect.innerHTML = '';
    TRACK_LIST.forEach((t, i) => {
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = t.title;
      dom.trackSelect.appendChild(o);
    });
  }

  function selectTrack(i) {
    const track = TRACK_LIST[i];
    if (!track) return;
    state.index = i;
    dom.trackSelect.value = String(i);
    try { history.replaceState(null, '', '#' + encodeURIComponent(track.id)); } catch (_) { /* file:// */ }
    document.title = `${track.title} — Studio paroles`;

    // Audio
    audio.pause();
    if (track.audio) audio.src = track.audio;
    else { audio.removeAttribute('src'); audio.load(); }
    audio.playbackRate = SPEEDS[state.speed];

    // Paroles : brouillon local s'il existe, sinon la version du site
    state.siteLines = lrcToLines(track.lyrics);
    const draft = loadDraft(track.id);
    state.lines = draft || state.siteLines.map((l) => ({ ...l }));
    state.cursor = firstUnstamped();
    state.playing = -1;

    dom.text.value = linesToText(state.lines);
    updateLineCount();
    renderRows();
    renderProgress();
    updateStatus();
    if (state.tab === 'save') renderSave();
    if (draft) toast('Brouillon restauré');
  }

  function firstUnstamped() {
    const i = state.lines.findIndex((l) => l.time === null);
    return i === -1 ? state.lines.length : i;
  }

  function updateLineCount() {
    const n = state.lines.filter((l) => l.text).length;
    dom.lineCount.textContent = `${n} ligne${n > 1 ? 's' : ''}`;
  }

  /* ---- Éditeur de texte ---- */
  let textTimer = 0;
  function applyText() {
    clearTimeout(textTimer);
    textTimer = 0;
    state.lines = textToLines(dom.text.value, state.lines);
    state.cursor = firstUnstamped();
    updateLineCount();
    renderRows();
    saveDraft();
  }
  function onTextInput() {
    clearTimeout(textTimer);
    textTimer = setTimeout(applyText, 250);
  }
  /** Applique tout de suite une saisie en attente (changement d'onglet / de morceau) */
  function flushText() {
    if (textTimer) applyText();
  }

  /* ========================================================================
     5. SYNCHRO
     ======================================================================== */

  function renderRows() {
    const frag = document.createDocumentFragment();
    state.rowEls = state.lines.map((line, i) => {
      const li = document.createElement('li');
      li.className = 'row';
      li.dataset.i = i;
      li.innerHTML =
        '<button class="row-time" type="button" tabindex="-1"></button>' +
        '<span class="row-text"></span>' +
        '<span class="row-nudge">' +
          '<button type="button" tabindex="-1" data-nudge="-0.1" aria-label="Plus tôt de 0,1 s">−</button>' +
          '<button type="button" tabindex="-1" data-nudge="0.1" aria-label="Plus tard de 0,1 s">+</button>' +
        '</span>' +
        '<span class="row-flash"></span>';
      li.querySelector('.row-text').textContent = line.text || '♪';
      li.classList.toggle('is-gap', !line.text);
      frag.appendChild(li);
      return li;
    });
    dom.rows.textContent = '';
    dom.rows.appendChild(frag);
    dom.rowsEmpty.hidden = state.lines.length > 0;
    state.rowEls.forEach((_, i) => updateRow(i));
    updateCursor(state.cursor);
    state.playing = -1;
    updatePlaying(true);
    renderMarks();
  }

  /** Met à jour l'affichage du temps d'une ligne + avertissement d'ordre */
  function updateRow(i) {
    const el = state.rowEls[i];
    const line = state.lines[i];
    if (!el || !line) return;
    el.classList.toggle('is-stamped', line.time !== null);
    el.querySelector('.row-time').textContent = line.time !== null ? formatStamp(line.time) : '–:––.––';
    // Temps plus petit qu'une ligne précédente → on le signale
    let prev = null;
    for (let k = i - 1; k >= 0; k--) if (state.lines[k].time !== null) { prev = state.lines[k].time; break; }
    el.classList.toggle('is-warn', line.time !== null && prev !== null && line.time < prev);
  }

  function refreshWarnings() {
    state.rowEls.forEach((_, i) => updateRow(i));
  }

  function updateCursor(i, scroll = false) {
    state.cursor = clamp(i, 0, state.lines.length);
    state.rowEls.forEach((el, k) => el.classList.toggle('is-cursor', k === state.cursor));
    const next = state.lines[state.cursor];
    dom.tapNext.textContent = next
      ? (next.text || '♪ pause instrumentale')
      : (state.lines.length ? 'Toutes les lignes sont calées ✓' : 'Écris d\'abord les paroles');
    if (scroll) scrollToRow(state.cursor, true);
  }

  function scrollToRow(i, smooth) {
    const el = state.rowEls[Math.min(i, state.rowEls.length - 1)];
    if (!el || state.tab !== 'sync') return;
    const list = dom.rows;
    const top = el.offsetTop - list.clientHeight * 0.35;
    list.scrollTo({ top: Math.max(0, top), behavior: smooth ? 'smooth' : 'auto' });
  }

  function flashRow(i) {
    const el = state.rowEls[i];
    if (!el) return;
    el.querySelector('.row-flash').animate(
      [{ opacity: 0.35 }, { opacity: 0 }],
      { duration: 500, easing: EASE }
    );
  }

  /** TAP : cale la ligne courante sur le temps actuel et passe à la suivante */
  function stamp() {
    if (!state.lines.length) { toast('Écris d\'abord les paroles dans l\'onglet Texte'); return; }
    if (state.cursor >= state.lines.length) { toast('Toutes les lignes sont calées ✓'); return; }
    const i = state.cursor;
    state.lines[i].time = round2(audio.currentTime);
    refreshWarnings();
    flashRow(i);
    updateCursor(i + 1, true);
    renderMarks();
    saveDraft();
    tapFeedback();
  }

  function tapFeedback() {
    dom.tapBtn.animate(
      [{ transform: 'scale(0.96)' }, { transform: 'scale(1)' }],
      { duration: 300, easing: EASE }
    );
  }

  /** Retour arrière : efface la dernière ligne calée et réécoute un peu avant */
  function undoStamp() {
    if (state.cursor <= 0) return;
    const i = state.cursor - 1;
    state.lines[i].time = null;
    refreshWarnings();
    updateCursor(i, true);
    // On revient juste avant la ligne précédente pour retaper au bon moment
    let prev = null;
    for (let k = i - 1; k >= 0; k--) if (state.lines[k].time !== null) { prev = state.lines[k].time; break; }
    seekTo(prev !== null ? prev : Math.max(0, audio.currentTime - 3));
    renderMarks();
    saveDraft();
  }

  function nudge(i, delta) {
    const line = state.lines[i];
    if (!line || line.time === null) return;
    line.time = round2(Math.max(0, line.time + delta));
    refreshWarnings();
    renderMarks();
    saveDraft();
    // Réécoute immédiate pour vérifier
    seekTo(Math.max(0, line.time - 0.6));
    if (audio.paused) play();
  }

  /** Aperçu en direct : met en valeur la ligne en train d'être chantée */
  function updatePlaying(force = false) {
    const t = audio.currentTime + 0.05;
    let idx = -1;
    let best = -Infinity;
    state.lines.forEach((l, k) => {
      if (l.time !== null && l.time <= t && l.time >= best) { best = l.time; idx = k; }
    });
    if (idx === state.playing && !force) return;
    if (state.rowEls[state.playing]) state.rowEls[state.playing].classList.remove('is-playing');
    state.playing = idx;
    if (state.rowEls[idx]) state.rowEls[idx].classList.add('is-playing');
  }

  function initRows() {
    dom.rows.addEventListener('click', (e) => {
      const row = e.target.closest('.row');
      if (!row) return;
      const i = Number(row.dataset.i);
      const nudgeBtn = e.target.closest('[data-nudge]');
      if (nudgeBtn) { nudge(i, Number(nudgeBtn.dataset.nudge)); return; }

      const line = state.lines[i];
      if (e.target.closest('.row-time') && line.time !== null) {
        // Réécouter depuis cette ligne
        seekTo(Math.max(0, line.time - 0.4));
        if (audio.paused) play();
        return;
      }
      // Choisir cette ligne comme prochaine à caler
      updateCursor(i);
    });
  }

  /* ========================================================================
     6. LECTEUR AUDIO
     ======================================================================== */

  let loopRaf = 0;
  let seeking = false;
  let lastTimeText = '';

  function play() {
    if (!audio.getAttribute('src')) { toast('Aucun fichier audio pour ce morceau'); return; }
    const p = audio.play();
    if (p && p.catch) p.catch(() => updatePlayButton());
  }
  function togglePlay() { if (audio.paused) play(); else audio.pause(); }

  function seekTo(t) {
    if (!isFinite(audio.duration)) { try { audio.currentTime = t; } catch (_) { /* rien */ } return; }
    audio.currentTime = clamp(t, 0, audio.duration);
    renderProgress();
    updatePlaying();
  }
  const seekBy = (d) => seekTo(audio.currentTime + d);

  function updatePlayButton() {
    dom.playBtn.classList.toggle('is-playing', !audio.paused);
    dom.playBtn.setAttribute('aria-label', audio.paused ? 'Lecture' : 'Pause');
  }

  function renderProgress(t = audio.currentTime) {
    const d = audio.duration;
    const r = isFinite(d) && d > 0 ? clamp(t / d, 0, 1) : 0;
    dom.fill.style.transform = `scaleX(${r.toFixed(5)})`;
    dom.thumb.style.transform = `translateX(${(r * 100).toFixed(3)}%)`;
    const text = formatStamp(t);
    if (text !== lastTimeText) { lastTimeText = text; dom.time.textContent = text; }
  }

  /** Repères des lignes calées sur la barre de progression */
  function renderMarks() {
    const d = audio.duration;
    dom.marks.textContent = '';
    if (!isFinite(d) || d <= 0) return;
    const frag = document.createDocumentFragment();
    state.lines.forEach((l) => {
      if (l.time === null) return;
      const s = document.createElement('span');
      s.className = 'tp-mark';
      s.style.left = (clamp(l.time / d, 0, 1) * 100).toFixed(3) + '%';
      frag.appendChild(s);
    });
    dom.marks.appendChild(frag);
  }

  function loop() {
    if (!seeking) renderProgress();
    updatePlaying();
    loopRaf = audio.paused ? 0 : requestAnimationFrame(loop);
  }

  function initAudio() {
    audio.addEventListener('play', () => { updatePlayButton(); if (!loopRaf) loopRaf = requestAnimationFrame(loop); });
    audio.addEventListener('pause', updatePlayButton);
    audio.addEventListener('seeked', () => { renderProgress(); updatePlaying(); });
    audio.addEventListener('timeupdate', () => { if (!loopRaf) { renderProgress(); updatePlaying(); } });
    audio.addEventListener('durationchange', () => {
      dom.total.textContent = ' / ' + formatShort(audio.duration);
      renderMarks();
    });
    audio.addEventListener('error', () => {
      const t = currentTrack();
      if (t && audio.getAttribute('src')) toast(`Fichier audio introuvable : ${t.audio}`);
    });

    dom.playBtn.addEventListener('click', togglePlay);
    dom.rewBtn.addEventListener('click', () => seekBy(-2));
    dom.fwdBtn.addEventListener('click', () => seekBy(2));
    dom.speedBtn.addEventListener('click', () => {
      state.speed = (state.speed + 1) % SPEEDS.length;
      audio.playbackRate = SPEEDS[state.speed];
      dom.speedBtn.textContent = String(SPEEDS[state.speed]).replace('.', ',') + '×';
      dom.speedBtn.classList.toggle('is-slow', state.speed !== 0);
    });

    // TAP au pointerdown (plus réactif que le clic, surtout au doigt)
    dom.tapBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); stamp(); });

    // Barre de progression cliquable / draggable
    const ratio = (e) => {
      const r = dom.progress.getBoundingClientRect();
      return clamp((e.clientX - r.left) / r.width, 0, 1);
    };
    dom.progress.addEventListener('pointerdown', (e) => {
      if (!isFinite(audio.duration)) return;
      seeking = true;
      try { dom.progress.setPointerCapture(e.pointerId); } catch (_) { /* rien */ }
      renderProgress(ratio(e) * audio.duration);
    });
    dom.progress.addEventListener('pointermove', (e) => {
      if (seeking) renderProgress(ratio(e) * audio.duration);
    });
    const end = (e) => {
      if (!seeking) return;
      seeking = false;
      seekTo(ratio(e) * audio.duration);
    };
    dom.progress.addEventListener('pointerup', end);
    dom.progress.addEventListener('pointercancel', () => { seeking = false; renderProgress(); });
  }

  /* ========================================================================
     7. ENREGISTREMENT
     ======================================================================== */

  /** Rend le texte sûr dans une template string JavaScript */
  function sanitizeForTemplate(s) {
    return s.replace(/\\/g, '\\\\').replace(/`/g, '’').replace(/\$\{/g, '$ {');
  }

  function renderSave() {
    const total = state.lines.length;
    const done = stampedCount();
    const missing = total - done;
    const lrc = linesToLRC(state.lines);
    dom.lrcOut.textContent = lrc || '(rien à exporter pour le moment)';

    let html;
    if (!total) html = 'Pas encore de paroles pour ce morceau.';
    else if (!missing) html = `<b>${done}/${total} lignes calées</b> — tout est prêt ✓`;
    else html = `<b>${done}/${total} lignes calées.</b> ${missing} ligne${missing > 1 ? 's' : ''} sans temps ` +
      `ne ser${missing > 1 ? 'ont' : 'a'} pas enregistrée${missing > 1 ? 's' : ''} : termine-les dans l'onglet Synchro.`;
    dom.saveSummary.innerHTML = html;
    dom.saveNote.textContent = '';
  }

  /**
   * Remplace les paroles du morceau `id` dans le contenu de tracks.js,
   * sans toucher au reste du fichier (commentaires, autres morceaux...).
   */
  function replaceLyricsInSource(src, id, lrc) {
    if (!/const\s+TRACKS\s*=/.test(src)) throw new Error('Ce fichier n\'est pas tracks.js.');
    const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const idRe = new RegExp(`\\bid\\s*:\\s*["']${esc}["']`, 'g');
    const idMatch = idRe.exec(src);
    if (!idMatch) throw new Error(`Morceau « ${id} » introuvable dans tracks.js.`);

    const lyricsRe = /\blyrics\s*:\s*`/g;
    lyricsRe.lastIndex = idMatch.index;
    const lyricsMatch = lyricsRe.exec(src);
    const nextId = /\bid\s*:\s*["']/g;
    nextId.lastIndex = idRe.lastIndex;
    const next = nextId.exec(src);
    if (!lyricsMatch || (next && lyricsMatch.index > next.index)) {
      throw new Error(`Champ « lyrics » introuvable pour « ${id} ».`);
    }
    const open = lyricsMatch.index + lyricsMatch[0].length; // juste après le `
    const close = src.indexOf('`', open);
    if (close === -1) throw new Error('tracks.js semble mal formé (backtick manquant).');

    const body = lrc ? '\n' + sanitizeForTemplate(lrc) + '\n' : '';
    return src.slice(0, open) + body + src.slice(close);
  }

  /** Après un enregistrement réussi : le site contient maintenant ces paroles */
  function markSaved(lrc) {
    const track = currentTrack();
    track.lyrics = lrc ? '\n' + lrc + '\n' : '';
    state.siteLines = lrcToLines(track.lyrics);
    // Les lignes non calées ne sont pas dans le fichier : on les garde en brouillon
    saveDraft();
  }

  /* ---- Accès direct au fichier (Chrome / Edge) via File System Access ---- */
  function idbOpen() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('dwrist-admin', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function idbGet(key) {
    try {
      const db = await idbOpen();
      return await new Promise((res) => {
        const r = db.transaction('kv').objectStore('kv').get(key);
        r.onsuccess = () => res(r.result);
        r.onerror = () => res(undefined);
      });
    } catch (_) { return undefined; }
  }
  async function idbSet(key, value) {
    try {
      const db = await idbOpen();
      await new Promise((res) => {
        const tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').put(value, key);
        tx.oncomplete = res;
        tx.onerror = res;
      });
    } catch (_) { /* rien */ }
  }

  async function getTracksHandle() {
    let handle = await idbGet('tracksHandle');
    if (handle && handle.queryPermission) {
      let perm = await handle.queryPermission({ mode: 'readwrite' });
      if (perm !== 'granted') perm = await handle.requestPermission({ mode: 'readwrite' });
      if (perm === 'granted') return handle;
    }
    toast('Sélectionne le fichier tracks.js dans le dossier D-wrist');
    [handle] = await window.showOpenFilePicker({
      types: [{ description: 'tracks.js', accept: { 'text/javascript': ['.js'] } }],
      multiple: false,
    });
    await idbSet('tracksHandle', handle);
    return handle;
  }

  async function saveToFile() {
    const track = currentTrack();
    if (!track) return;
    const lrc = linesToLRC(state.lines);

    // Navigateurs sans accès direct aux fichiers (Safari, Firefox) → plan B
    if (!window.showOpenFilePicker) { dom.fileInput.value = ''; dom.fileInput.click(); return; }

    try {
      const handle = await getTracksHandle();
      const src = await (await handle.getFile()).text();
      const out = replaceLyricsInSource(src, track.id, lrc);
      const writable = await handle.createWritable();
      await writable.write(out);
      await writable.close();
      markSaved(lrc);
      toast('Enregistré dans tracks.js ✓');
      dom.saveNote.textContent =
        'C\'est enregistré dans tracks.js. Recharge le site pour voir le résultat. ' +
        'Pour le mettre en ligne : GitHub Desktop → Commit to main → Push origin.';
    } catch (err) {
      if (err && err.name === 'AbortError') return; // sélection annulée
      toast(err && err.message ? err.message : 'Enregistrement impossible');
    }
  }

  /* ---- Plan B : on lit tracks.js choisi, on télécharge la version modifiée ---- */
  function onFallbackFile() {
    const file = dom.fileInput.files && dom.fileInput.files[0];
    const track = currentTrack();
    if (!file || !track) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const lrc = linesToLRC(state.lines);
        const out = replaceLyricsInSource(String(reader.result), track.id, lrc);
        download('tracks.js', out, 'text/javascript');
        markSaved(lrc);
        dom.saveNote.textContent =
          'Un nouveau tracks.js a été téléchargé. Remplace l\'ancien fichier du dossier D-wrist par celui-ci ' +
          '(il est sûrement dans Téléchargements), puis recharge le site.';
      } catch (err) {
        toast(err.message || 'Fichier invalide');
      }
    };
    reader.readAsText(file);
  }

  function download(name, content, type) {
    const blob = new Blob([content], { type: type + ';charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function copyLRC() {
    const lrc = linesToLRC(state.lines);
    if (!lrc) { toast('Rien à copier pour le moment'); return; }
    try {
      await navigator.clipboard.writeText(lrc);
    } catch (_) {
      // Repli : sélection + copie à l'ancienne
      const ta = document.createElement('textarea');
      ta.value = lrc;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    toast('LRC copié ✓');
  }

  function initSave() {
    dom.saveFileBtn.addEventListener('click', saveToFile);
    dom.fileInput.addEventListener('change', onFallbackFile);
    dom.copyBtn.addEventListener('click', copyLRC);
    dom.downloadBtn.addEventListener('click', () => {
      const lrc = linesToLRC(state.lines);
      if (!lrc) { toast('Rien à télécharger pour le moment'); return; }
      download(`${currentTrack().id}.lrc`, lrc, 'text/plain');
    });
    dom.resetBtn.addEventListener('click', () => {
      if (!confirm('Effacer le brouillon et revenir aux paroles actuellement dans le site ?')) return;
      try { localStorage.removeItem(DRAFT_KEY + currentTrack().id); } catch (_) { /* rien */ }
      selectTrack(state.index);
    });
  }

  /* ========================================================================
     8. CLAVIER & DÉMARRAGE
     ======================================================================== */

  function initKeyboard() {
    document.addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Pendant la saisie, on laisse le clavier tranquille
      if (e.target.closest('textarea, input, select')) {
        if (e.key === 'Escape') e.target.blur();
        return;
      }
      switch (e.key) {
        case ' ':
          e.preventDefault();
          if (e.repeat) return;
          if (state.tab === 'sync') stamp(); else togglePlay();
          break;
        case 'p': case 'P': case 'k': case 'K':
          togglePlay();
          break;
        case 'Backspace':
          if (state.tab === 'sync') { e.preventDefault(); undoStamp(); }
          break;
        case 'ArrowLeft':
          e.preventDefault(); seekBy(-2);
          break;
        case 'ArrowRight':
          e.preventDefault(); seekBy(2);
          break;
        case 'ArrowUp':
          if (state.tab === 'sync') { e.preventDefault(); updateCursor(state.cursor - 1, true); }
          break;
        case 'ArrowDown':
          if (state.tab === 'sync') { e.preventDefault(); updateCursor(state.cursor + 1, true); }
          break;
        default:
      }
    });
    // Empêche la barre espace de « cliquer » le bouton qui a le focus
    document.addEventListener('keyup', (e) => {
      if (e.key === ' ' && !e.target.closest('textarea, input, select')) e.preventDefault();
    });
  }

  function boot() {
    if (!TRACK_LIST.length) {
      toast('Aucun morceau dans tracks.js');
      return;
    }
    fillTrackSelect();
    initRows();
    initAudio();
    initSave();
    initKeyboard();

    dom.tabs.forEach((t) => t.addEventListener('click', () => setTab(t.dataset.tab)));
    document.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.goto)));
    dom.trackSelect.addEventListener('change', () => { flushText(); selectTrack(Number(dom.trackSelect.value)); });
    dom.text.addEventListener('input', onTextInput);

    // admin.html#slug ouvre directement ce morceau
    let start = 0;
    try {
      const slug = decodeURIComponent(location.hash.slice(1));
      const i = TRACK_LIST.findIndex((t) => t.id === slug);
      if (i >= 0) start = i;
    } catch (_) { /* rien */ }
    selectTrack(start);
  }

  boot();
})();
