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

  function chooseHeroPhoto(photos, projectName) {
    const candidates = photos.filter(p => (p.project || '未分类') === projectName && p.url);
    if (!candidates.length) return null;
    const viewportRatio = Math.max(1, innerWidth) / Math.max(1, innerHeight);
    const scored = candidates.map((photo, index) => {
      const w = Number(photo.exif?.width || 0), h = Number(photo.exif?.height || 0);
      const ratio = w && h ? w / h : null;
      const ratioScore = ratio ? Math.abs(Math.log(ratio / viewportRatio)) : 3;
      const featuredBonus = photo.isFeatured ? -.3 : 0;
      return { photo, score:ratioScore + featuredBonus + index * .00001 };
    }).sort((a,b)=>a.score-b.score);
    return scored[0].photo;
  }

  function mountAdaptiveHero(container, photo) {
    if (!container || !photo?.url) return;
    const safe = esc(photo.url);
    container.innerHTML = `<img class="cinema-hero-backdrop" src="${safe}" alt="" aria-hidden="true"><img class="cinema-hero-image" src="${safe}" alt="${esc(photo.project || 'Hero image')}">`;
    const main = container.querySelector('.cinema-hero-image');
    const decide = () => {
      const w = Number(photo.exif?.width || main?.naturalWidth || 0);
      const h = Number(photo.exif?.height || main?.naturalHeight || 0);
      if (!w || !h) return container.dataset.fit = 'contain';
      const imageRatio = w / h;
      const viewportRatio = Math.max(1, innerWidth) / Math.max(1, innerHeight);
      const relative = imageRatio / viewportRatio;
      // Near the viewport ratio: permit only modest cropping. Extreme portrait/wide images stay fully visible.
      container.dataset.fit = relative > .78 && relative < 1.28 ? 'cover' : 'contain';
    };
    main?.addEventListener('load', decide, { once:true });
    decide();
    addEventListener('resize', decide, { passive:true });
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

    const projects = A.groupProjects(publicPhotos);
    if (count) count.textContent = `${String(projects.length).padStart(2,'0')} 个摄影集`;
    const heroPhoto = projects[0] ? (chooseHeroPhoto(publicPhotos, projects[0].name) || projects[0].cover) : null;
    if (heroBg && heroPhoto?.url) mountAdaptiveHero(heroBg, heroPhoto);

    slider.innerHTML = projects.map((project, i) => `
      <article class="home-project-card reveal">
        <a class="home-project-link" data-transition href="project.html?collection=${encodeURIComponent(project.name)}">
          <span class="home-project-num mono">${String(i+1).padStart(2,'0')} / ${esc(project.year || '—')}</span>
          <div class="home-project-frame"><img loading="${i < 2 ? 'eager':'lazy'}" src="${esc(project.cover.url)}" alt="${esc(project.name)}"></div>
          <h3 class="home-project-title">${firstCharTitle(project.name)}</h3>
          <div class="home-project-meta"><span>${project.count} 张照片</span><span>${esc(project.year || '日期未知')}</span></div>
        </a>
      </article>`).join('');

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
      localStorage.setItem('home-project-view', mode);
    };
    buttons.forEach(btn => btn.addEventListener('click', () => setView(btn.dataset.homeView)));
    setView(localStorage.getItem('home-project-view') === 'list' ? 'list' : 'slider');

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
        ${photo.note ? `<p class="photo-note">${esc(photo.note)}</p>` : ''}
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
    $$('[data-project-description]').forEach(el => el.textContent = `按拍摄时间排列的 ${photos.length} 个瞬间。照片保持原始比例，EXIF 作为独立信息带保留。`);
    timeline.innerHTML = photos.map(timelineItem).join('');
    UI()?.activateReveals(timeline);

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

    const render = () => {
      const visible = filter.value ? publicPhotos.filter(p=>(p.project||'未分类')===filter.value) : publicPhotos;
      count.textContent = `${visible.length} 张照片`;
      grid.innerHTML = visible.map(archiveCard).join('');
      UI()?.activateReveals(grid);
    };
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
