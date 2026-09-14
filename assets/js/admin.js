(() => {
  const A = window.PhotoArchive;
  const $ = (s, ctx=document) => ctx.querySelector(s);
  const $$ = (s, ctx=document) => [...ctx.querySelectorAll(s)];
  const escapeHtml = A?.escapeHtml || (s => String(s || ''));

  const authGate = $('#auth-gate'), adminApp = $('#admin-app'), status = $('#auth-status');
  const loginForm = $('#login-form'), logoutBtn = $('#logout-button');
  const uploadForm = $('#upload-form'), fileInput = $('#photo-input'), dropZone = $('#drop-zone');
  const selectedFiles = $('#selected-files'), uploadStatus = $('#upload-status');
  const uploadProjectSelect = $('#upload-project-select'), newProjectField = $('#new-project-field');
  const newProjectInput = $('#upload-project-new'), projectHint = $('#project-upload-hint');

  const libraryProject = $('#admin-library-project');
  const photoList = $('#admin-photo-list');
  const selectedCount = $('#admin-selected-count');
  const visibleCount = $('#admin-visible-count');
  const selectAllBtn = $('#admin-select-all'), clearBtn = $('#admin-clear-selection'), deleteBtn = $('#admin-delete-selected');
  const identityForm = $('#identity-form'), englishNameInput = $('#english-display-name'), identityStatus = $('#identity-status');
  const visibilityList = $('#collection-visibility-list'), visibilityStatus = $('#collection-visibility-status'), visibilitySummary = $('#collection-visibility-summary');

  let files = [];
  let currentUser = null;
  let knownProjects = [];
  let libraryPhotos = [];
  let visiblePhotos = [];
  let siteSettings = { hiddenProjects: [] };
  const selectedIds = new Set();

  function setStatus(message, isError=false) {
    if (!status) return;
    status.textContent = message;
    status.classList.toggle('error', isError);
  }

  function configMissing() {
    if (A?.configured) return false;
    authGate.innerHTML = `<div class="setup-notice"><strong>还差两项连接信息</strong><span>把旧测试站 assets/js/config.js 中已经可用的 Supabase URL 与 Publishable key 复制到新站同名文件。不要填写 Secret key。</span></div>`;
    return true;
  }

  function normalizeProjectName(value) { return String(value || '').trim().replace(/\s+/g, ' '); }
  function canonicalExistingProject(value) {
    const normalized = normalizeProjectName(value);
    if (!normalized) return null;
    return knownProjects.find(p => p.name.localeCompare(normalized, 'zh-CN', { sensitivity:'base' }) === 0) || null;
  }

  function syncProjectChooser(preferredName = '') {
    if (!uploadProjectSelect) return;
    const previous = preferredName || (uploadProjectSelect.value !== '__new__' ? uploadProjectSelect.value : '');
    uploadProjectSelect.innerHTML = knownProjects.map(p => `<option value="${escapeHtml(p.name)}">${escapeHtml(p.name)} · ${p.count} 张</option>`).join('') + '<option value="__new__">＋ 新建摄影集</option>';
    const match = canonicalExistingProject(previous);
    if (match) uploadProjectSelect.value = match.name;
    else if (knownProjects.length) uploadProjectSelect.value = knownProjects[0].name;
    else uploadProjectSelect.value = '__new__';
    updateProjectMode();
  }

  function syncLibraryChooser(preferredName = '') {
    if (!libraryProject) return;
    const current = preferredName || libraryProject.value || '__all__';
    libraryProject.innerHTML = '<option value="__all__">全部摄影集</option>' + knownProjects.map(p => `<option value="${escapeHtml(p.name)}">${escapeHtml(p.name)} · ${p.count} 张</option>`).join('');
    libraryProject.value = knownProjects.some(p=>p.name===current) ? current : '__all__';
  }

  function updateProjectMode() {
    if (!uploadProjectSelect || !newProjectField || !newProjectInput) return;
    const creating = uploadProjectSelect.value === '__new__';
    newProjectField.hidden = !creating;
    newProjectInput.required = creating;
    if (creating) {
      projectHint.textContent = knownProjects.length ? '新建摄影集；若名称与已有摄影集相同，会自动归入原摄影集。' : '这是你的第一个摄影集。';
    } else {
      const p = canonicalExistingProject(uploadProjectSelect.value);
      projectHint.textContent = `这批照片会追加到「${p?.name || uploadProjectSelect.value}」${p ? `，当前已有 ${p.count} 张` : ''}。`;
    }
  }

  uploadProjectSelect?.addEventListener('change', updateProjectMode);
  newProjectInput?.addEventListener('input', () => {
    if (uploadProjectSelect?.value !== '__new__') return;
    const match = canonicalExistingProject(newProjectInput.value);
    projectHint.textContent = match ? `已存在「${match.name}」，上传时会自动追加到这个摄影集。` : '这是一个新摄影集名称。';
  });

  function resolvedProjectName() {
    if (!uploadProjectSelect) return '未分类';
    if (uploadProjectSelect.value !== '__new__') return normalizeProjectName(uploadProjectSelect.value) || '未分类';
    const typed = normalizeProjectName(newProjectInput?.value);
    if (!typed) throw new Error('请输入新摄影集名称，或选择已有摄影集。');
    return canonicalExistingProject(typed)?.name || typed;
  }

  async function loadIdentitySettings() {
    if (!englishNameInput || !A?.loadSiteSettings) return;
    try {
      const settings = await A.loadSiteSettings(true);
      siteSettings = { ...settings, hiddenProjects:Array.isArray(settings.hiddenProjects) ? settings.hiddenProjects : [] };
      englishNameInput.value = settings.englishName || A.config.englishName || '';
      if (identityStatus) identityStatus.textContent = '当前名称已同步';
      renderCollectionVisibility();
    } catch (error) {
      if (identityStatus) identityStatus.textContent = `读取名称失败：${error.message || error}`;
    }
  }

  function hiddenProjectsSet() {
    return new Set((Array.isArray(siteSettings.hiddenProjects) ? siteSettings.hiddenProjects : []).map(v => String(v || '').trim()).filter(Boolean));
  }

  function renderCollectionVisibility() {
    if (!visibilityList) return;
    const hidden = hiddenProjectsSet();
    const visibleProjects = knownProjects.filter(p => !hidden.has(p.name)).length;
    if (visibilitySummary) visibilitySummary.textContent = `${visibleProjects} VISIBLE / ${knownProjects.length - visibleProjects} HIDDEN`;
    if (!knownProjects.length) {
      visibilityList.innerHTML = '<p class="admin-message">还没有摄影集。上传第一批照片后，这里会出现展示开关。</p>';
      return;
    }
    visibilityList.innerHTML = knownProjects.map(project => {
      const isVisible = !hidden.has(project.name);
      return `<div class="collection-visibility-row ${isVisible ? '' : 'is-hidden'}">
        <div class="collection-visibility-copy"><b>${escapeHtml(project.name)}</b><span>${project.count} PHOTOS</span></div>
        <label class="collection-visibility-switch">
          <input type="checkbox" data-collection-visibility data-project="${escapeHtml(project.name)}" ${isVisible ? 'checked' : ''}>
          <span class="collection-switch-track"><i></i></span>
          <em>${isVisible ? 'VISIBLE' : 'HIDDEN'}</em>
        </label>
      </div>`;
    }).join('');
  }

  async function saveCollectionVisibility(projectName, shouldShow, input) {
    if (!currentUser || !A?.saveSiteSettings) return;
    const hidden = hiddenProjectsSet();
    if (shouldShow) hidden.delete(projectName); else hidden.add(projectName);
    if (visibilityStatus) visibilityStatus.textContent = `正在${shouldShow ? '显示' : '隐藏'}「${projectName}」…`;
    if (input) input.disabled = true;
    try {
      siteSettings = await A.saveSiteSettings({ hiddenProjects:[...hidden] });
      if (!Array.isArray(siteSettings.hiddenProjects)) siteSettings.hiddenProjects = [];
      if (visibilityStatus) visibilityStatus.textContent = `已保存 · 「${projectName}」现在为 ${shouldShow ? 'VISIBLE' : 'HIDDEN'}`;
      renderCollectionVisibility();
    } catch (error) {
      console.error(error);
      if (visibilityStatus) visibilityStatus.textContent = `保存失败：${error.message || error}`;
      if (input) { input.checked = !shouldShow; input.disabled = false; }
    }
  }

  visibilityList?.addEventListener('change', e => {
    const input = e.target.closest('[data-collection-visibility]');
    if (!input) return;
    saveCollectionVisibility(input.dataset.project || '', input.checked, input);
  });

  identityForm?.addEventListener('submit', async e => {
    e.preventDefault();
    if (!currentUser) return;
    const value = String(englishNameInput?.value || '').trim().replace(/\s+/g,' ');
    if (!value) { identityStatus.textContent = '请输入英文用户名。'; return; }
    const button = identityForm.querySelector('button[type="submit"]');
    button.disabled = true; identityStatus.textContent = '正在保存…';
    try {
      const saved = await A.saveSiteSettings({ englishName:value });
      identityStatus.textContent = `已保存：${saved.englishName}`;
      document.querySelectorAll('[data-english-name]').forEach(el => el.textContent = saved.englishName);
    } catch (error) {
      console.error(error); identityStatus.textContent = `保存失败：${error.message || error}`;
    } finally { button.disabled = false; }
  });

  async function refreshAuth() {
    if (configMissing()) return;
    const { data, error } = await A.client.auth.getSession();
    if (error) setStatus(error.message, true);
    currentUser = data?.session?.user || null;
    authGate.hidden = Boolean(currentUser);
    adminApp.hidden = !currentUser;
    logoutBtn.hidden = !currentUser;
    if (currentUser) {
      $('#signed-in-email').textContent = currentUser.email || '已登录';
      await loadIdentitySettings();
      await loadLibrary();
    }
  }

  loginForm?.addEventListener('submit', async e => {
    e.preventDefault(); setStatus('正在登录…');
    const email = $('#login-email').value.trim(), password = $('#login-password').value;
    const { error } = await A.client.auth.signInWithPassword({ email, password });
    if (error) return setStatus(`登录失败：${error.message}`, true);
    setStatus('登录成功'); await refreshAuth();
  });
  logoutBtn?.addEventListener('click', async () => { await A.client.auth.signOut(); location.reload(); });

  function readNumber(raw) {
    if (raw == null || raw === '') return null;
    if (Array.isArray(raw)) raw = raw[0];
    const n = Number(raw); return Number.isFinite(n) ? n : null;
  }
  function readExifDate(raw) {
    const value = raw?.DateTimeOriginal || raw?.CreateDate || raw?.DateTimeDigitized || null;
    if (!value) return null;
    const d = value instanceof Date ? value : new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  async function extractExif(file) {
    if (!window.exifr) return {};
    try {
      const raw = await window.exifr.parse(file) || {};
      const make = String(raw.Make || '').trim() || null;
      const model = String(raw.Model || '').trim() || null;
      let aperture = readNumber(raw.FNumber);
      if (aperture == null) { const av = readNumber(raw.ApertureValue); if (av != null) aperture = Math.pow(2, av/2); }
      let exposureTime = readNumber(raw.ExposureTime);
      if (exposureTime == null) { const sv = readNumber(raw.ShutterSpeedValue); if (sv != null) exposureTime = Math.pow(2, -sv); }
      return {
        make, model, camera: A.cameraLabel(make, model), lens: String(raw.LensModel || raw.Lens || '').trim() || null,
        focal_length: readNumber(raw.FocalLength), focal_length_35mm: readNumber(raw.FocalLengthIn35mmFormat), aperture,
        exposure_time: exposureTime, iso: readNumber(raw.ISO || raw.ISOSpeedRatings || raw.PhotographicSensitivity),
        exposure_compensation: readNumber(raw.ExposureCompensation), date_taken: readExifDate(raw), orientation: readNumber(raw.Orientation)
      };
    } catch (error) { console.warn('EXIF 读取失败：', file.name, error); return {}; }
  }
  async function decodeImage(file) {
    if ('createImageBitmap' in window) {
      try { const bitmap = await createImageBitmap(file, { imageOrientation:'from-image' }); return { source:bitmap, width:bitmap.width, height:bitmap.height, close:() => bitmap.close?.() }; } catch {}
    }
    return await new Promise((resolve,reject) => {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => resolve({ source:img, width:img.naturalWidth, height:img.naturalHeight, close:() => URL.revokeObjectURL(url) });
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('浏览器无法读取这张图片')); };
      img.src = url;
    });
  }
  async function makeWebImage(file) {
    const decoded = await decodeImage(file);
    const maxEdge = Number(A.config.maxUploadEdge) || 2560;
    const scale = Math.min(1, maxEdge / Math.max(decoded.width, decoded.height));
    const width = Math.max(1, Math.round(decoded.width * scale)), height = Math.max(1, Math.round(decoded.height * scale));
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha:false }); ctx.fillStyle = '#0a0a0a'; ctx.fillRect(0,0,width,height); ctx.drawImage(decoded.source,0,0,width,height); decoded.close();
    const blob = await new Promise((resolve,reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('无法生成网页图片')), 'image/jpeg', Number(A.config.jpegQuality) || .88));
    return { blob, width, height };
  }
  function uuid() { return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`; }

  function setFiles(next) {
    files = [...next].filter(f => ['image/jpeg','image/png','image/webp'].includes(f.type));
    dropZone.classList.toggle('has-files', files.length > 0);
    selectedFiles.textContent = files.length ? `已选择 ${files.length} 张 · ${files.map(f=>f.name).slice(0,4).join(' / ')}${files.length>4?' …':''}` : '尚未选择照片';
  }
  fileInput?.addEventListener('change', () => setFiles(fileInput.files));
  ['dragenter','dragover'].forEach(type => dropZone?.addEventListener(type,e=>{e.preventDefault();dropZone.classList.add('dragging')}));
  ['dragleave','drop'].forEach(type => dropZone?.addEventListener(type,e=>{e.preventDefault();dropZone.classList.remove('dragging')}));
  dropZone?.addEventListener('drop', e => setFiles(e.dataTransfer.files));

  async function uploadOne(file, project, note, index, total) {
    uploadStatus.textContent = `正在处理 ${index + 1} / ${total} · ${file.name}`;
    const exif = await extractExif(file), web = await makeWebImage(file), now = new Date();
    const path = `${currentUser.id}/${now.getFullYear()}/${String(now.getMonth()+1).padStart(2,'0')}/${uuid()}.jpg`;
    const { error: uploadError } = await A.client.storage.from(A.bucket).upload(path, web.blob, { contentType:'image/jpeg', cacheControl:'31536000', upsert:false });
    if (uploadError) throw uploadError;
    const row = { owner_id:currentUser.id, title:file.name.replace(/\.[^.]+$/,''), project, note, storage_path:path, original_name:file.name, mime_type:'image/jpeg', bytes:web.blob.size, width:web.width, height:web.height, ...exif };
    const { error: insertError } = await A.client.from(A.table).insert(row);
    if (insertError) { await A.client.storage.from(A.bucket).remove([path]); throw insertError; }
  }

  uploadForm?.addEventListener('submit', async e => {
    e.preventDefault(); if (!currentUser) return;
    if (!files.length) return uploadStatus.textContent = '请先选择照片。';
    let project; try { project = resolvedProjectName(); } catch (error) { uploadStatus.textContent = error.message; return; }
    const note = $('#upload-note').value.trim(), button = uploadForm.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      for (let i=0;i<files.length;i++) await uploadOne(files[i], project, note, i, files.length);
      uploadStatus.textContent = `完成 · 已向「${project}」追加 ${files.length} 张照片。`;
      files = []; fileInput.value = ''; setFiles([]); newProjectInput.value = '';
      await loadLibrary(project);
      if (libraryProject) libraryProject.value = project;
      renderLibrary();
    } catch (error) { console.error(error); uploadStatus.textContent = `上传失败：${error.message || error}`; }
    finally { button.disabled = false; }
  });

  function photoCard(photo) {
    const checked = selectedIds.has(photo.id);
    const exif = [photo.formatted?.focalLength, photo.formatted?.aperture, photo.formatted?.shutter].filter(Boolean).join(' · ');
    return `<article class="admin-photo-card ${checked?'is-selected':''}" data-id="${escapeHtml(photo.id)}">
      <div class="admin-thumb-wrap">
        <img class="admin-thumb-blur" src="${escapeHtml(photo.url)}" alt="" aria-hidden="true" loading="lazy">
        <img class="admin-thumb-main" src="${escapeHtml(photo.url)}" alt="${escapeHtml(photo.project || '照片')}" loading="lazy">
        <label class="admin-check" title="选择照片"><input type="checkbox" data-select-photo ${checked?'checked':''}><span>✓</span></label>
        <button type="button" class="admin-card-edit" data-edit title="编辑照片">编辑</button>
      </div>
      <div class="admin-card-meta"><b>${escapeHtml(photo.project || '未分类')}</b><span>${escapeHtml(exif || '无 EXIF')}</span></div>
    </article>`;
  }

  function renderLibrary() {
    if (!photoList) return;
    const filter = libraryProject?.value || '__all__';
    visiblePhotos = filter === '__all__' ? libraryPhotos : libraryPhotos.filter(p => p.project === filter);
    const visibleIds = new Set(visiblePhotos.map(p=>p.id));
    [...selectedIds].forEach(id => { if (!libraryPhotos.some(p=>p.id===id)) selectedIds.delete(id); });
    photoList.innerHTML = visiblePhotos.length ? visiblePhotos.map(photoCard).join('') : '<p class="admin-message">这个摄影集还没有照片。</p>';
    visibleCount.textContent = `当前 ${visiblePhotos.length} 张`;
    const selectedVisible = [...selectedIds].filter(id => visibleIds.has(id)).length;
    selectedCount.textContent = `已选 ${selectedIds.size} 张${filter!=='__all__' && selectedIds.size!==selectedVisible ? `（当前集 ${selectedVisible}）` : ''}`;
    deleteBtn.disabled = selectedIds.size === 0;
    clearBtn.disabled = selectedIds.size === 0;
  }

  async function loadLibrary(preferredProject = '') {
    if (!currentUser) return;
    try {
      const all = await A.fetchPhotos();
      libraryPhotos = all.filter(p => !p.ownerId || p.ownerId === currentUser.id);
      knownProjects = A.groupProjects(libraryPhotos);
      syncProjectChooser(preferredProject);
      syncLibraryChooser(preferredProject);
      $('#admin-photo-count').textContent = `${libraryPhotos.length} 张 · ${knownProjects.length} 个摄影集`;
      renderCollectionVisibility();
      renderLibrary();
    } catch (error) { photoList.innerHTML = `<p class="admin-message">读取失败：${escapeHtml(error.message)}</p>`; }
  }

  libraryProject?.addEventListener('change', () => { selectedIds.clear(); renderLibrary(); });

  photoList?.addEventListener('change', e => {
    const checkbox = e.target.closest('[data-select-photo]'); if (!checkbox) return;
    const card = checkbox.closest('.admin-photo-card'), id = card?.dataset.id; if (!id) return;
    if (checkbox.checked) selectedIds.add(id); else selectedIds.delete(id);
    card.classList.toggle('is-selected', checkbox.checked); renderLibrary();
  });

  photoList?.addEventListener('click', async e => {
    const card = e.target.closest('.admin-photo-card'); if (!card) return;
    const id = card.dataset.id;
    if (e.target.closest('[data-edit]')) {
      const photo = libraryPhotos.find(p => p.id === id); if (!photo) return;
      const title = prompt('照片标题（仅后台使用）', photo.title); if (title == null) return;
      const project = prompt('摄影集名称', photo.project); if (project == null) return;
      const note = prompt('个人备注（可留空）', photo.note || ''); if (note == null) return;
      const normalizedProject = canonicalExistingProject(project)?.name || normalizeProjectName(project) || '未分类';
      const { error } = await A.client.from(A.table).update({ title:title.trim() || photo.title, project:normalizedProject, note:note.trim() }).eq('id', id);
      if (error) alert(`修改失败：${error.message}`); else await loadLibrary(normalizedProject);
      return;
    }
    if (e.target.closest('.admin-check')) return;
    const checkbox = card.querySelector('[data-select-photo]');
    checkbox.checked = !checkbox.checked;
    checkbox.dispatchEvent(new Event('change', {bubbles:true}));
  });

  selectAllBtn?.addEventListener('click', () => { visiblePhotos.forEach(p => selectedIds.add(p.id)); renderLibrary(); });
  clearBtn?.addEventListener('click', () => { selectedIds.clear(); renderLibrary(); });

  async function deleteSelected() {
    const photos = libraryPhotos.filter(p => selectedIds.has(p.id));
    if (!photos.length) return;
    const projects = [...new Set(photos.map(p=>p.project))];
    const summary = projects.length === 1 ? `「${projects[0]}」中的 ${photos.length} 张照片` : `${photos.length} 张照片（来自 ${projects.length} 个摄影集）`;
    if (!confirm(`确定永久删除${summary}吗？\n\n网页图片与数据库记录都会删除，此操作无法撤销。`)) return;

    deleteBtn.disabled = true; deleteBtn.textContent = `正在删除 ${photos.length} 张…`;
    try {
      const ids = photos.map(p=>p.id);
      for (let i=0;i<ids.length;i+=100) {
        const { error } = await A.client.from(A.table).delete().in('id', ids.slice(i,i+100));
        if (error) throw new Error(`数据库删除失败：${error.message}`);
      }
      // Database first: if Storage cleanup ever fails, the website will not be left with broken image records.
      const paths = photos.map(p=>p.storagePath).filter(Boolean);
      for (let i=0;i<paths.length;i+=100) {
        const { error } = await A.client.storage.from(A.bucket).remove(paths.slice(i,i+100));
        if (error) throw new Error(`照片记录已删除，但 Storage 清理失败：${error.message}`);
      }
      selectedIds.clear();
      await loadLibrary(libraryProject?.value === '__all__' ? '' : libraryProject?.value);
      setStatus(`已删除 ${photos.length} 张照片`);
    } catch (error) {
      console.error(error); alert(`批量删除失败：${error.message || error}\n\n请刷新照片管理区确认当前状态；若只是 Storage 清理失败，照片记录已经不会再出现在网站里。`);
    } finally { deleteBtn.textContent = '删除所选'; renderLibrary(); }
  }
  deleteBtn?.addEventListener('click', deleteSelected);

  if (A?.client) A.client.auth.onAuthStateChange(() => refreshAuth());
  refreshAuth();
})();
