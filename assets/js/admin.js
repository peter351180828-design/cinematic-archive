(() => {
  const A = window.PhotoArchive;
  const $ = (s, ctx=document) => ctx.querySelector(s);
  const escapeHtml = A?.escapeHtml || (s => String(s || ''));
  const authGate = $('#auth-gate'), adminApp = $('#admin-app'), status = $('#auth-status');
  const loginForm = $('#login-form'), logoutBtn = $('#logout-button');
  const uploadForm = $('#upload-form'), fileInput = $('#photo-input'), dropZone = $('#drop-zone');
  const selected = $('#selected-files'), uploadStatus = $('#upload-status'), photoList = $('#admin-photo-list');
  const projectSelect = $('#upload-project-select'), newProjectField = $('#new-project-field');
  const newProjectInput = $('#upload-project-new'), projectHint = $('#project-upload-hint');
  let files = [];
  let currentUser = null;
  let knownProjects = [];

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

  function normalizeProjectName(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
  }

  function canonicalExistingProject(value) {
    const normalized = normalizeProjectName(value);
    if (!normalized) return null;
    return knownProjects.find(p => p.name.localeCompare(normalized, 'zh-CN', { sensitivity:'base' }) === 0) || null;
  }

  function syncProjectChooser(preferredName = '') {
    if (!projectSelect) return;
    const previous = preferredName || (projectSelect.value !== '__new__' ? projectSelect.value : '');
    projectSelect.innerHTML = knownProjects.map(p =>
      `<option value="${escapeHtml(p.name)}">${escapeHtml(p.name)} · ${p.count} 张</option>`
    ).join('') + '<option value="__new__">＋ 新建摄影集</option>';

    const match = canonicalExistingProject(previous);
    if (match) projectSelect.value = match.name;
    else if (knownProjects.length) projectSelect.value = knownProjects[0].name;
    else projectSelect.value = '__new__';
    updateProjectMode();
  }

  function updateProjectMode() {
    if (!projectSelect || !newProjectField || !newProjectInput) return;
    const creating = projectSelect.value === '__new__';
    newProjectField.hidden = !creating;
    newProjectInput.required = creating;
    if (creating) {
      projectHint.textContent = knownProjects.length
        ? '正在新建摄影集。若输入名称与已有摄影集相同，系统会自动归入已有摄影集，避免重复。'
        : '这是你的第一个摄影集。创建后，以后上传时可以直接从“上传到摄影集”里选择它。';
    } else {
      const p = canonicalExistingProject(projectSelect.value);
      projectHint.textContent = `这批照片会追加到「${p?.name || projectSelect.value}」${p ? `，当前已有 ${p.count} 张` : ''}。`;
    }
  }

  projectSelect?.addEventListener('change', updateProjectMode);
  newProjectInput?.addEventListener('input', () => {
    if (projectSelect?.value !== '__new__') return;
    const match = canonicalExistingProject(newProjectInput.value);
    projectHint.textContent = match
      ? `已存在「${match.name}」。上传时会自动追加到这个摄影集，不会新建重复摄影集。`
      : '这是一个新摄影集名称。';
  });

  function resolvedProjectName() {
    if (!projectSelect) return '未分类';
    if (projectSelect.value !== '__new__') return normalizeProjectName(projectSelect.value) || '未分类';
    const typed = normalizeProjectName(newProjectInput?.value);
    if (!typed) throw new Error('请输入新摄影集名称，或从列表中选择已有摄影集。');
    return canonicalExistingProject(typed)?.name || typed;
  }

  async function refreshAuth() {
    if (configMissing()) return;
    const { data, error } = await A.client.auth.getSession();
    if (error) setStatus(error.message, true);
    const session = data?.session;
    currentUser = session?.user || null;
    authGate.hidden = Boolean(currentUser);
    adminApp.hidden = !currentUser;
    logoutBtn.hidden = !currentUser;
    if (currentUser) {
      $('#signed-in-email').textContent = currentUser.email || '已登录';
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
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
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
        make, model, camera: A.cameraLabel(make, model),
        lens: String(raw.LensModel || raw.Lens || '').trim() || null,
        focal_length: readNumber(raw.FocalLength),
        focal_length_35mm: readNumber(raw.FocalLengthIn35mmFormat),
        aperture,
        exposure_time: exposureTime,
        iso: readNumber(raw.ISO || raw.ISOSpeedRatings || raw.PhotographicSensitivity),
        exposure_compensation: readNumber(raw.ExposureCompensation),
        date_taken: readExifDate(raw),
        orientation: readNumber(raw.Orientation)
      };
    } catch (error) {
      console.warn('EXIF 读取失败：', file.name, error);
      return {};
    }
  }

  async function decodeImage(file) {
    if ('createImageBitmap' in window) {
      try {
        const bitmap = await createImageBitmap(file, { imageOrientation:'from-image' });
        return { source:bitmap, width:bitmap.width, height:bitmap.height, close:() => bitmap.close?.() };
      } catch {}
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
    const width = Math.max(1, Math.round(decoded.width * scale));
    const height = Math.max(1, Math.round(decoded.height * scale));
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha:false });
    ctx.fillStyle = '#0a0a0a'; ctx.fillRect(0,0,width,height); ctx.drawImage(decoded.source,0,0,width,height); decoded.close();
    const blob = await new Promise((resolve,reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('无法生成网页图片')), 'image/jpeg', Number(A.config.jpegQuality) || .88));
    return { blob, width, height };
  }

  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function setFiles(next) {
    files = [...next].filter(f => ['image/jpeg','image/png','image/webp'].includes(f.type));
    dropZone.classList.toggle('has-files', files.length > 0);
    selected.textContent = files.length ? `已选择 ${files.length} 张 · ${files.map(f=>f.name).slice(0,4).join(' / ')}${files.length>4?' …':''}` : '尚未选择照片';
  }

  fileInput?.addEventListener('change', () => setFiles(fileInput.files));
  ['dragenter','dragover'].forEach(type => dropZone?.addEventListener(type,e=>{e.preventDefault();dropZone.classList.add('dragging')}));
  ['dragleave','drop'].forEach(type => dropZone?.addEventListener(type,e=>{e.preventDefault();dropZone.classList.remove('dragging')}));
  dropZone?.addEventListener('drop', e => setFiles(e.dataTransfer.files));

  async function uploadOne(file, project, note, index, total) {
    uploadStatus.textContent = `正在处理 ${index + 1} / ${total} · ${file.name}`;
    const exif = await extractExif(file);
    const web = await makeWebImage(file);
    const now = new Date();
    const path = `${currentUser.id}/${now.getFullYear()}/${String(now.getMonth()+1).padStart(2,'0')}/${uuid()}.jpg`;
    const { error: uploadError } = await A.client.storage.from(A.bucket).upload(path, web.blob, { contentType:'image/jpeg', cacheControl:'31536000', upsert:false });
    if (uploadError) throw uploadError;
    const row = {
      owner_id: currentUser.id,
      title: file.name.replace(/\.[^.]+$/,''), project, note,
      storage_path:path, original_name:file.name, mime_type:'image/jpeg', bytes:web.blob.size,
      width:web.width, height:web.height, ...exif
    };
    const { error: insertError } = await A.client.from(A.table).insert(row);
    if (insertError) {
      await A.client.storage.from(A.bucket).remove([path]);
      throw insertError;
    }
  }

  uploadForm?.addEventListener('submit', async e => {
    e.preventDefault();
    if (!currentUser) return;
    if (!files.length) return uploadStatus.textContent = '请先选择照片。';
    let project;
    try { project = resolvedProjectName(); }
    catch (error) { uploadStatus.textContent = error.message; return; }
    const note = $('#upload-note').value.trim();
    const button = uploadForm.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      for (let i=0;i<files.length;i++) await uploadOne(files[i], project, note, i, files.length);
      uploadStatus.textContent = `完成 · 已向「${project}」追加 ${files.length} 张照片。`;
      files = []; fileInput.value = ''; setFiles([]);
      newProjectInput.value = '';
      await loadLibrary(project);
    } catch (error) {
      console.error(error); uploadStatus.textContent = `上传失败：${error.message || error}`;
    } finally { button.disabled = false; }
  });

  function rowHtml(photo) {
    const e = [photo.exif?.camera, photo.formatted?.focalLength, photo.formatted?.aperture].filter(Boolean).join(' · ');
    return `<article class="admin-photo-row" data-id="${photo.id}"><img src="${escapeHtml(photo.url)}" alt=""><div><b>${escapeHtml(photo.title)}</b><span>${escapeHtml(photo.project)}${e ? ` · ${escapeHtml(e)}` : ''}</span><small>${escapeHtml(photo.originalName || '')}</small></div><div class="admin-row-actions"><button data-edit>编辑</button><button data-delete>删除</button></div></article>`;
  }

  async function loadLibrary(preferredProject = '') {
    if (!currentUser) return;
    try {
      const photos = await A.fetchPhotos();
      knownProjects = A.groupProjects(photos);
      syncProjectChooser(preferredProject);
      $('#admin-photo-count').textContent = `${photos.length} 张 · ${knownProjects.length} 个摄影集`;
      photoList.innerHTML = photos.length ? photos.map(rowHtml).join('') : '<p class="admin-message">还没有照片。先新建第一个摄影集，然后上传照片。</p>';
    } catch (error) { photoList.innerHTML = `<p class="admin-message">读取失败：${escapeHtml(error.message)}</p>`; }
  }

  photoList?.addEventListener('click', async e => {
    const row = e.target.closest('.admin-photo-row'); if (!row) return;
    const id = row.dataset.id;
    if (e.target.matches('[data-edit]')) {
      const photos = await A.fetchPhotos(); const photo = photos.find(p => p.id === id); if (!photo) return;
      const title = prompt('照片标题', photo.title); if (title == null) return;
      const project = prompt('系列名称', photo.project); if (project == null) return;
      const note = prompt('个人备注（可留空）', photo.note || ''); if (note == null) return;
      const normalizedProject = canonicalExistingProject(project)?.name || normalizeProjectName(project) || '未分类';
      const { error } = await A.client.from(A.table).update({ title:title.trim() || photo.title, project:normalizedProject, note:note.trim() }).eq('id', id);
      if (error) alert(`修改失败：${error.message}`); else await loadLibrary(normalizedProject);
    }
    if (e.target.matches('[data-delete]')) {
      if (!confirm('确定删除这张照片吗？网页图片与数据库记录都会删除。此操作无法撤销。')) return;
      const photos = await A.fetchPhotos(); const photo = photos.find(p => p.id === id); if (!photo) return;
      const { error: storageError } = await A.client.storage.from(A.bucket).remove([photo.storagePath]);
      if (storageError) return alert(`文件删除失败：${storageError.message}`);
      const { error } = await A.client.from(A.table).delete().eq('id', id);
      if (error) alert(`记录删除失败：${error.message}`); else await loadLibrary(photo.project);
    }
  });

  if (A?.client) A.client.auth.onAuthStateChange(() => refreshAuth());
  refreshAuth();
})();
