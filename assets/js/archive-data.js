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
            <img class="home-project-backdrop" loading="lazy" src="${safeUrl}" alt="" aria-hidden="true">
            <img class="home-project-image" loading="${!clone && i < 2 ? 'eager':'lazy'}" src="${safeUrl}" alt="${esc(project.name)}">
          </div>
          <h3 class="home-project-title">${firstCharTitle(project.name)}</h3>
          <div class="home-project-meta"><span>${project.count} 张照片</span><span>${esc(project.year || '日期未知')}</span></div>
        </a>
      </article>`;
  }
  function mountAutoFilmSlider(slider, projectCount) {
    if (!slider || projectCount < 2 || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let paused = false, interacting = false, resumeTimer = null, raf = null, last = 0;
    const speed = 18; // px / second: intentionally slow, like a moving film strip.
    const loopPoint = () => slider.querySelector('[data-loop-start="true"]')?.offsetLeft || 0;
    const normalize = () => {
      const point = loopPoint();
      if (!point) return;
      if (slider.scrollLeft >= point) slider.scrollLeft -= point;
    };
    const tick = now => {
      if (!last) last = now;
      const dt = Math.min(40, now - last);
      last = now;
      if (!paused && !interacting && !document.hidden && innerWidth > 820) {
        slider.scrollLeft += speed * dt / 1000;
        normalize();
      }
      raf = requestAnimationFrame(tick);
    };
    const pause = () => { paused = true; };
    const resume = () => { paused = false; last = performance.now(); };
    const delayResume = (delay = 1100) => {
      clearTimeout(resumeTimer);
      interacting = true;
      resumeTimer = setTimeout(() => { interacting = false; last = performance.now(); }, delay);
    };
    slider.addEventListener('pointerenter', pause);
    slider.addEventListener('pointerleave', resume);
    slider.addEventListener('focusin', pause);
    slider.addEventListener('focusout', e => { if (!slider.contains(e.relatedTarget)) resume(); });
    slider.addEventListener('wheel', () => delayResume(1400), { passive:true });
    slider.addEventListener('pointerdown', () => { interacting = true; });
    ['pointerup','pointercancel','lostpointercapture'].forEach(type => slider.addEventListener(type, () => delayResume(900)));
    document.addEventListener('visibilitychange', () => { last = performance.now(); });
    raf = requestAnimationFrame(tick);
    addEventListener('pagehide', () => cancelAnimationFrame(raf), { once:true });
  }

  function setHeroPhoto(container, photo, immediate = false) {
    if (!container || !photo?.url) return;
    const safe = esc(photo.url);
    const slide = document.createElement('div');
    slide.className = 'cinema-hero-slide';
    slide.innerHTML = `<img class="cinema-hero-backdrop" src="${safe}" alt="" aria-hidden="true"><img class="cinema-hero-image" src="${safe}" alt="${esc(photo.project || 'Hero image')}">`;
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
    };
    buttons.forEach(btn => btn.addEventListener('click', () => setView(btn.dataset.homeView)));
    // Every visit starts in the cinematic horizontal film-strip view. LIST remains an optional temporary view.
    setView('slider');

    // Horizontal wheel + drag interaction, mirroring the first cinematic prototype.
    slider.addEventListener('wheel', e => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      e.preventDefault();
      slider.scrollLeft += e.deltaY * .9;
    }, {passive:false});
    let dragging = false, dragMoved = false, startX = 0, startScroll = 0;
    slider.addEventListener('pointerdown', e => {
      dragging = true; dragMoved = false; startX = e.clientX; startScroll = slider.scrollLeft;
      slider.setPointerCapture?.(e.pointerId);
    });
    slider.addEventListener('pointermove', e => {
      if (!dragging) return;
      if (Math.abs(e.clientX - startX) > 6) dragMoved = true;
      slider.scrollLeft = startScroll - (e.clientX - startX);
    });
    slider.addEventListener('click', e => { if (dragMoved) { e.preventDefault(); e.stopPropagation(); dragMoved = false; } }, true);
    ['pointerup','pointercancel','lostpointercapture'].forEach(type => slider.addEventListener(type, () => dragging = false));

    if (preview) {
      const img = preview.querySelector('img');
      $$('.home-list-row', list).forEach(row => {
        row.addEventListener('pointerenter', () => { if (img) img.src = row.dataset.preview; preview.classList.add('is-visible'); });
        row.addEventListener('pointermove', e => { preview.style.left = `${e.clientX}px`; preview.style.top = `${e.clientY}px`; });
        row.addEventListener('pointerleave', () => preview.classList.remove('is-visible'));
      });
    }
    mountAutoFilmSlider(slider, projects.length);
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
  function timelineItem(photo, index) {
    const pairs = exifPairs(photo);
    const w = Number(photo.exif?.width || 0), h = Number(photo.exif?.height || 0);
    const shape = w && h ? (h > w * 1.12 ? 'is-portrait' : w > h * 1.28 ? 'is-wide' : 'is-standard') : 'is-standard';
    return `<article class="project-flow-item ${shape} reveal">
      <div class="project-flow-media"><img loading="lazy" src="${esc(photo.url)}" alt="${esc(photo.project || '摄影作品')}"></div>
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
    $$('[data-project-description]').forEach(el => el.textContent = intro || '这个摄影集还没有简介。');

    const orderButtons = $$('[data-project-order]');
    let orderMode = localStorage.getItem('project-order-mode') === 'shuffle' ? 'shuffle' : 'time';
    const renderProject = (reshuffle = false) => {
      const ordered = orderMode === 'shuffle' ? shuffled(photos) : photos;
      timeline.innerHTML = ordered.map(timelineItem).join('');
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

  function archiveCard(photo) {
    return `<article class="archive-card reveal" data-project="${esc(photo.project || '未分类')}">
      <a data-transition href="project.html?collection=${encodeURIComponent(photo.project || '未分类')}">
        <img loading="lazy" src="${esc(photo.url)}" alt="${esc(photo.project || '摄影作品')}">
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

    const orderButtons = $$('[data-archive-order]');
    let orderMode = localStorage.getItem('archive-order-mode') === 'shuffle' ? 'shuffle' : 'time';
    const render = () => {
      const visible = filter.value ? publicPhotos.filter(p=>(p.project||'未分类')===filter.value) : publicPhotos;
      const ordered = orderMode === 'shuffle' ? shuffled(visible) : visible;
      count.textContent = `${visible.length} 张照片`;
      grid.innerHTML = ordered.map(archiveCard).join('');
      orderButtons.forEach(btn => btn.classList.toggle('is-active', btn.dataset.archiveOrder === orderMode));
      UI()?.activateReveals(grid);
    };
    orderButtons.forEach(btn => btn.addEventListener('click', () => {
      const nextMode = btn.dataset.archiveOrder === 'shuffle' ? 'shuffle' : 'time';
      orderMode = nextMode;
      localStorage.setItem('archive-order-mode', orderMode);
      render();
    }));
    filter.addEventListener('change',render); render();
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
  initStats();
})();
