(() => {
  const A = window.PhotoArchive;
  const cfg = window.PHOTO_ARCHIVE_CONFIG || {};
  const $ = (s, ctx = document) => ctx.querySelector(s);
  const $$ = (s, ctx = document) => [...ctx.querySelectorAll(s)];

  // Config-driven labels + a site-wide English display name stored in Supabase Storage.
  function applyIdentity(settings = {}) {
    const englishName = String(settings.englishName || cfg.englishName || cfg.siteName || 'PHOTO ARCHIVE').trim() || 'PHOTO ARCHIVE';
    $$('[data-site-name]').forEach(el => el.textContent = cfg.siteName || '摄影档案');
    $$('[data-site-subtitle]').forEach(el => el.textContent = cfg.siteSubtitle || '摄影档案');
    $$('[data-english-name]').forEach(el => el.textContent = englishName);
    $$('[data-about-intro]').forEach(el => el.textContent = cfg.aboutIntro || '把照片留给未来的自己。');
    $$('[data-location]').forEach(el => el.textContent = cfg.location || '—');
    if (document.body.dataset.page === 'home') document.title = `${englishName} — PHOTO ARCHIVE`;
  }
  applyIdentity();
  if (A?.loadSiteSettings) A.loadSiteSettings().then(applyIdentity).catch(()=>{});

  // Loader: only once per tab session.
  const loader = $('.cinematic-loader');
  if (loader) {
    const seen = sessionStorage.getItem('cinematic-loader-seen');
    const delay = seen ? 80 : 900;
    setTimeout(() => {
      loader.classList.add('is-gone');
      sessionStorage.setItem('cinematic-loader-seen', '1');
    }, delay);
  }

  // Tiny loader clock.
  const loaderTime = $('[data-loader-time]');
  if (loaderTime) {
    const tick = () => {
      const d = new Date();
      loaderTime.textContent = d.toLocaleTimeString('zh-CN', { hour12:false, hour:'2-digit', minute:'2-digit', second:'2-digit' });
    };
    tick(); setInterval(tick, 1000);
  }

  // Mobile menu.
  const menuBtn = $('[data-mobile-menu-button]');
  const menu = $('[data-mobile-menu]');
  menuBtn?.addEventListener('click', () => {
    const open = menu?.classList.toggle('is-open');
    menuBtn.setAttribute('aria-expanded', String(Boolean(open)));
    document.documentElement.style.overflow = open ? 'hidden' : '';
  });
  $$('[data-mobile-menu] a').forEach(a => a.addEventListener('click', () => {
    menu?.classList.remove('is-open'); document.documentElement.style.overflow = '';
  }));

  // Custom cursor.
  const dot = $('.cursor-dot'), ring = $('.cursor-ring');
  if (dot && ring && matchMedia('(pointer:fine)').matches) {
    document.body.classList.add('custom-cursor-ready');
    let rx = innerWidth / 2, ry = innerHeight / 2, tx = rx, ty = ry;
    addEventListener('pointermove', e => {
      tx = e.clientX; ty = e.clientY;
      dot.style.transform = `translate(${tx}px,${ty}px) translate(-50%,-50%)`;
    });
    const loop = () => {
      rx += (tx-rx)*.14; ry += (ty-ry)*.14;
      ring.style.transform = `translate(${rx}px,${ry}px) translate(-50%,-50%)`;
      requestAnimationFrame(loop);
    }; loop();
    document.addEventListener('pointerover', e => {
      ring.classList.toggle('is-active', Boolean(e.target.closest('a,button,.project-visual,.archive-card,.home-project-card,.home-list-row,.admin-photo-card')));
    });
  }

  // Page transition wipe for internal links.
  const wipe = $('.page-wipe');
  document.addEventListener('click', e => {
    const a = e.target.closest('a[data-transition]');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || a.target === '_blank') return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin) return;
    e.preventDefault();
    wipe?.classList.add('is-entering');
    setTimeout(() => { location.href = a.href; }, 430);
  });

  // Reveal items, including dynamically inserted ones.
  function activateReveals(root = document) {
    const els = $$('.reveal:not(.is-visible)', root);
    if (!('IntersectionObserver' in window)) return els.forEach(el => el.classList.add('is-visible'));
    const io = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add('is-visible'); io.unobserve(entry.target); }
    }), { threshold:.06, rootMargin:'0px 0px -4%' });
    els.forEach(el => io.observe(el));
  }
  window.CinematicUI = { activateReveals };
  activateReveals();

  // Creative mode: restrained motion, stored locally.
  const creativeBtn = $('[data-creative-toggle]');
  const creativeOn = localStorage.getItem('creative-mode') === '1';
  document.body.classList.toggle('creative-mode', creativeOn);
  if (creativeBtn) creativeBtn.textContent = creativeOn ? 'CREATIVE ON' : 'CREATIVE OFF';
  creativeBtn?.addEventListener('click', () => {
    const on = document.body.classList.toggle('creative-mode');
    localStorage.setItem('creative-mode', on ? '1' : '0');
    creativeBtn.textContent = on ? 'CREATIVE ON' : 'CREATIVE OFF';
  });



  // Home hero parallax, only while Creative mode is on.
  const cinemaHero = $('.cinema-hero');
  const cinemaHeroBg = $('.cinema-hero-bg');
  cinemaHero?.addEventListener('pointermove', e => {
    if (!document.body.classList.contains('creative-mode') || innerWidth < 981 || !cinemaHeroBg) return;
    const r = cinemaHero.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width - .5) * 12;
    const y = ((e.clientY - r.top) / r.height - .5) * 9;
    cinemaHeroBg.style.translate = `${x}px ${y}px`;
  });
  cinemaHero?.addEventListener('pointerleave', () => { if (cinemaHeroBg) cinemaHeroBg.style.translate = ''; });

  // Timeline progress.
  const timeline = $('.timeline');
  if (timeline) {
    const update = () => {
      const rect = timeline.getBoundingClientRect();
      const vh = innerHeight;
      const progress = Math.max(0, Math.min(1, (vh * .72 - rect.top) / Math.max(1, rect.height - vh * .25)));
      timeline.style.setProperty('--timeline-progress', progress.toFixed(4));
    };
    addEventListener('scroll', update, { passive:true });
    addEventListener('resize', update); update();
  }

  // V7 — transparent at the top, glass navigation after the page starts moving.
  // Keeping the top state quiet prevents the header from looking like a box pasted onto the hero image.
  const siteHeader = $('.site-header');
  if (siteHeader) {
    let ticking = false;
    const syncHeader = () => {
      const y = window.scrollY || document.documentElement.scrollTop || 0;
      siteHeader.classList.toggle('is-scrolled', y > 28);
      siteHeader.classList.toggle('is-deep-scrolled', y > Math.max(220, innerHeight * .42));
      ticking = false;
    };
    const requestHeaderSync = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(syncHeader);
    };
    addEventListener('scroll', requestHeaderSync, { passive:true });
    addEventListener('resize', requestHeaderSync, { passive:true });
    syncHeader();
  }

  // Mark active nav by page.
  const page = document.body.dataset.page;
  $$('[data-nav-page]').forEach(a => {
    if (a.dataset.navPage === page) a.setAttribute('aria-current','page');
  });
})();
