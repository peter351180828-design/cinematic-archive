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

  async function updateCount() {
    const targets = $$('[data-global-count]');
    if (!targets.length) return;
    if (!A?.configured) return targets.forEach(el => el.textContent = '未连接');
    const photos = await photosSafe();
    targets.forEach(el => el.textContent = photos ? `${photos.length} 张` : '读取失败');
  }

  async function initHome() {
    if (page !== 'home') return;
    const stage = $('#projects-stage');
    const rail = $('#filmstrip-rail');
    if (!stage) return;
    if (!A?.configured) {
      stage.innerHTML = `<section class="home-empty">${setupNotice()}</section>`;
      return;
    }
    const photos = await photosSafe();
    if (!photos) {
      stage.innerHTML = `<section class="home-empty"><div><h2>读取失败</h2><p>请检查网络与 Supabase 配置。</p></div></section>`;
      return;
    }
    if (!photos.length) {
      stage.innerHTML = `<section class="home-empty"><div><h2><span class="accent-char">还</span>没有照片</h2><p>进入管理后台上传第一批照片。摄影集会自动出现在这里。</p></div></section>`;
      return;
    }
    const projects = A.groupProjects(photos);
    stage.innerHTML = projects.map((project, i) => `
      <a class="project-scene reveal" id="project-${i}" data-transition href="project.html?collection=${encodeURIComponent(project.name)}">
        <span class="project-number">${String(i+1).padStart(2,'0')} / ${String(projects.length).padStart(2,'0')}</span>
        <div class="project-visual"><img loading="${i < 2 ? 'eager':'lazy'}" src="${esc(project.cover.url)}" alt="${esc(project.name)}"></div>
        <div class="project-title-wrap">
          <h2 class="project-title">${firstCharTitle(project.name)}</h2>
          <div class="project-kicker"><span>${esc(project.year || '—')}</span><br><span>${project.count} 张照片</span></div>
        </div>
      </a>`).join('');

    if (rail) {
      rail.innerHTML = projects.slice(0,12).map((p,i)=>`<button class="filmstrip-thumb ${i===0?'is-active':''}" type="button" data-target="project-${i}" aria-label="前往 ${esc(p.name)}"><img src="${esc(p.cover.url)}" alt=""></button>`).join('');
      rail.querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => document.getElementById(btn.dataset.target)?.scrollIntoView({behavior:'smooth'})));
      const scenes = $$('.project-scene');
      if ('IntersectionObserver' in window) {
        const io = new IntersectionObserver(entries => entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          const idx = Number(entry.target.id.replace('project-',''));
          rail.querySelectorAll('button').forEach((b,i)=>b.classList.toggle('is-active',i===idx));
        }), {threshold:.55});
        scenes.forEach(s=>io.observe(s));
      }
    }
    UI()?.activateReveals(stage);
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
    return `<article class="timeline-item reveal">
      <div class="timeline-media"><img loading="lazy" src="${esc(photo.url)}" alt="${esc(photo.project || '摄影作品')}"></div>
      <span class="timeline-node" aria-hidden="true"></span>
      <aside class="timeline-exif">
        <span class="exif-index">${String(index+1).padStart(2,'0')}</span>
        <div class="exif-list">${pairs.length ? pairs.map(([l,v])=>`<div class="exif-pair"><small>${esc(l)}</small><b>${esc(v)}</b></div>`).join('') : '<div class="exif-pair"><small>EXIF</small><b>无可读信息</b></div>'}</div>
        ${photo.note ? `<p class="photo-note">${esc(photo.note)}</p>` : ''}
      </aside>
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
    const photos = await photosSafe({project:collection,sort:'oldest'});
    if (!photos?.length) { if (timeline) timeline.innerHTML = '<div class="archive-empty">这个摄影集还没有照片。</div>'; return; }
    const years = photos.map(p=>new Date(p.exif?.dateTaken || p.uploadedAt)).filter(d=>!Number.isNaN(d.getTime())).map(d=>d.getFullYear());
    const year = years.length ? (Math.min(...years)===Math.max(...years)?String(years[0]):`${Math.min(...years)}—${Math.max(...years)}`) : '—';
    document.title = `${collection} — ${A.config.siteName || '摄影档案'}`;
    $$('[data-project-title]').forEach(el => el.innerHTML = firstCharTitle(collection));
    $$('[data-project-year]').forEach(el => el.textContent = year);
    $$('[data-project-count]').forEach(el => el.textContent = `${photos.length} 张`);
    $$('[data-project-camera]').forEach(el => el.textContent = A.buildStats(photos).primaryCamera || '多设备');
    $$('[data-project-description]').forEach(el => el.textContent = `按拍摄时间排列的 ${photos.length} 个瞬间。完整画幅展示，EXIF 信息与照片并列保留。`);
    timeline.innerHTML = `<div class="timeline-line" aria-hidden="true"></div>${photos.map(timelineItem).join('')}`;
    UI()?.activateReveals(timeline);

    const all = await photosSafe();
    const projects = all ? A.groupProjects(all) : [];
    const here = projects.findIndex(p=>p.name===collection);
    const next = projects.length > 1 ? projects[(here+1)%projects.length] : null;
    const link = $('#next-project');
    if (link) {
      link.href = next ? `project.html?collection=${encodeURIComponent(next.name)}` : 'archive.html';
      $('#next-project-title').textContent = next?.name || '全部档案';
    }
  }

  function archiveCard(photo) {
    const exif = [photo.exif?.camera, photo.formatted?.focalLength, photo.formatted?.aperture, photo.formatted?.shutter].filter(Boolean);
    return `<article class="archive-card reveal" data-project="${esc(photo.project || '未分类')}">
      <a data-transition href="project.html?collection=${encodeURIComponent(photo.project || '未分类')}">
        <img loading="lazy" src="${esc(photo.url)}" alt="${esc(photo.project || '摄影作品')}">
        <div class="archive-card-meta"><span>${esc(photo.project || '未分类')}</span><span>${esc(dateLabel(photo.exif?.dateTaken || photo.uploadedAt))}</span></div>
        <div class="archive-card-exif">${exif.map(v=>`<span>${esc(v)}</span>`).join('')}</div>
      </a>
    </article>`;
  }
  function archiveIndexRow(photo,index) {
    const exif = [photo.exif?.camera, photo.formatted?.focalLength, photo.formatted?.aperture].filter(Boolean).join(' · ');
    return `<a class="archive-index-row" data-transition href="project.html?collection=${encodeURIComponent(photo.project || '未分类')}" data-preview="${esc(photo.url)}">
      <span>${String(index+1).padStart(3,'0')}</span><span>${esc(photo.project || '未分类')}</span><span>${esc(exif || '无 EXIF')}</span><span>${esc(dateLabel(photo.exif?.dateTaken || photo.uploadedAt))}</span>
    </a>`;
  }
  async function initArchive() {
    if (page !== 'archive') return;
    const grid = $('#archive-grid'), indexList = $('#archive-index'), count = $('#archive-count'), filter = $('#archive-filter');
    if (!A?.configured) { grid.innerHTML = setupNotice(); return; }
    const photos = await photosSafe();
    if (!photos) { grid.innerHTML = '<div class="archive-empty">读取失败，请检查网络。</div>'; return; }
    const projects = [...new Set(photos.map(p=>p.project || '未分类'))].sort((a,b)=>a.localeCompare(b,'zh-CN'));
    filter.insertAdjacentHTML('beforeend', projects.map(p=>`<option value="${esc(p)}">${esc(p)}</option>`).join(''));

    const render = () => {
      const visible = filter.value ? photos.filter(p=>(p.project||'未分类')===filter.value) : photos;
      count.textContent = `${visible.length} 张照片`;
      grid.innerHTML = visible.map(archiveCard).join('');
      indexList.innerHTML = visible.map(archiveIndexRow).join('');
      UI()?.activateReveals(grid);
      bindPreview();
    };
    filter.addEventListener('change',render); render();

    const gridBtn = $('#view-grid'), indexBtn = $('#view-index');
    const setView = mode => {
      const isGrid = mode==='grid';
      grid.hidden = !isGrid; indexList.hidden = isGrid;
      gridBtn.classList.toggle('is-active',isGrid); indexBtn.classList.toggle('is-active',!isGrid);
      localStorage.setItem('archive-view',mode);
    };
    gridBtn.addEventListener('click',()=>setView('grid'));
    indexBtn.addEventListener('click',()=>setView('index'));
    setView(localStorage.getItem('archive-view')==='index'?'index':'grid');

    function bindPreview(){
      const preview = $('#archive-preview'), img = preview?.querySelector('img');
      if (!preview || !img) return;
      $$('.archive-index-row',indexList).forEach(row=>{
        row.addEventListener('pointerenter',()=>{ img.src=row.dataset.preview; preview.classList.add('is-visible'); });
        row.addEventListener('pointermove',e=>{ preview.style.left=`${Math.min(innerWidth-240,Math.max(240,e.clientX))}px`;preview.style.top=`${Math.min(innerHeight-220,Math.max(220,e.clientY))}px`; });
        row.addEventListener('pointerleave',()=>preview.classList.remove('is-visible'));
      });
    }
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
    const photos=await photosSafe();
    if(!photos){root.innerHTML='<div class="archive-empty">统计读取失败。</div>';return;}
    const s=A.buildStats(photos);
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
