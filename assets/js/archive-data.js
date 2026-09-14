(() => {
  const A = window.PhotoArchive;
  const UI = () => window.CinematicUI;
  const $ = (s, ctx = document) => ctx.querySelector(s);
  const $$ = (s, ctx = document) => [...ctx.querySelectorAll(s)];
  const page = document.body.dataset.page;
  const esc = A?.escapeHtml || (s => String(s || ''));

  function setupNotice() {
    return `<div class="setup-notice"><strong>尚未连接摄影档案</strong><span>把旧测试站中已经可用的 Supabase Project URL 与 Publishable key 复制到本网站的 assets/js/config.js 即可。不要填写 Secret key。</span></div>`;
  }
  function dateLabel(value, short = false) {
    if (!value) return '日期未知';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '日期未知';
    return new Intl.DateTimeFormat('zh-CN', short ? {year:'numeric',month:'2-digit'} : {year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
  }
  async function photosSafe(options = {}) {
    if (!A?.configured) return null;
    try { return await A.fetchPhotos(options); }
    catch (err) { console.error(err); return null; }
  }
  function firstCharTitle(title) {
    const str = String(title || '未分类');
    return `<span class="accent-char">${esc(str.slice(0,1))}</span>${esc(str.slice(1))}`;
  }

  function photoRatio(photo) {
    const w = Number(photo?.exif?.width || 0), h = Number(photo?.exif?.height || 0);
    return w > 0 && h > 0 ? w / h : null;
  }
  function shuffled(items) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  // V22: mobile-safe deterministic shuffle. The seed travels in the URL so
  // Safari / in-app browsers do not need sessionStorage to reconstruct the
  // same random browsing deck after a tap/navigation.
  function makeShuffleSeed() {
    try {
      const a = new Uint32Array(1);
      crypto.getRandomValues(a);
      return String(a[0] || Date.now());
    } catch (_) {
      return String((Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0);
    }
  }
  function seedToUint(seed) {
    const str = String(seed || '1');
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function seededRandom(seed) {
    let t = seedToUint(seed) || 0x6d2b79f5;
    return () => {
      t += 0x6D2B79F5;
      let x = t;
      x = Math.imul(x ^ (x >>> 15), x | 1);
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }
  function seededShuffle(items, seed) {
    const copy = [...items];
    const rand = seededRandom(seed);
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }
  function rotateFromId(items, clickedId) {
    const clicked = String(clickedId ?? '');
    const at = items.findIndex(item => String(item?.id ?? '') === clicked);
    return at > 0 ? items.slice(at).concat(items.slice(0, at)) : [...items];
  }
  function withBrowseContext(href, { mode, seed = '', source = '', scope = '' } = {}) {
    if (mode !== 'shuffle') return href;
    try {
      const url = new URL(href, location.href);
      url.searchParams.set('browse', 'shuffle');
      url.searchParams.set('seed', String(seed || '1'));
      if (source) url.searchParams.set('source', source);
      if (scope) url.searchParams.set('scope', scope);
      else url.searchParams.delete('scope');
      return `${url.pathname.split('/').pop()}${url.search}${url.hash}`;
    } catch (_) {
      return href;
    }
  }

  const PHOTO_NAV_PREFIX = 'photo-nav-v22:';
  function makeNavToken() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,9)}`;
  }
  function savePhotoNavState({ source, mode, items, clickedId, collection = '' }) {
    try {
      const ids = items.map(item => String(item?.id ?? '')).filter(Boolean);
      const clicked = String(clickedId ?? '');
      const at = ids.indexOf(clicked);
      if (at < 0) return '';
      // In SHUFFLE mode the selected image becomes 01/N, then the remaining
      // shuffled deck continues exactly once and stops at the end. This avoids
      // opening a random image as 45/45 while also preventing endless looping.
      const sequence = mode === 'shuffle'
        ? ids.slice(at).concat(ids.slice(0, at))
        : ids;
      const token = makeNavToken();
      sessionStorage.setItem(`${PHOTO_NAV_PREFIX}${token}`, JSON.stringify({
        version: 22,
        source,
        mode,
        collection,
        ids: sequence,
        createdAt: Date.now()
      }));
      return token;
    } catch (_) {
      return '';
    }
  }
  function readPhotoNavState(token) {
    if (!token) return null;
    try {
      const raw = sessionStorage.getItem(`${PHOTO_NAV_PREFIX}${token}`);
      if (!raw) return null;
      const state = JSON.parse(raw);
      if (!state || state.version !== 22 || !Array.isArray(state.ids)) return null;
      if (Date.now() - Number(state.createdAt || 0) > 12 * 60 * 60 * 1000) {
        sessionStorage.removeItem(`${PHOTO_NAV_PREFIX}${token}`);
        return null;
      }
      return state;
    } catch (_) {
      return null;
    }
  }
  function attachNavToken(anchor, token) {
    if (!anchor || !token) return;
    try {
      const url = new URL(anchor.href, location.href);
      url.searchParams.set('nav', token);
      anchor.href = url.toString();
    } catch (_) {}
  }
  function heroCandidates(photos) {
    const viewportRatio = Math.max(1, innerWidth) / Math.max(1, innerHeight);
    const scored = photos.filter(p => p?.url).map((photo, index) => {
      const ratio = photoRatio(photo);
      const ratioScore = ratio ? Math.abs(Math.log(ratio / viewportRatio)) : 2.8;
      const featuredBonus = photo.isFeatured ? -.28 : 0;
      return { photo, score:ratioScore + featuredBonus + index * .000001 };
    }).sort((a,b)=>a.score-b.score);
    const poolSize = Math.min(Math.max(6, Math.ceil(scored.length * .22)), 18);
    return shuffled(scored.slice(0, poolSize).map(x => x.photo));
  }
  function heroFit(photo, img) {
    const w = Number(photo?.exif?.width || img?.naturalWidth || 0);
    const h = Number(photo?.exif?.height || img?.naturalHeight || 0);
    if (!w || !h) return 'contain';
    const relative = (w / h) / (Math.max(1, innerWidth) / Math.max(1, innerHeight));
    return relative > .80 && relative < 1.24 ? 'cover' : 'contain';
  }
  function projectCoverCandidate(photos, projectName, targetRatio = 4/3) {
    const items = photos.filter(photo => (photo.project || '未分类') === projectName && photo?.url);
    if (!items.length) return { photo:null, fit:'contain' };
    const scored = items.map((photo, index) => {
      const ratio = photoRatio(photo);
      // 优先选择接近横向作品卡片比例的照片，降低竖幅人像被裁头的概率。
      const ratioScore = ratio ? Math.abs(Math.log(ratio / targetRatio)) : 3;
      const portraitPenalty = ratio && ratio < .92 ? .55 : 0;
      const extremePenalty = ratio && (ratio < .66 || ratio > 2.05) ? .45 : 0;
      const featuredBonus = photo.isFeatured ? -.18 : 0;
      const recencyBonus = Math.max(-.08, -index * .00001);
      return { photo, score:ratioScore + portraitPenalty + extremePenalty + featuredBonus + recencyBonus };
    }).sort((a,b)=>a.score-b.score);
    const best = scored[0]?.photo || items[0];
    const ratio = photoRatio(best);
    const relative = ratio ? ratio / targetRatio : 0;
    const fit = ratio && relative > .82 && relative < 1.22 ? 'cover' : 'contain';
    return { photo:best, fit };
  }
  function projectCardMarkup(project, i, photos, clone = false) {
    const chosen = projectCoverCandidate(photos, project.name, 4/3);
    const cover = chosen.photo || project.cover;
    const loopAttrs = clone ? `${i === 0 ? ' data-loop-start="true"' : ''} data-loop-clone="true"` : '';
    const safeUrl = esc(cover?.url || '');
    return `
      <article class="home-project-card reveal"${loopAttrs}>
        <a class="home-project-link" data-transition href="project.html?collection=${encodeURIComponent(project.name)}">
          <span class="home-project-num mono">${String(i+1).padStart(2,'0')} / ${esc(project.year || '—')}</span>
          <div class="home-project-frame" data-fit="${chosen.fit}">
            <img class="home-project-backdrop" loading="lazy" decoding="async" src="${safeUrl}" alt="" aria-hidden="true">
            <img class="home-project-image" loading="${!clone && i < 2 ? 'eager':'lazy'}" decoding="async" src="${safeUrl}" alt="${esc(project.name)}">
          </div>
          <h3 class="home-project-title">${firstCharTitle(project.name)}</h3>
          <div class="home-project-meta"><span>${project.count} 张照片</span><span>${esc(project.year || '日期未知')}</span></div>
        </a>
      </article>`;
  }
  function mountAutoFilmSlider(slider, projectCount) {
    if (!slider || projectCount < 2) return;

    let hoverPaused = false;
    let manualPaused = false;
    let resumeTimer = null;
    let raf = null;
    let last = performance.now();
    let carry = 0;
    let pointerHasMoved = false;
    let inViewport = false;
    const speed = 34; // px / second — slow film movement, but clearly visible.

    const originals = () => [...slider.querySelectorAll('.home-project-card:not([data-loop-clone="true"])')];
    const firstClone = () => slider.querySelector('[data-loop-start="true"]');

    const loopDistance = () => {
      const first = originals()[0];
      const clone = firstClone();
      if (!first || !clone) return 0;
      return Math.max(0, clone.offsetLeft - first.offsetLeft);
    };

    const normalize = () => {
      const distance = loopDistance();
      if (!distance) return;
      if (slider.scrollLeft >= distance) slider.scrollLeft -= distance;
      else if (slider.scrollLeft < 0) slider.scrollLeft += distance;
    };

    const eligible = () =>
      inViewport &&
      !hoverPaused &&
      !manualPaused &&
      !document.hidden &&
      !slider.hidden &&
      innerWidth > 820 &&
      slider.scrollWidth > slider.clientWidth + 4;

    const stop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = null;
      carry = 0;
    };

    const tick = now => {
      raf = null;
      if (!eligible()) return;
      const dt = Math.min(64, Math.max(0, now - last));
      last = now;
      carry += speed * dt / 1000;
      const step = Math.floor(carry);
      if (step >= 1) {
        slider.scrollLeft += step;
        carry -= step;
        normalize();
      }
      raf = requestAnimationFrame(tick);
    };

    const startLoop = () => {
      if (raf || !eligible()) return;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    };

    const syncLoop = () => eligible() ? startLoop() : stop();

    const pauseForManualInput = (delay = 1400) => {
      clearTimeout(resumeTimer);
      manualPaused = true;
      stop();
      resumeTimer = setTimeout(() => {
        manualPaused = false;
        last = performance.now();
        startLoop();
      }, delay);
    };

    // Autoplay only consumes frames while the film strip is actually visible.
    const io = 'IntersectionObserver' in window
      ? new IntersectionObserver(entries => {
          inViewport = entries.some(entry => entry.isIntersecting);
          syncLoop();
        }, { rootMargin:'120px 0px', threshold:.01 })
      : null;
    if (io) io.observe(slider);
    else inViewport = true;

    // Hover pause is armed only after real pointer movement. This keeps autoplay
    // visible on page entry even if the cursor happens to already sit on a card.
    slider.addEventListener('pointermove', e => {
      pointerHasMoved = true;
      const paused = Boolean(e.target.closest('.home-project-card'));
      if (paused !== hoverPaused) {
        hoverPaused = paused;
        syncLoop();
      }
    }, { passive:true });
    slider.addEventListener('pointerleave', () => {
      hoverPaused = false;
      startLoop();
    });

    slider.addEventListener('focusin', e => {
      if (e.target.closest('.home-project-card')) {
        hoverPaused = true;
        stop();
      }
    });
    slider.addEventListener('focusout', e => {
      if (!slider.contains(e.relatedTarget)) {
        hoverPaused = false;
        startLoop();
      }
    });

    slider.addEventListener('wheel', () => pauseForManualInput(1700), { passive:true });
    slider.addEventListener('pointerdown', () => {
      clearTimeout(resumeTimer);
      manualPaused = true;
      stop();
    });
    ['pointerup','pointercancel','lostpointercapture'].forEach(type =>
      slider.addEventListener(type, () => pauseForManualInput(1100))
    );

    slider.addEventListener('film-visibility-change', syncLoop);
    document.addEventListener('visibilitychange', syncLoop);
    addEventListener('resize', syncLoop, { passive:true });

    // Give layout/images a moment to establish the loop distance.
    setTimeout(() => {
      inViewport = io ? inViewport : true;
      startLoop();
    }, 650);

    addEventListener('pagehide', () => {
      clearTimeout(resumeTimer);
      stop();
      io?.disconnect();
    }, { once:true });
  }

  function setHeroPhoto(container, photo, immediate = false) {
    if (!container || !photo?.url) return;
    const safe = esc(photo.url);
    const slide = document.createElement('div');
    slide.className = 'cinema-hero-slide';
    slide.innerHTML = `<img class="cinema-hero-backdrop" decoding="async" src="${safe}" alt="" aria-hidden="true"><img class="cinema-hero-image" decoding="async" src="${safe}" alt="${esc(photo.project || 'Hero image')}">`;
    const main = slide.querySelector('.cinema-hero-image');
    const decide = () => { slide.dataset.fit = heroFit(photo, main); };
    main?.addEventListener('load', decide, { once:true });
    decide();
    container.appendChild(slide);
    const previous = [...container.querySelectorAll('.cinema-hero-slide.is-active')].find(el => el !== slide);
    requestAnimationFrame(() => {
      slide.classList.add('is-active');
      if (previous) previous.classList.add('is-leaving');
    });
    if (previous) setTimeout(() => previous.remove(), immediate ? 0 : 1500);
  }
  function mountAdaptiveHeroCarousel(container, photos) {
    if (!container || !photos?.length) return;
    let pool = heroCandidates(photos), index = 0, timer = null;
    if (!pool.length) return;
    setHeroPhoto(container, pool[0], true);

    const next = () => {
      if (document.hidden || pool.length < 2) return;
      index = (index + 1) % pool.length;
      if (index === 0) pool = shuffled(pool);
      setHeroPhoto(container, pool[index]);
    };
    const start = () => {
      clearInterval(timer);
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) timer = setInterval(next, 8500);
    };
    start();

    let resizeTimer = null;
    addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const currentUrl = container.querySelector('.cinema-hero-slide.is-active .cinema-hero-image')?.src;
        pool = heroCandidates(photos);
        const found = pool.findIndex(p => p.url === currentUrl);
        index = found >= 0 ? found : 0;
      }, 260);
    }, { passive:true });
    document.addEventListener('visibilitychange', () => document.hidden ? clearInterval(timer) : start());
  }

  async function updateCount() {
    const targets = $$('[data-global-count]');
    if (!targets.length) return;
    if (!A?.configured) return targets.forEach(el => el.textContent = 'NOT CONNECTED');
    const [photos, settings] = await Promise.all([photosSafe(), A?.loadSiteSettings ? A.loadSiteSettings() : Promise.resolve({})]);
    const visible = photos ? (A?.filterVisiblePhotos ? A.filterVisiblePhotos(photos, settings) : photos) : null;
    targets.forEach(el => el.textContent = visible ? `${visible.length} PHOTOS` : 'LOAD ERROR');
  }

  async function initHome() {
    if (page !== 'home') return;
    const slider = $('#home-project-slider');
    const list = $('#home-project-list');
    const count = $('#home-project-count');
    const heroBg = $('#home-hero-bg');
    const heroTitle = $('[data-home-title]');
    const preview = $('#home-list-preview');
    if (!slider || !list) return;

    const siteSettings = A?.loadSiteSettings ? await A.loadSiteSettings() : {};
    if (heroTitle) heroTitle.innerHTML = firstCharTitle(siteSettings.englishName || A?.config?.englishName || 'PHOTO ARCHIVE');

    if (!A?.configured) {
      slider.innerHTML = setupNotice();
      return;
    }
    const photos = await photosSafe();
    if (!photos) {
      slider.innerHTML = '<div class="home-loading">读取失败，请检查网络与 Supabase 配置。</div>';
      return;
    }
    if (!photos.length) {
      slider.innerHTML = '<div class="home-loading">还没有照片。进入管理后台上传第一批照片。</div>';
      return;
    }
    const publicPhotos = A?.filterVisiblePhotos ? A.filterVisiblePhotos(photos, siteSettings) : photos;
    if (!publicPhotos.length) {
      slider.innerHTML = '<div class="home-loading">目前没有公开展示的摄影集。你可以在管理后台重新设为 VISIBLE。</div>';
      if (count) count.textContent = '00 个摄影集';
      return;
    }

    // 首页摄影集按实际拍摄时间排序：每个摄影集取其中最新一张照片的时间，
    // 最新摄影集排在最前；同一时间则按摄影集名称稳定排序。
    // 这里使用 EXIF dateTaken，缺失时才回退到 uploadedAt，避免“后上传旧照片”打乱首页年代顺序。
    const latestTimeByProject = new Map();
    publicPhotos.forEach(photo => {
      const name = photo.project || '未分类';
      const time = A.photoTime ? A.photoTime(photo) : new Date(photo.exif?.dateTaken || photo.uploadedAt || 0).getTime();
      const current = latestTimeByProject.get(name) || 0;
      if (time > current) latestTimeByProject.set(name, time);
    });
    const projects = A.groupProjects(publicPhotos).sort((a, b) => {
      const diff = (latestTimeByProject.get(b.name) || 0) - (latestTimeByProject.get(a.name) || 0);
      return diff || String(a.name).localeCompare(String(b.name), 'zh-CN');
    });
    if (count) count.textContent = `${String(projects.length).padStart(2,'0')} 个摄影集`;
    if (heroBg) mountAdaptiveHeroCarousel(heroBg, publicPhotos);

    const filmMarkup = projects.map((project, i) => projectCardMarkup(project, i, publicPhotos, false)).join('');
    // Duplicate one exact copy so the strip can loop seamlessly while still keeping every card clickable.
    const filmCloneMarkup = projects.length > 1 ? projects.map((project, i) => projectCardMarkup(project, i, publicPhotos, true)).join('') : '';
    slider.innerHTML = filmMarkup + filmCloneMarkup;

    list.innerHTML = projects.map((project, i) => `
      <a class="home-list-row" data-transition href="project.html?collection=${encodeURIComponent(project.name)}" data-preview="${esc(project.cover.url)}">
        <span class="mono">${String(i+1).padStart(2,'0')}</span>
        <span class="home-list-name">${firstCharTitle(project.name)}</span>
        <span>${project.count} 张</span>
        <span>${esc(project.year || '—')}</span>
      </a>`).join('');

    const buttons = $$('[data-home-view]');
    const setView = mode => {
      const isSlider = mode === 'slider';
      slider.hidden = !isSlider;
      list.hidden = isSlider;
      $('.home-slider-help')?.toggleAttribute('hidden', !isSlider);
      buttons.forEach(btn => btn.classList.toggle('is-active', btn.dataset.homeView === mode));
      slider.dispatchEvent(new CustomEvent('film-visibility-change'));
    };
    buttons.forEach(btn => btn.addEventListener('click', () => setView(btn.dataset.homeView)));
    // Every visit starts in the cinematic horizontal film-strip view. LIST remains an optional temporary view.
    setView('slider');

    // Free horizontal film movement — no card snapping.
    // Trackpads keep their native pixel-by-pixel feel; mouse/pen dragging gets
    // direct 1:1 movement plus a short inertial glide after release.
    slider.addEventListener('wheel', e => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      e.preventDefault();
      slider.scrollLeft += e.deltaY;
    }, {passive:false});

    let pointerDown = false, dragging = false, dragMoved = false;
    let dragPointerId = null, startX = 0, startScroll = 0;
    let lastX = 0, lastT = 0, velocity = 0, inertiaRaf = null;

    const stopInertia = () => {
      if (inertiaRaf) cancelAnimationFrame(inertiaRaf);
      inertiaRaf = null;
    };

    const startInertia = () => {
      stopInertia();
      // velocity is pointer px/ms; scroll moves in the opposite direction.
      let v = -velocity * 16.67;
      if (Math.abs(v) < .35) return;
      const step = () => {
        v *= .935;
        if (Math.abs(v) < .22) {
          inertiaRaf = null;
          return;
        }
        slider.scrollLeft += v;
        inertiaRaf = requestAnimationFrame(step);
      };
      inertiaRaf = requestAnimationFrame(step);
    };

    slider.addEventListener('pointerdown', e => {
      // Let touch screens use the browser's native kinetic horizontal scrolling.
      if (e.pointerType === 'touch') return;
      if (e.button != null && e.button !== 0) return;
      stopInertia();
      pointerDown = true;
      dragging = false;
      dragMoved = false;
      dragPointerId = e.pointerId;
      startX = lastX = e.clientX;
      startScroll = slider.scrollLeft;
      lastT = performance.now();
      velocity = 0;
    });

    slider.addEventListener('pointermove', e => {
      if (!pointerDown || e.pointerId !== dragPointerId) return;
      const dx = e.clientX - startX;
      if (!dragging && Math.abs(dx) > 4) {
        dragging = true;
        dragMoved = true;
        slider.classList.add('is-dragging');
        slider.setPointerCapture?.(e.pointerId);
      }
      if (!dragging) return;
      e.preventDefault();
      const now = performance.now();
      const dt = Math.max(1, now - lastT);
      velocity = (e.clientX - lastX) / dt;
      lastX = e.clientX;
      lastT = now;
      slider.scrollLeft = startScroll - dx;
    }, {passive:false});

    const finishDrag = () => {
      if (dragging && slider.hasPointerCapture?.(dragPointerId)) {
        try { slider.releasePointerCapture(dragPointerId); } catch (_) {}
      }
      const wasDragging = dragging;
      pointerDown = false;
      dragging = false;
      dragPointerId = null;
      slider.classList.remove('is-dragging');
      if (wasDragging) startInertia();
      if (dragMoved) setTimeout(() => { dragMoved = false; }, 340);
    };
    ['pointerup','pointercancel','lostpointercapture'].forEach(type => slider.addEventListener(type, finishDrag));

    slider.addEventListener('click', e => {
      if (!dragMoved) return; // ordinary click: let the project <a> navigate.
      e.preventDefault();
      e.stopPropagation();
      dragMoved = false;
    }, true);

    if (preview) {
      const img = preview.querySelector('img');
      $$('.home-list-row', list).forEach(row => {
        row.addEventListener('pointerenter', () => { if (img) img.src = row.dataset.preview; preview.classList.add('is-visible'); });
        row.addEventListener('pointermove', e => { preview.style.left = `${e.clientX}px`; preview.style.top = `${e.clientY}px`; });
        row.addEventListener('pointerleave', () => preview.classList.remove('is-visible'));
      });
    }
    // Desktop keeps the continuous auto-film engine. On small screens the CSS
    // intentionally turns the originals into a vertical, touch-safe collection
    // sheet and hides loop clones, so every collection is reachable by normal
    // page scrolling and remains tappable.
    if (innerWidth > 820) mountAutoFilmSlider(slider, projects.length);
    UI()?.activateReveals(slider);
  }

  function exifPairs(photo) {
    const e = photo.exif || {}, f = photo.formatted || {};
    return [
      ['设备', e.camera], ['镜头', e.lens], ['焦段', f.focalLength], ['光圈', f.aperture],
      ['快门', f.shutter], ['ISO', f.iso?.replace('ISO ', '')], ['曝光', f.compensation],
      ['拍摄', e.dateTaken ? dateLabel(e.dateTaken) : null]
    ].filter(([,v]) => v != null && v !== '');
  }
  function timelineItem(photo, index, browseContext = null) {
    const pairs = exifPairs(photo);
    const w = Number(photo.exif?.width || 0), h = Number(photo.exif?.height || 0);
    const shape = w && h ? (h > w * 1.12 ? 'is-portrait' : w > h * 1.28 ? 'is-wide' : 'is-standard') : 'is-standard';
    return `<article class="project-flow-item ${shape} reveal">
      <div class="project-flow-media"><a data-transition data-photo-id="${esc(photo.id)}" href="${esc(withBrowseContext(`photo.html?id=${encodeURIComponent(photo.id)}&collection=${encodeURIComponent(photo.project || '未分类')}`, browseContext || {}))}"><img loading="lazy" decoding="async" fetchpriority="low" src="${esc(photo.url)}" alt="${esc(photo.project || '摄影作品')}"></a></div>
      <div class="project-flow-caption">
        <span class="project-flow-index mono">${String(index+1).padStart(2,'0')}</span>
        <div class="project-flow-exif">${pairs.length ? pairs.map(([l,v])=>`<div><small>${esc(l)}</small><b>${esc(v)}</b></div>`).join('') : '<div><small>EXIF</small><b>无可读信息</b></div>'}</div>
      </div>
    </article>`;
  }
  async function initProject() {
    if (page !== 'project') return;
    const collection = new URLSearchParams(location.search).get('collection');
    const timeline = $('#project-timeline');
    if (!collection) {
      if (timeline) timeline.innerHTML = '<div class="archive-empty">没有指定摄影集。</div>';
      return;
    }
    if (!A?.configured) { if (timeline) timeline.innerHTML = setupNotice(); return; }
    const siteSettings = A?.loadSiteSettings ? await A.loadSiteSettings() : {};
    if (A?.isProjectVisible && !A.isProjectVisible(collection, siteSettings)) {
      if (timeline) timeline.innerHTML = '<div class="archive-empty">这个摄影集目前设为 HIDDEN，没有公开展示。</div>';
      document.title = `Private Collection — ${A.config.siteName || '摄影档案'}`;
      return;
    }
    const photos = await photosSafe({project:collection,sort:'oldest'});
    if (!photos?.length) { if (timeline) timeline.innerHTML = '<div class="archive-empty">这个摄影集还没有照片。</div>'; return; }
    const years = photos.map(p=>new Date(p.exif?.dateTaken || p.uploadedAt)).filter(d=>!Number.isNaN(d.getTime())).map(d=>d.getFullYear());
    const year = years.length ? (Math.min(...years)===Math.max(...years)?String(years[0]):`${Math.min(...years)}—${Math.max(...years)}`) : '—';
    document.title = `${collection} — ${A.config.siteName || '摄影档案'}`;
    $$('[data-project-title]').forEach(el => el.innerHTML = firstCharTitle(collection));
    $$('[data-project-year]').forEach(el => el.textContent = year);
    $$('[data-project-count]').forEach(el => el.textContent = `${photos.length} 张`);
    $$('[data-project-camera]').forEach(el => el.textContent = A.buildStats(photos).primaryCamera || '多设备');

    const intro = String(siteSettings?.collectionDescriptions?.[collection] || '').trim();
    $$('[data-project-description]').forEach(el => {
      el.textContent = intro;
      el.hidden = !intro;
    });

    const orderButtons = $$('[data-project-order]');
    let orderMode = localStorage.getItem('project-order-mode') === 'shuffle' ? 'shuffle' : 'time';
    let projectShuffleSeed = makeShuffleSeed();
    let currentProjectOrder = [];
    const renderProject = (reshuffle = false) => {
      if (orderMode === 'shuffle' && reshuffle) projectShuffleSeed = makeShuffleSeed();
      currentProjectOrder = orderMode === 'shuffle' ? seededShuffle(photos, projectShuffleSeed) : [...photos];
      const browseContext = orderMode === 'shuffle'
        ? { mode:'shuffle', seed:projectShuffleSeed, source:'project', scope:collection }
        : null;
      timeline.innerHTML = currentProjectOrder.map((photo, index) => timelineItem(photo, index, browseContext)).join('');
      UI()?.activateReveals(timeline);
      orderButtons.forEach(btn => btn.classList.toggle('is-active', btn.dataset.projectOrder === orderMode));
    };
    orderButtons.forEach(btn => btn.addEventListener('click', () => {
      const nextMode = btn.dataset.projectOrder === 'shuffle' ? 'shuffle' : 'time';
      const reroll = nextMode === 'shuffle' && orderMode === 'shuffle';
      orderMode = nextMode;
      localStorage.setItem('project-order-mode', orderMode);
      renderProject(reroll);
    }));
    renderProject();

    // Preserve the exact visible order when entering the single-photo viewer.
    // A shuffled collection becomes a one-pass random deck starting at the
    // clicked image; chronological mode keeps its actual position.
    timeline.addEventListener('click', event => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target.closest('a[data-photo-id]');
      if (!anchor) return;
      if (orderMode === 'shuffle') {
        anchor.href = withBrowseContext(anchor.href, {
          mode:'shuffle', seed:projectShuffleSeed, source:'project', scope:collection
        });
      }
      const token = savePhotoNavState({
        source:'project',
        mode:orderMode,
        items:currentProjectOrder,
        clickedId:anchor.dataset.photoId,
        collection
      });
      attachNavToken(anchor, token);
    });

    const all = await photosSafe();
    const publicAll = all ? (A?.filterVisiblePhotos ? A.filterVisiblePhotos(all, siteSettings) : all) : [];
    const projects = A.groupProjects(publicAll);
    const here = projects.findIndex(p=>p.name===collection);
    const next = projects.length > 1 ? projects[(here+1)%projects.length] : null;
    const link = $('#next-project');
    if (link) {
      link.href = next ? `project.html?collection=${encodeURIComponent(next.name)}` : 'archive.html';
      $('#next-project-title').textContent = next?.name || '全部档案';
    }
  }

  function archiveCard(photo, browseContext = null) {
    return `<article class="archive-card" data-project="${esc(photo.project || '未分类')}">
      <a data-transition data-photo-id="${esc(photo.id)}" href="${esc(withBrowseContext(`photo.html?id=${encodeURIComponent(photo.id)}&collection=${encodeURIComponent(photo.project || '未分类')}`, browseContext || {}))}">
        <img loading="lazy" decoding="async" fetchpriority="low" src="${esc(photo.url)}" alt="${esc(photo.project || '摄影作品')}">
        <div class="archive-card-meta"><span>${esc(photo.project || '未分类')}</span><span>${esc(dateLabel(photo.exif?.dateTaken || photo.uploadedAt))}</span></div>
      </a>
    </article>`;
  }
  async function initArchive() {
    if (page !== 'archive') return;
    const grid = $('#archive-grid'), count = $('#archive-count'), filter = $('#archive-filter');
    if (!A?.configured) { grid.innerHTML = setupNotice(); return; }
    const [photos, siteSettings] = await Promise.all([photosSafe(), A?.loadSiteSettings ? A.loadSiteSettings() : Promise.resolve({})]);
    if (!photos) { grid.innerHTML = '<div class="archive-empty">读取失败，请检查网络。</div>'; return; }

    const publicPhotos = A?.filterVisiblePhotos ? A.filterVisiblePhotos(photos, siteSettings) : photos;
    const projects = [...new Set(publicPhotos.map(p=>p.project || '未分类'))].sort((a,b)=>a.localeCompare(b,'zh-CN'));
    filter.insertAdjacentHTML('beforeend', projects.map(p=>`<option value="${esc(p)}">${esc(p)}</option>`).join(''));

    // Segment the archive so hundreds of photographs are not inserted into the DOM at once.
    // The first screen loads a useful contact sheet; more cards append as the user approaches the bottom.
    const FIRST_BATCH = innerWidth >= 1500 ? 36 : innerWidth >= 900 ? 28 : 18;
    const NEXT_BATCH = innerWidth >= 900 ? 20 : 14;
    let ordered = [];
    let rendered = 0;
    let sentinelObserver = null;
    let archiveShuffleSeed = makeShuffleSeed();
    let archiveScope = '';

    const sentinel = document.createElement('div');
    sentinel.className = 'archive-load-sentinel';
    sentinel.setAttribute('aria-hidden','true');
    grid.insertAdjacentElement('afterend', sentinel);

    const appendBatch = () => {
      if (rendered >= ordered.length) {
        sentinel.hidden = true;
        return;
      }
      const size = rendered === 0 ? FIRST_BATCH : NEXT_BATCH;
      const batch = ordered.slice(rendered, rendered + size);
      const browseContext = orderMode === 'shuffle'
        ? { mode:'shuffle', seed:archiveShuffleSeed, source:'archive', scope:archiveScope }
        : null;
      grid.insertAdjacentHTML('beforeend', batch.map(photo => archiveCard(photo, browseContext)).join(''));
      rendered += batch.length;
      sentinel.hidden = rendered >= ordered.length;
      // Archive cards intentionally skip reveal observers. With hundreds of
      // large photographs, immediate paint + lazy image decoding is smoother.
    };

    const setupObserver = () => {
      sentinelObserver?.disconnect();
      if (!('IntersectionObserver' in window)) return;
      sentinelObserver = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) appendBatch();
      }, { rootMargin:'520px 0px', threshold:0 });
      sentinelObserver.observe(sentinel);
    };

    const orderButtons = $$('[data-archive-order]');
    let orderMode = localStorage.getItem('archive-order-mode') === 'shuffle' ? 'shuffle' : 'time';

    const rebuild = (reroll = false) => {
      const visible = filter.value ? publicPhotos.filter(p=>(p.project||'未分类')===filter.value) : publicPhotos;
      const chronological = [...visible].sort((a,b) => (A.photoTime?.(b) || 0) - (A.photoTime?.(a) || 0));
      archiveScope = filter.value || '';
      if (orderMode === 'shuffle' && reroll) archiveShuffleSeed = makeShuffleSeed();
      ordered = orderMode === 'shuffle' ? seededShuffle(chronological, archiveShuffleSeed) : chronological;
      rendered = 0;
      grid.innerHTML = '';
      count.textContent = `${visible.length} 张照片`;
      orderButtons.forEach(btn => btn.classList.toggle('is-active', btn.dataset.archiveOrder === orderMode));
      appendBatch();
      setupObserver();
    };

    orderButtons.forEach(btn => btn.addEventListener('click', () => {
      const nextMode = btn.dataset.archiveOrder === 'shuffle' ? 'shuffle' : 'time';
      const reroll = nextMode === 'shuffle' && orderMode === 'shuffle';
      orderMode = nextMode;
      localStorage.setItem('archive-order-mode', orderMode);
      rebuild(reroll);
    }));
    filter.addEventListener('change', rebuild);
    rebuild();

    // Capture the current Archive order before the transition handler runs.
    // In SHUFFLE, the clicked photo starts a finite random viewing session at
    // 01/N; in TIME, the viewer retains the true chronological position.
    grid.addEventListener('click', event => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target.closest('a[data-photo-id]');
      if (!anchor) return;
      if (orderMode === 'shuffle') {
        anchor.href = withBrowseContext(anchor.href, {
          mode:'shuffle', seed:archiveShuffleSeed, source:'archive', scope:filter.value || ''
        });
      }
      const token = savePhotoNavState({
        source:'archive',
        mode:orderMode,
        items:ordered,
        clickedId:anchor.dataset.photoId,
        collection:filter.value || ''
      });
      attachNavToken(anchor, token);
    });

    addEventListener('pagehide', () => sentinelObserver?.disconnect(), { once:true });
  }

  async function initPhotoView() {
    if (page !== 'photo') return;
    const root = $('#photo-view-root');
    if (!A?.configured) { root.innerHTML = setupNotice(); return; }

    const params = new URLSearchParams(location.search);
    const initialId = params.get('id');
    const initialCollection = params.get('collection');
    const navToken = params.get('nav') || '';
    const urlBrowseMode = params.get('browse') === 'shuffle' ? 'shuffle' : '';
    const urlBrowseSeed = params.get('seed') || '';
    const urlBrowseSource = params.get('source') || '';
    const urlBrowseScope = params.get('scope') || '';
    if (!initialId) { root.innerHTML = '<div class="photo-view-error">没有指定照片。</div>'; return; }

    const [allPhotos, settings] = await Promise.all([
      photosSafe(),
      A?.loadSiteSettings ? A.loadSiteSettings() : Promise.resolve({})
    ]);
    if (!allPhotos) { root.innerHTML = '<div class="photo-view-error">照片读取失败，请检查网络。</div>'; return; }

    const publicPhotos = A?.filterVisiblePhotos ? A.filterVisiblePhotos(allPhotos, settings) : allPhotos;
    const byId = new Map(publicPhotos.map(photo => [String(photo.id), photo]));
    const navState = readPhotoNavState(navToken);

    let sequence = [];
    let source = navState?.source || 'direct';
    let mode = navState?.mode || 'time';
    let sourceCollection = navState?.collection || initialCollection || '';

    // URL context is the mobile-safe source of truth for SHUFFLE. It makes the
    // tapped image 01/N and keeps a finite deck, even if sessionStorage is lost
    // during a touch navigation or an in-app browser page transition.
    if (urlBrowseMode === 'shuffle' && urlBrowseSeed) {
      let scoped = urlBrowseScope
        ? publicPhotos.filter(photo => (photo.project || '未分类') === urlBrowseScope)
        : publicPhotos;
      const chronological = [...scoped].sort((a,b) => (A.photoTime?.(b) || 0) - (A.photoTime?.(a) || 0));
      sequence = rotateFromId(seededShuffle(chronological, urlBrowseSeed), initialId);
      source = urlBrowseSource || (urlBrowseScope ? 'project' : 'archive');
      mode = 'shuffle';
      sourceCollection = source === 'project' ? (urlBrowseScope || initialCollection || '') : '';
    } else if (navState?.ids?.includes(String(initialId))) {
      sequence = navState.ids.map(id => byId.get(String(id))).filter(Boolean);
    }

    // Direct links still work without a stored browsing session.
    if (!sequence.length) {
      let scoped = initialCollection
        ? publicPhotos.filter(photo => (photo.project || '未分类') === initialCollection)
        : publicPhotos;
      scoped = [...scoped].sort((a,b) => (A.photoTime?.(a) || 0) - (A.photoTime?.(b) || 0));
      sequence = scoped;
      source = initialCollection ? 'project' : 'archive';
      mode = 'time';
      sourceCollection = initialCollection || '';
    }

    let currentIndex = sequence.findIndex(photo => String(photo.id) === String(initialId));
    if (currentIndex < 0) {
      const fallback = byId.get(String(initialId));
      if (!fallback) {
        root.innerHTML = '<div class="photo-view-error">这张照片不存在，或所属摄影集已隐藏。</div>';
        return;
      }
      sequence = [fallback];
      currentIndex = 0;
    }

    const img = $('#photo-view-image');
    const prevBtns = [$('#photo-view-prev'), $('#photo-view-prev-edge')].filter(Boolean);
    const nextBtns = [$('#photo-view-next'), $('#photo-view-next-edge')].filter(Boolean);
    const backLink = $('.photo-view-actions a');
    let renderVersion = 0;

    const destinationForBack = () => {
      if (source === 'project' && sourceCollection) {
        return `project.html?collection=${encodeURIComponent(sourceCollection)}`;
      }
      return 'archive.html';
    };
    if (backLink) backLink.href = destinationForBack();

    const preloadNeighbor = photo => {
      if (!photo?.url) return;
      const preload = new Image();
      preload.decoding = 'async';
      preload.src = photo.url;
    };

    const renderAt = async (index, { push = false } = {}) => {
      if (index < 0 || index >= sequence.length) return;
      currentIndex = index;
      const photo = sequence[currentIndex];
      const version = ++renderVersion;

      document.title = `${photo.project || 'PHOTO'} — ${A.config.siteName || 'Photo Archive'}`;
      $('#photo-view-index').textContent = `${String(currentIndex + 1).padStart(2,'0')} / ${String(sequence.length).padStart(2,'0')}${mode === 'shuffle' ? ' · SHUFFLE' : ''}`;
      $('#photo-view-date').textContent = dateLabel(photo.exif?.dateTaken || photo.uploadedAt);
      $('#photo-view-collection').textContent = photo.project || '未分类';

      const pairs = exifPairs(photo);
      $('#photo-view-exif').innerHTML = pairs.length
        ? pairs.map(([label,value]) => `<div><small>${esc(label)}</small><b>${esc(value)}</b></div>`).join('')
        : '<div><small>EXIF</small><b>无可读信息</b></div>';

      const prev = sequence[currentIndex - 1] || null;
      const next = sequence[currentIndex + 1] || null;
      prevBtns.forEach(btn => {
        btn.disabled = !prev;
        btn.setAttribute('aria-disabled', String(!prev));
      });
      nextBtns.forEach(btn => {
        btn.disabled = !next;
        btn.setAttribute('aria-disabled', String(!next));
      });

      if (push) {
        const url = new URL(location.href);
        url.searchParams.set('id', photo.id);
        url.searchParams.set('collection', photo.project || '未分类');
        if (navToken) url.searchParams.set('nav', navToken);
        history.pushState({ photoId:String(photo.id) }, '', url);
      }

      img.alt = photo.project || '摄影作品';
      if (img.src !== photo.url) {
        img.classList.add('is-switching');
        img.src = photo.url;
        try { await img.decode(); } catch (_) {}
        if (version === renderVersion) img.classList.remove('is-switching');
      }

      preloadNeighbor(prev);
      preloadNeighbor(next);
    };

    const goDelta = delta => {
      const targetIndex = currentIndex + delta;
      if (targetIndex < 0 || targetIndex >= sequence.length) return;
      renderAt(targetIndex, { push:true });
    };

    prevBtns.forEach(btn => btn.addEventListener('click', () => goDelta(-1)));
    nextBtns.forEach(btn => btn.addEventListener('click', () => goDelta(1)));

    document.addEventListener('keydown', event => {
      if (event.key === 'ArrowLeft') goDelta(-1);
      if (event.key === 'ArrowRight') goDelta(1);
      if (event.key === 'Escape') location.href = destinationForBack();
    });

    addEventListener('popstate', () => {
      const id = new URLSearchParams(location.search).get('id');
      const at = sequence.findIndex(photo => String(photo.id) === String(id));
      if (at >= 0) renderAt(at, { push:false });
    });

    await renderAt(currentIndex, { push:false });
  }

  function renderBars(el,items){
    if (!el) return;
    if (!items?.length){el.innerHTML='<p class="chart-empty">暂无数据</p>';return;}
    const max=Math.max(...items.map(i=>i.count));
    el.innerHTML=items.map(i=>`<div class="bar-row"><div class="bar-label"><span>${esc(i.label)}</span><span>${i.count}</span></div><div class="bar-track"><i style="width:${Math.max(3,i.count/max*100)}%"></i></div></div>`).join('');
  }
  async function initStats(){
    if(page!=='stats') return;
    const root=$('#stats-root');
    if(!A?.configured){root.innerHTML=setupNotice();return;}
    const [photos, siteSettings]=await Promise.all([photosSafe(), A?.loadSiteSettings ? A.loadSiteSettings() : Promise.resolve({})]);
    if(!photos){root.innerHTML='<div class="archive-empty">统计读取失败。</div>';return;}
    const publicPhotos=A?.filterVisiblePhotos ? A.filterVisiblePhotos(photos,siteSettings) : photos;
    const s=A.buildStats(publicPhotos);
    $('#stat-total').textContent=s.total;
    $('#stat-exif').textContent=`${s.exifCoverage}%`;
    $('#stat-camera').textContent=s.primaryCamera||'—';
    $('#stat-focal').textContent=s.medianFocalLength?`${Number(s.medianFocalLength.toFixed(1))}mm`:'—';
    const donut=$('#camera-donut');
    const pct=s.total&&s.cameras[0]?Math.round(s.cameras[0].count/s.total*100):0;
    donut?.style.setProperty('--donut-pct',`${pct}%`);
    $('#camera-donut-value').textContent=`${pct}%`;
    $('#camera-legend').innerHTML=s.cameras.slice(0,5).map(i=>`<div><span>${esc(i.label)}</span><b>${i.count}</b></div>`).join('')||'<p class="chart-empty">暂无设备数据</p>';
    renderBars($('#lens-bars'),s.lenses);
    renderBars($('#focal-bars'),s.focalLengths);
    renderBars($('#aperture-bars'),s.apertures);
    renderBars($('#iso-bars'),s.iso);
    renderBars($('#year-bars'),s.years);
  }

  updateCount();
  initHome();
  initProject();
  initArchive();
  initPhotoView();
  initStats();
})();
