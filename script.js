/* ==========================================================================
   D-wrist — Script principal
   --------------------------------------------------------------------------
   1. Utilitaires
   2. Carrousel (physique ressort + inertie, drag, swipe, molette, clavier)
   3. Lecteur audio (lecture, progression, morceau précédent / suivant)
   4. Paroles synchronisées (parse LRC, ligne active, auto-scroll)
   5. Transitions FLIP entre accueil et page musique
   6. Routing par hash (#slug) + démarrage
   ========================================================================== */

(function () {
  'use strict';

  /* ========================================================================
     1. UTILITAIRES
     ======================================================================== */

  const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const MOTION = REDUCED ? 0.01 : 1; // multiplicateur des durées

  // Les données viennent de tracks.js (chargé avant ce fichier)
  const TRACK_LIST = (typeof TRACKS !== 'undefined' && Array.isArray(TRACKS)) ? TRACKS : [];

  const $ = (sel) => document.querySelector(sel);
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const easeOutQuint = (p) => 1 - Math.pow(1 - p, 5); // proche de cubic-bezier(0.22,1,0.36,1)

  const dom = {
    home: $('#home'),
    carousel: $('#carousel'),
    track: $('#carouselTrack'),
    caption: $('#caption'),
    captionTitle: $('#captionTitle'),
    captionArtist: $('#captionArtist'),
    hint: $('#hint'),
    logo: $('.logo'),
    logoImg: $('.logo-img'),

    player: $('#player'),
    backBtn: $('#backBtn'),
    playerHead: $('#playerHead'),
    playerCover: $('#playerCover'),
    playerMeta: $('#playerMeta'),
    playerTitle: $('#playerTitle'),
    playerArtist: $('#playerArtist'),
    lyrics: $('#lyrics'),
    lyricsInner: $('#lyricsInner'),
    controls: $('#controls'),
    progress: $('#progress'),
    progressFill: $('#progressFill'),
    progressThumb: $('#progressThumb'),
    timeCurrent: $('#timeCurrent'),
    timeTotal: $('#timeTotal'),
    playBtn: $('#playBtn'),
    prevBtn: $('#prevBtn'),
    nextBtn: $('#nextBtn'),

    audio: $('#audio'),
    backdropImg: $('#backdropImg'),
    toast: $('#toast'),
  };

  const audio = dom.audio;

  // État global de l'application
  const state = {
    view: null,              // 'home' | 'player'
    current: -1,             // index du morceau chargé dans le lecteur
    navigatedFromHome: false,// vrai si on est arrivé sur le lecteur depuis le carrousel
    booted: false,
  };

  /** Formate des secondes en m:ss */
  function formatTime(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return m + ':' + String(s).padStart(2, '0');
  }

  function escapeXml(str) {
    return String(str).replace(/[<>&'"]/g, (c) => ({
      '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;',
    }[c]));
  }

  /** Cover de remplacement monochrome (SVG généré) si l'image est absente */
  const placeholderCache = new Map();
  function placeholderCover(track) {
    if (placeholderCache.has(track.id)) return placeholderCache.get(track.id);
    const svg =
      `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 600 600'>` +
      `<defs><radialGradient id='g' cx='28%' cy='22%' r='95%'>` +
      `<stop offset='0' stop-color='#dcdcdc'/><stop offset='.42' stop-color='#3b3b3b'/><stop offset='1' stop-color='#050505'/>` +
      `</radialGradient><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2'/>` +
      `<feColorMatrix type='saturate' values='0'/><feComponentTransfer><feFuncA type='table' tableValues='0 .4'/></feComponentTransfer></filter></defs>` +
      `<rect width='600' height='600' fill='url(#g)'/><rect width='600' height='600' filter='url(#n)'/>` +
      `<text x='50%' y='86%' text-anchor='middle' font-family='Georgia,serif' font-size='40' letter-spacing='6' fill='#f2f2f2'>` +
      `${escapeXml(track.title.toUpperCase())}</text></svg>`;
    const uri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    placeholderCache.set(track.id, uri);
    return uri;
  }

  /** Affecte la cover d'un morceau à une <img>, avec repli automatique */
  function setCover(img, track) {
    img.onerror = () => {
      img.onerror = null;
      img.src = placeholderCover(track);
    };
    img.src = track.cover || placeholderCover(track);
  }

  /** Petit message temporaire en bas de l'écran */
  let toastTimer = 0;
  function toast(message) {
    dom.toast.textContent = message;
    dom.toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => dom.toast.classList.remove('is-visible'), 3000);
  }

  function hideHint() {
    dom.hint.classList.add('is-hidden');
  }

  /* ========================================================================
     2. CARROUSEL
     ------------------------------------------------------------------------
     La position est un nombre flottant `pos` (0 = 1er morceau, 1 = 2e...).
     Un ressort amorti ramène `pos` vers `target` (entier = snap), ce qui
     donne naturellement l'inertie quand on lâche avec de la vitesse.
     Chaque frame, on calcule transform/opacity de chaque cover.
     ======================================================================== */

  const car = {
    items: [],      // { el, blur, shade, visible }
    pos: 0,         // position actuelle (flottante)
    target: 0,      // position visée
    vel: 0,         // vitesse (index / seconde)
    size: 300,      // taille d'une cover en px
    step: 220,      // distance en px entre la cover centrale et sa voisine
    raf: 0,
    lastT: 0,
    active: -1,     // index de la cover centrée
    pointer: null,  // infos du drag en cours
    wheelTimer: 0,
  };

  const SPRING_K = 180;                          // raideur
  const SPRING_C = 2 * Math.sqrt(SPRING_K);      // amortissement critique (pas de rebond)

  function buildCarousel() {
    if (!TRACK_LIST.length) {
      dom.track.innerHTML = '<p class="carousel-empty">Aucun morceau pour le moment.</p>';
      return;
    }
    const frag = document.createDocumentFragment();
    TRACK_LIST.forEach((track, i) => {
      const el = document.createElement('div');
      el.className = 'c-item';
      el.dataset.index = i;
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label', `${track.title} — ${track.artist || 'D-wrist'}`);
      el.innerHTML =
        '<div class="c-cover">' +
          '<img class="c-img" alt="" draggable="false" decoding="async">' +
          '<img class="c-img c-img--blur" alt="" draggable="false" decoding="async" aria-hidden="true">' +
          '<span class="c-shade"></span>' +
        '</div>';
      const [sharp, blur] = el.querySelectorAll('img');
      setCover(sharp, track);
      setCover(blur, track);
      frag.appendChild(el);
      car.items.push({
        el,
        cover: el.firstElementChild,
        img: sharp,
        blur,
        shade: el.querySelector('.c-shade'),
        visible: true,
      });
    });
    dom.track.appendChild(frag);
  }

  /**
   * Calcule la taille et la position des covers selon l'écran.
   * On mesure l'espace réellement libre entre le bas du logo et le petit
   * texte d'aide en bas, on y réserve la place du titre, puis on centre la
   * cover dans ce qui reste → le logo ne chevauche jamais les covers.
   */
  function layoutCarousel() {
    const w = dom.carousel.clientWidth;
    const h = dom.carousel.clientHeight;
    if (!w || !h) return; // vue cachée

    const homeTop = dom.home.getBoundingClientRect().top;
    const logoBottom = dom.logo.getBoundingClientRect().bottom - homeTop;
    const hintTop = dom.hint.getBoundingClientRect().top - homeTop;

    const gapTop = clamp(h * 0.035, 12, 40);       // logo ↔ cover
    const gapCaption = clamp(h * 0.025, 12, 26);   // cover ↔ titre
    const captionH = Math.max(dom.caption.offsetHeight, 56);
    const zoneTop = logoBottom + gapTop;
    const zoneBottom = hintTop - 10 - captionH - gapCaption;
    const avail = zoneBottom - zoneTop;

    car.size = Math.round(clamp(Math.min(w * 0.66, avail, 440), 110, 440));
    car.step = car.size * (w >= 900 ? 0.92 : 0.74);

    // Centre la cover dans la zone libre (sans remonter sous le logo)
    const coverTop = Math.max(zoneTop, zoneTop + (avail - car.size) / 2);
    dom.home.style.setProperty('--cover-size', car.size + 'px');
    dom.home.style.setProperty('--center-y', (coverTop + car.size / 2).toFixed(1) + 'px');
    dom.home.style.setProperty('--caption-y', (coverTop + car.size + gapCaption).toFixed(1) + 'px');
  }

  function relayoutHome() {
    if (state.view !== 'home') return;
    layoutCarousel();
    renderCarousel();
  }

  /** Applique les transformations de chaque cover selon `car.pos` */
  function renderCarousel() {
    const { items, pos, step } = car;
    if (!items.length) return;

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const o = i - pos;          // décalage par rapport au centre
      const a = Math.abs(o);

      // Les covers trop loin sont masquées (et on ne les calcule pas)
      const show = a < 3.2;
      if (show !== it.visible) {
        it.el.style.visibility = show ? '' : 'hidden';
        it.visible = show;
      }
      if (!show) continue;

      // Position horizontale : espacement normal jusqu'à la voisine, puis resserré
      const x = Math.sign(o) * (a <= 1 ? a * step : step + (a - 1) * step * 0.62);
      // Échelle : 1 au centre, 0.72 pour les voisines, plus petit ensuite
      const scale = a <= 1 ? 1 - a * 0.28 : Math.max(0.4, 0.72 - (a - 1) * 0.14);

      it.el.style.transform = `translate3d(${x.toFixed(2)}px,0,0) scale(${scale.toFixed(4)})`;
      it.el.style.opacity = a <= 2 ? '1' : Math.max(0, 1 - (a - 2) * 0.9).toFixed(3);
      it.el.style.zIndex = String(100 - Math.round(a * 10));
      it.blur.style.opacity = Math.min(1, a).toFixed(3);              // flou
      it.shade.style.opacity = (Math.min(a, 2.2) * 0.3).toFixed(3);   // assombrissement
    }

    const active = clamp(Math.round(pos), 0, items.length - 1);
    if (active !== car.active) setActive(active, true);
  }

  /** Met à jour le titre sous la cover centrale */
  function setActive(i, animate) {
    const prev = car.active;
    car.active = i;
    if (car.items[prev]) car.items[prev].el.classList.remove('is-active');
    car.items[i].el.classList.add('is-active');

    const track = TRACK_LIST[i];
    dom.captionTitle.textContent = track.title;
    dom.captionArtist.textContent = track.artist || 'D-wrist';

    if (animate && prev !== -1) {
      dom.caption.animate(
        [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }],
        { duration: 480 * MOTION, easing: EASE }
      );
    }
  }

  /** Boucle d'animation : intègre le ressort tant qu'il n'est pas au repos */
  function tick(now) {
    const dt = Math.min(0.032, (now - car.lastT) / 1000 || 0.016);
    car.lastT = now;

    if (!car.pointer || !car.pointer.dragging) {
      const force = (car.target - car.pos) * SPRING_K - car.vel * SPRING_C;
      car.vel += force * dt;
      car.pos += car.vel * dt;

      // Au repos → on arrête la boucle
      if (Math.abs(car.target - car.pos) < 0.0004 && Math.abs(car.vel) < 0.002) {
        car.pos = car.target;
        car.vel = 0;
        renderCarousel();
        car.raf = 0;
        return;
      }
    }
    renderCarousel();
    car.raf = requestAnimationFrame(tick);
  }

  function kick() {
    if (!car.raf) {
      car.lastT = performance.now();
      car.raf = requestAnimationFrame(tick);
    }
  }

  /** Va vers un morceau avec animation */
  function goTo(i) {
    if (!car.items.length) return;
    car.target = clamp(Math.round(i), 0, car.items.length - 1);
    kick();
  }

  /** Place le carrousel sur un morceau instantanément */
  function jumpTo(i) {
    if (!car.items.length) return;
    cancelAnimationFrame(car.raf);
    car.raf = 0;
    car.pos = car.target = clamp(Math.round(i), 0, car.items.length - 1);
    car.vel = 0;
    if (car.active !== car.pos) setActive(car.pos, false);
    renderCarousel();
  }

  /** Résistance élastique au-delà du premier / dernier morceau */
  function rubber(v) {
    const max = car.items.length - 1;
    if (v < 0) return v * 0.3;
    if (v > max) return max + (v - max) * 0.3;
    return v;
  }

  function openTrack(i) {
    const track = TRACK_LIST[i];
    if (!track) return;
    state.navigatedFromHome = true;
    location.hash = encodeURIComponent(track.id); // → hashchange → route()
  }

  function onItemClick(i) {
    // Cover centrale (ou presque centrée) → ouvre le morceau ; sinon → on la centre
    if (i === car.active && Math.abs(car.pos - i) < 0.2) openTrack(i);
    else goTo(i);
    hideHint();
  }

  /* ---- Drag souris / swipe tactile (Pointer Events) ---- */
  function onPointerDown(e) {
    if (state.view !== 'home' || !car.items.length) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    car.pointer = {
      id: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      pos0: car.pos,
      dragging: false,
      samples: [],
    };
    if (e.pointerType === 'mouse') e.preventDefault(); // pas de sélection de texte
  }

  function onPointerMove(e) {
    const p = car.pointer;
    if (!p || e.pointerId !== p.id) return;
    const dx = e.clientX - p.x0;
    const dy = e.clientY - p.y0;

    if (!p.dragging) {
      // Geste vertical → on laisse tomber
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { car.pointer = null; return; }
      if (Math.abs(dx) < 6) return;
      // Début du drag : on « attrape » le carrousel là où il est
      p.dragging = true;
      p.x0 = e.clientX;
      p.pos0 = car.pos;
      car.vel = 0;
      try { dom.carousel.setPointerCapture(e.pointerId); } catch (_) { /* rien */ }
      dom.carousel.classList.add('is-dragging');
      hideHint();
    }

    car.pos = rubber(p.pos0 - (e.clientX - p.x0) / car.step);

    // Échantillons des 100 dernières ms pour calculer la vitesse au lâcher
    p.samples.push({ t: e.timeStamp, x: e.clientX });
    while (p.samples.length > 2 && e.timeStamp - p.samples[0].t > 100) p.samples.shift();
    kick();
  }

  function onPointerUp(e) {
    const p = car.pointer;
    if (!p || e.pointerId !== p.id) return;
    car.pointer = null;

    if (p.dragging) {
      dom.carousel.classList.remove('is-dragging');
      const s = p.samples;
      let v = 0;
      if (s.length >= 2 && e.timeStamp - s[s.length - 1].t < 80) {
        const dt = (s[s.length - 1].t - s[0].t) / 1000;
        if (dt > 0) v = -((s[s.length - 1].x - s[0].x) / dt) / car.step; // index / s
      }
      car.vel = v;
      // Projection inertielle : où le carrousel s'arrêterait, puis snap
      goTo(car.pos + v * 0.22);
    } else if (e.type === 'pointerup') {
      // Pas de mouvement → c'est un clic
      const itemEl = e.target.closest('.c-item');
      if (itemEl) onItemClick(Number(itemEl.dataset.index));
    }
  }

  /* ---- Molette / trackpad horizontal ---- */
  function onWheel(e) {
    if (state.view !== 'home' || !car.items.length) return;
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (!delta) return;
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 800 : 1; // lignes / pages → px
    const max = car.items.length - 1;
    car.target = clamp(car.target + (delta * unit * 1.2) / car.step, -0.25, max + 0.25);
    kick();
    hideHint();
    // Dès que la molette s'arrête → snap sur le morceau le plus proche
    clearTimeout(car.wheelTimer);
    car.wheelTimer = setTimeout(() => goTo(car.target), 130);
  }

  function initCarouselEvents() {
    dom.carousel.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    dom.home.addEventListener('wheel', onWheel, { passive: false });
    // Empêche le « fantôme » de drag natif des images
    dom.carousel.addEventListener('dragstart', (e) => e.preventDefault());
  }

  /* ========================================================================
     3. LECTEUR AUDIO
     ======================================================================== */

  let loopRaf = 0;
  let seeking = false;
  let seekRatio = 0;
  let lastTimeText = '';

  /** Charge un morceau dans le lecteur (sans changer de vue) */
  function loadTrack(i, { autoplay = false } = {}) {
    const track = TRACK_LIST[i];
    if (!track) return;

    if (i !== state.current) {
      state.current = i;

      if (track.audio) {
        audio.src = track.audio; // preload="metadata" : seule la durée est chargée
      } else {
        audio.removeAttribute('src');
        audio.load();
      }

      setCover(dom.playerCover, track);
      setCover(dom.backdropImg, track);
      dom.backdropImg.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 900 * MOTION, easing: EASE });

      dom.playerTitle.textContent = track.title;
      dom.playerArtist.textContent = track.artist || 'D-wrist';
      dom.playerCover.alt = `Cover de ${track.title}`;

      applyMood();
      buildLyrics(track.lyrics);
      lastTimeText = '';
      renderProgress(0);
      dom.timeTotal.textContent = '0:00';
      updateMediaSession(track);
    }

    document.title = `${track.title} — ${track.artist || 'D-wrist'}`;
    if (autoplay) play();
    updatePlayButton();
  }

  /* ==========================================================================
     AMBIANCE PAR MORCEAU
     ========================================================================== */

  /** Pose data-mood sur <body> selon le morceau chargé (le CSS fait le reste) */
  function applyMood() {
    const track = TRACK_LIST[state.current];
    const mood = track && track.mood;
    if (mood) document.body.dataset.mood = mood;
    else delete document.body.dataset.mood;
  }

  function play() {
    if (!audio.getAttribute('src')) {
      toast('Aucun fichier audio pour ce morceau');
      return;
    }
    const p = audio.play();
    if (p && typeof p.catch === 'function') {
      p.catch((err) => {
        // NotSupportedError (fichier absent) est déjà signalé par l'événement "error"
        if (err && err.name === 'NotAllowedError') toast('Appuie sur ▶ pour lancer la lecture');
        updatePlayButton();
      });
    }
  }

  function togglePlay() {
    if (audio.paused) play();
    else audio.pause();
  }

  /** Morceau précédent / suivant (boucle sur la liste) */
  function changeTrack(delta, autoplay = !audio.paused) {
    if (!TRACK_LIST.length) return;
    const j = (state.current + delta + TRACK_LIST.length) % TRACK_LIST.length;
    animateHeadSwap(delta);
    loadTrack(j, { autoplay });
    // On remplace l'entrée d'historique : le bouton retour ramène toujours au carrousel
    location.replace('#' + encodeURIComponent(TRACK_LIST[j].id));
  }

  function previous() {
    if (audio.currentTime > 3) audio.currentTime = 0; // comme Spotify
    else changeTrack(-1);
  }

  function seekBy(sec) {
    if (!isFinite(audio.duration)) return;
    audio.currentTime = clamp(audio.currentTime + sec, 0, audio.duration);
    syncUI(true);
  }

  function updatePlayButton() {
    const playing = !audio.paused;
    dom.playBtn.classList.toggle('is-playing', playing);
    dom.playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Lecture');
  }

  /** Met à jour la barre de progression (transform uniquement) */
  function renderProgress(t) {
    const d = audio.duration;
    const ratio = isFinite(d) && d > 0 ? clamp(t / d, 0, 1) : 0;
    dom.progressFill.style.transform = `scaleX(${ratio.toFixed(5)})`;
    dom.progressThumb.style.transform = `translateX(${(ratio * 100).toFixed(3)}%)`;
    const text = formatTime(t);
    if (text !== lastTimeText) {
      lastTimeText = text;
      dom.timeCurrent.textContent = text;
      dom.progress.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
      dom.progress.setAttribute('aria-valuetext', text);
    }
  }

  /** Synchronise progression + paroles avec la position de lecture */
  function syncUI(force = false) {
    if (!seeking) renderProgress(audio.currentTime);
    updateLyrics(audio.currentTime, force);
  }

  // Boucle rAF pendant la lecture → progression et paroles parfaitement fluides
  function loop() {
    syncUI();
    loopRaf = audio.paused ? 0 : requestAnimationFrame(loop);
  }
  function startLoop() {
    if (!loopRaf) loopRaf = requestAnimationFrame(loop);
  }

  /* ---- Barre de progression cliquable + draggable ---- */
  function ratioFromEvent(e) {
    const r = dom.progress.getBoundingClientRect();
    return clamp((e.clientX - r.left) / r.width, 0, 1);
  }

  function initProgressEvents() {
    dom.progress.addEventListener('pointerdown', (e) => {
      if (!isFinite(audio.duration) || audio.duration <= 0) return;
      seeking = true;
      try { dom.progress.setPointerCapture(e.pointerId); } catch (_) { /* rien */ }
      dom.progress.classList.add('is-seeking');
      seekRatio = ratioFromEvent(e);
      renderProgress(seekRatio * audio.duration);
    });
    dom.progress.addEventListener('pointermove', (e) => {
      if (!seeking) return;
      seekRatio = ratioFromEvent(e);
      renderProgress(seekRatio * audio.duration);
    });
    const end = () => {
      if (!seeking) return;
      seeking = false;
      dom.progress.classList.remove('is-seeking');
      audio.currentTime = seekRatio * audio.duration;
      resumeAutoScroll();
      syncUI(true);
    };
    dom.progress.addEventListener('pointerup', end);
    dom.progress.addEventListener('pointercancel', end);
  }

  function initAudioEvents() {
    audio.addEventListener('play', () => { updatePlayButton(); startLoop(); });
    audio.addEventListener('pause', updatePlayButton);
    audio.addEventListener('timeupdate', () => { if (!loopRaf) syncUI(); });
    audio.addEventListener('seeked', () => syncUI(true));
    audio.addEventListener('durationchange', () => {
      dom.timeTotal.textContent = formatTime(audio.duration);
      syncUI(true);
    });
    audio.addEventListener('ended', () => changeTrack(1, true)); // enchaîne
    audio.addEventListener('error', () => {
      const track = TRACK_LIST[state.current];
      if (track && track.audio && audio.getAttribute('src')) {
        toast(`Fichier audio introuvable : ${track.audio}`);
      }
      updatePlayButton();
    });

    dom.playBtn.addEventListener('click', togglePlay);
    dom.prevBtn.addEventListener('click', previous);
    dom.nextBtn.addEventListener('click', () => changeTrack(1));
  }

  /** Contrôles système (écran verrouillé, casque bluetooth...) */
  function updateMediaSession(track) {
    if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist || 'D-wrist',
        artwork: track.cover ? [{ src: new URL(track.cover, location.href).href, sizes: '512x512' }] : [],
      });
    } catch (_) { /* non supporté */ }
  }

  function initMediaSession() {
    if (!('mediaSession' in navigator)) return;
    const handlers = {
      play: () => play(),
      pause: () => audio.pause(),
      previoustrack: () => previous(),
      nexttrack: () => changeTrack(1),
    };
    Object.entries(handlers).forEach(([action, fn]) => {
      try { navigator.mediaSession.setActionHandler(action, fn); } catch (_) { /* non supporté */ }
    });
  }

  /* ========================================================================
     4. PAROLES SYNCHRONISÉES (format LRC)
     ======================================================================== */

  const lyr = {
    lines: [],          // { time, el }
    active: -1,
    userScrolling: false,
    resumeTimer: 0,
    scrollRaf: 0,
  };

  /**
   * Parse un texte LRC → [{ time (s), text }] trié par temps.
   * Gère plusieurs timestamps sur une ligne : [00:12.00][00:45.00]texte
   * et la balise [offset:±ms].
   */
  function parseLRC(text) {
    if (!text || !text.trim()) return [];
    const out = [];
    let offset = 0;
    const lineRe = /^\s*((?:\[\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?\]\s*)+)(.*)$/;
    const stampRe = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;

    text.split(/\r?\n/).forEach((raw) => {
      const off = raw.match(/^\s*\[offset:\s*([+-]?\d+)\s*\]/i);
      if (off) { offset = Number(off[1]) / 1000; return; }

      const m = raw.match(lineRe);
      if (!m) return; // métadonnées ([ti:], [ar:]...) ou ligne vide
      const content = m[2].trim();
      let s;
      stampRe.lastIndex = 0;
      while ((s = stampRe.exec(m[1]))) {
        const frac = s[3] ? Number(s[3]) / Math.pow(10, s[3].length) : 0;
        out.push({ time: Number(s[1]) * 60 + Number(s[2]) + frac, text: content });
      }
    });

    out.forEach((l) => { l.time = Math.max(0, l.time - offset); });
    out.sort((a, b) => a.time - b.time);

    // Retire les pauses (lignes vides) en tout début et les doublons de pauses
    while (out.length && !out[0].text) out.shift();
    return out.filter((l, i) => l.text || (i > 0 && out[i - 1].text));
  }

  function buildLyrics(text) {
    const parsed = parseLRC(text);
    cancelAnimationFrame(lyr.scrollRaf);
    dom.lyricsInner.textContent = '';
    dom.lyrics.scrollTop = 0;
    lyr.lines = [];
    lyr.active = -1;

    const empty = parsed.length === 0;
    dom.lyrics.classList.toggle('is-empty', empty);
    if (empty) {
      const p = document.createElement('p');
      p.className = 'lyrics-empty';
      p.textContent = 'Paroles bientôt disponibles';
      dom.lyricsInner.appendChild(p);
      return;
    }

    const frag = document.createDocumentFragment();
    parsed.forEach((line, i) => {
      const el = document.createElement('p');
      el.className = 'lyric' + (line.text ? '' : ' is-gap');
      el.textContent = line.text || '♪';
      el.dataset.i = i;
      frag.appendChild(el);
      lyr.lines.push({ time: line.time, el });
    });
    dom.lyricsInner.appendChild(frag);
  }

  /** Index de la dernière ligne dont le timestamp est passé (recherche binaire) */
  function findLine(t) {
    let lo = 0;
    let hi = lyr.lines.length - 1;
    let ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (lyr.lines[mid].time <= t) { ans = mid; lo = mid + 1; }
      else hi = mid - 1;
    }
    return ans;
  }

  function updateLyrics(t, force = false) {
    if (!lyr.lines.length) return;
    const idx = findLine(t + 0.12); // légère avance pour coller au chant
    if (idx === lyr.active && !force) return;

    if (idx !== lyr.active) {
      lyr.active = idx;
      lyr.lines.forEach((l, i) => {
        l.el.classList.toggle('is-active', i === idx);
        l.el.classList.toggle('is-past', i < idx);
      });
    }
    if (!lyr.userScrolling) scrollToActive();
  }

  /** Défilement fluide qui garde la ligne active vers le centre */
  function scrollToActive(instant = false) {
    const box = dom.lyrics;
    let top = 0;
    if (lyr.active >= 0) {
      const el = lyr.lines[lyr.active].el;
      top = el.offsetTop + el.offsetHeight / 2 - box.clientHeight * 0.42;
    }
    top = clamp(top, 0, Math.max(0, box.scrollHeight - box.clientHeight));
    if (instant || REDUCED) {
      cancelAnimationFrame(lyr.scrollRaf);
      box.scrollTop = top;
      return;
    }
    smoothScroll(box, top, 850);
  }

  function smoothScroll(box, top, duration) {
    cancelAnimationFrame(lyr.scrollRaf);
    const start = box.scrollTop;
    const delta = top - start;
    if (Math.abs(delta) < 1) return;
    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / duration);
      box.scrollTop = start + delta * easeOutQuint(p);
      if (p < 1) lyr.scrollRaf = requestAnimationFrame(step);
    };
    lyr.scrollRaf = requestAnimationFrame(step);
  }

  /** L'utilisateur scrolle → pause de l'auto-scroll pendant 3 s */
  function pauseAutoScroll() {
    lyr.userScrolling = true;
    cancelAnimationFrame(lyr.scrollRaf);
    clearTimeout(lyr.resumeTimer);
    lyr.resumeTimer = setTimeout(resumeAutoScroll, 3000);
  }

  function resumeAutoScroll() {
    clearTimeout(lyr.resumeTimer);
    lyr.userScrolling = false;
    if (lyr.lines.length) scrollToActive();
  }

  function initLyricsEvents() {
    // Gestes de défilement manuels (le scroll programmatique ne les déclenche pas)
    dom.lyrics.addEventListener('wheel', pauseAutoScroll, { passive: true });
    dom.lyrics.addEventListener('touchmove', pauseAutoScroll, { passive: true });

    // Clic sur une ligne → saut au timestamp
    dom.lyricsInner.addEventListener('click', (e) => {
      const el = e.target.closest('.lyric');
      if (!el) return;
      const line = lyr.lines[Number(el.dataset.i)];
      if (!line) return;
      audio.currentTime = line.time;
      lyr.userScrolling = false;
      clearTimeout(lyr.resumeTimer);
      updateLyrics(line.time, true);
      renderProgress(line.time);
      if (audio.paused) play();
    });
  }

  /* ========================================================================
     5. TRANSITIONS (technique FLIP)
     ------------------------------------------------------------------------
     First : position de la cover de départ
     Last  : position de la cover d'arrivée
     Invert + Play : une image « fantôme » en position fixe est animée de
     l'une à l'autre avec transform uniquement (translate + scale).
     ======================================================================== */

  let activeTransition = null; // { cleanup }

  /** Termine immédiatement une transition en cours (si navigation rapide) */
  function settleTransition() {
    if (!activeTransition) return;
    const t = activeTransition;
    activeTransition = null;
    t.cleanup();
  }

  function runTransition(anims, cleanup) {
    const t = {
      cleanup: () => {
        cleanup();
        anims.forEach((a) => a.cancel()); // libère les fill: 'both'
      },
    };
    activeTransition = t;
    Promise.all(anims.map((a) => a.finished))
      .then(() => {
        if (activeTransition === t) {
          activeTransition = null;
          t.cleanup();
        }
      })
      .catch(() => { /* animation annulée */ });
  }

  function makeGhost(src, rect, radius) {
    const g = new Image();
    g.className = 'flip-ghost';
    g.alt = '';
    g.decoding = 'sync';
    g.src = src;
    g.style.left = rect.left + 'px';
    g.style.top = rect.top + 'px';
    g.style.width = rect.width + 'px';
    g.style.height = rect.height + 'px';
    g.style.borderRadius = radius + 'px';
    document.body.appendChild(g);
    return g;
  }

  const radiusOf = (el) => parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;

  /** Apparition échelonnée des éléments de la page musique */
  function revealAnims(elements, delay) {
    return elements.map((el, k) => el.animate(
      [{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'none' }],
      { duration: 700 * MOTION, delay: (delay + k * 70) * MOTION, easing: EASE, fill: 'both' }
    ));
  }

  /** Changement de morceau dans le lecteur : petit glissé de l'en-tête et des paroles */
  function animateHeadSwap(dir) {
    const from = `translateX(${dir >= 0 ? 18 : -18}px)`;
    [dom.playerHead, dom.lyricsInner].forEach((el) => el.animate(
      [{ opacity: 0, transform: from }, { opacity: 1, transform: 'none' }],
      { duration: 550 * MOTION, easing: EASE }
    ));
  }

  /** Accueil → page musique */
  function showPlayer(i, animate) {
    settleTransition();
    const fromHome = state.view === 'home';
    state.view = 'player';
    document.body.classList.add('is-player');

    loadTrack(i, { autoplay: animate });
    dom.player.hidden = false;
    resumeAutoScroll();
    scrollToActive(true);

    // Arrivée directe par lien (#slug) : simple fondu, pas de FLIP
    if (!animate || !fromHome) {
      dom.home.hidden = true;
      const anims = revealAnims([dom.backBtn, dom.playerHead, dom.lyrics, dom.controls], 60);
      runTransition(anims, () => {});
      return;
    }

    // On s'assure que la cover cliquée est bien au centre
    jumpTo(i);
    const item = car.items[i];
    const first = item.cover.getBoundingClientRect();
    const last = dom.playerCover.getBoundingClientRect();
    const r1 = radiusOf(item.cover);
    const r2 = radiusOf(dom.playerCover);

    const ghost = makeGhost(item.img.currentSrc || item.img.src, first, r1);
    item.cover.style.visibility = 'hidden';
    dom.playerCover.style.opacity = '0';

    const s = last.width / first.width;
    const dx = last.left - first.left;
    const dy = last.top - first.top;

    const anims = [
      ghost.animate([
        { transform: 'translate(0px, 0px) scale(1)', borderRadius: r1 + 'px' },
        { transform: `translate(${dx}px, ${dy}px) scale(${s})`, borderRadius: (r2 / s) + 'px' },
      ], { duration: 760 * MOTION, easing: EASE, fill: 'both' }),
      dom.home.animate(
        [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.96)' }],
        { duration: 480 * MOTION, easing: EASE, fill: 'both' }
      ),
      ...revealAnims([dom.backBtn, dom.playerMeta, dom.lyrics, dom.controls], 180),
    ];

    runTransition(anims, () => {
      ghost.remove();
      item.cover.style.visibility = '';
      dom.playerCover.style.opacity = '';
      dom.home.hidden = true;
    });
  }

  /** Page musique → accueil (animation inverse) */
  function showHome(animate) {
    settleTransition();
    const fromPlayer = state.view === 'player';
    state.view = 'home';
    state.navigatedFromHome = false;
    document.body.classList.remove('is-player');
    document.title = 'D-wrist';

    dom.home.hidden = false;
    layoutCarousel();
    jumpTo(state.current >= 0 ? state.current : car.pos);

    if (!animate || !fromPlayer || state.current < 0 || !car.items[state.current]) {
      dom.player.hidden = true;
      return;
    }

    const item = car.items[state.current];
    const first = dom.playerCover.getBoundingClientRect();
    const last = item.cover.getBoundingClientRect();
    const r1 = radiusOf(item.cover);
    const r2 = radiusOf(dom.playerCover);

    const ghost = makeGhost(dom.playerCover.currentSrc || dom.playerCover.src, last, r1);
    item.cover.style.visibility = 'hidden';
    dom.playerCover.style.opacity = '0';

    const s = first.width / last.width;
    const dx = first.left - last.left;
    const dy = first.top - last.top;

    const anims = [
      ghost.animate([
        { transform: `translate(${dx}px, ${dy}px) scale(${s})`, borderRadius: (r2 / s) + 'px' },
        { transform: 'translate(0px, 0px) scale(1)', borderRadius: r1 + 'px' },
      ], { duration: 760 * MOTION, easing: EASE, fill: 'both' }),
      dom.player.animate(
        [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(12px)' }],
        { duration: 380 * MOTION, easing: EASE, fill: 'both' }
      ),
      dom.home.animate(
        [{ opacity: 0, transform: 'scale(0.96)' }, { opacity: 1, transform: 'scale(1)' }],
        { duration: 650 * MOTION, delay: 90 * MOTION, easing: EASE, fill: 'both' }
      ),
    ];

    runTransition(anims, () => {
      ghost.remove();
      item.cover.style.visibility = '';
      dom.playerCover.style.opacity = '';
      dom.player.hidden = true;
    });
  }

  /** Bouton retour de l'interface */
  function goHome() {
    // Si on vient du carrousel, on recule dans l'historique (cohérent avec
    // le bouton retour du navigateur) ; sinon on va simplement à l'accueil.
    if (state.navigatedFromHome) history.back();
    else location.hash = '';
  }

  /* ========================================================================
     6. ROUTING PAR HASH + DÉMARRAGE
     ======================================================================== */

  function currentSlug() {
    try { return decodeURIComponent(location.hash.replace(/^#/, '')); }
    catch (_) { return ''; }
  }

  function route() {
    const slug = currentSlug();
    const i = slug ? TRACK_LIST.findIndex((t) => t.id === slug) : -1;

    if (i >= 0) {
      if (state.view !== 'player') {
        showPlayer(i, state.booted);
      } else if (i !== state.current) {
        // Hash modifié à la main pendant qu'on est sur le lecteur
        animateHeadSwap(i > state.current ? 1 : -1);
        loadTrack(i, { autoplay: !audio.paused });
      }
    } else if (state.view !== 'home') {
      showHome(state.booted);
    }
  }

  function initKeyboard() {
    document.addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (state.view === 'home') {
        if (e.key === 'ArrowRight') { e.preventDefault(); goTo(car.target + 1); hideHint(); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(car.target - 1); hideHint(); }
        else if (e.key === 'Enter' && !e.target.closest('a, button')) { e.preventDefault(); openTrack(car.active); }
        return;
      }

      // Page musique
      if (e.code === 'Space') {
        e.preventDefault(); // pas de scroll ni de double-clic sur un bouton focalisé
        if (!e.repeat) togglePlay();
      } else if (e.key === 'ArrowRight' && !e.target.closest('.progress')) {
        e.preventDefault(); seekBy(5);
      } else if (e.key === 'ArrowLeft' && !e.target.closest('.progress')) {
        e.preventDefault(); seekBy(-5);
      } else if (e.key === 'Escape') {
        goHome();
      }
    });

    // Évite qu'un bouton focalisé ne soit aussi « cliqué » par la barre espace
    document.addEventListener('keyup', (e) => {
      if (state.view === 'player' && e.code === 'Space') e.preventDefault();
    });

    // Flèches sur la barre de progression focalisée
    dom.progress.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); seekBy(5); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); seekBy(-5); }
    });
  }

  function initResize() {
    let raf = 0;
    window.addEventListener('resize', () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (state.view === 'home') relayoutHome();
        else if (!lyr.userScrolling) scrollToActive(true);
      });
    });
  }

  function boot() {
    buildCarousel();
    initCarouselEvents();
    initAudioEvents();
    initProgressEvents();
    initLyricsEvents();
    initKeyboard();
    initResize();
    initMediaSession();
    dom.backBtn.addEventListener('click', goHome);

    // Le logo (image ou police gothique) peut finir de charger après le
    // premier affichage : on recalcule alors la place disponible.
    if (dom.logoImg && !dom.logoImg.complete) {
      dom.logoImg.addEventListener('load', relayoutHome);
      dom.logoImg.addEventListener('error', relayoutHome);
    }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayoutHome);

    // Premier affichage (sans animation FLIP)
    const slug = currentSlug();
    if (slug && !TRACK_LIST.some((t) => t.id === slug)) {
      // Lien vers un morceau inconnu → retour propre à l'accueil
      location.replace('#');
    }
    if (TRACK_LIST.length) jumpTo(0);
    route();
    if (state.view === null) showHome(false);
    state.booted = true;

    window.addEventListener('hashchange', route);
  }

  boot();
})();
