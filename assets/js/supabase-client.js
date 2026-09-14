(() => {
  const config = window.PHOTO_ARCHIVE_CONFIG || {};
  const configured = /^https:\/\/.+\.supabase\.co\/?$/i.test(config.supabaseUrl || '') &&
    /^(sb_publishable_|eyJ)/.test(config.supabaseKey || '');

  const client = configured && window.supabase
    ? window.supabase.createClient(config.supabaseUrl.replace(/\/$/, ''), config.supabaseKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      })
    : null;

  const BUCKET = config.storageBucket || 'photos';
  const TABLE = config.tableName || 'photos';

  function escapeHtml(value = '') {
    return String(value).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  }
  function numberOrNull(value) {
    if (value === '' || value == null) return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  function cameraLabel(make, model) {
    const m = String(make || '').trim();
    const md = String(model || '').trim();
    if (!m) return md || null;
    if (!md) return m;
    if (md.toLowerCase().startsWith(m.toLowerCase())) return md;
    return `${m} ${md}`;
  }
  function formatExposure(seconds) {
    const value = numberOrNull(seconds);
    if (!value) return null;
    if (value >= 1) return `${Number(value.toFixed(2))}s`;
    return `1/${Math.max(1, Math.round(1 / value))}s`;
  }
  function publicUrl(storagePath) {
    if (!client || !storagePath) return '';
    return client.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl;
  }
  function normalizePhoto(row) {
    const exif = {
      make: row.make || null,
      model: row.model || null,
      camera: row.camera || cameraLabel(row.make, row.model),
      lens: row.lens || null,
      focalLength: numberOrNull(row.focal_length),
      focalLength35mm: numberOrNull(row.focal_length_35mm),
      aperture: numberOrNull(row.aperture),
      exposureTime: numberOrNull(row.exposure_time),
      iso: numberOrNull(row.iso),
      exposureCompensation: numberOrNull(row.exposure_compensation),
      dateTaken: row.date_taken || null,
      width: numberOrNull(row.width),
      height: numberOrNull(row.height),
      orientation: numberOrNull(row.orientation)
    };
    return {
      id: row.id,
      ownerId: row.owner_id,
      title: row.title || '未命名',
      project: row.project || '未分类',
      note: row.note || '',
      originalName: row.original_name || '',
      storagePath: row.storage_path,
      mimeType: row.mime_type || 'image/jpeg',
      bytes: numberOrNull(row.bytes),
      uploadedAt: row.uploaded_at,
      isFeatured: Boolean(row.is_featured),
      sortOrder: numberOrNull(row.sort_order) || 0,
      exif,
      url: publicUrl(row.storage_path),
      formatted: {
        aperture: exif.aperture ? `ƒ/${Number(exif.aperture.toFixed(1))}` : null,
        shutter: formatExposure(exif.exposureTime),
        iso: exif.iso ? `ISO ${Math.round(exif.iso)}` : null,
        focalLength: exif.focalLength ? `${Number(exif.focalLength.toFixed(1))}mm` : null,
        compensation: exif.exposureCompensation != null
          ? `${exif.exposureCompensation > 0 ? '+' : ''}${Number(exif.exposureCompensation.toFixed(2))} EV`
          : null
      }
    };
  }
  function photoTime(photo) {
    const d = new Date(photo.exif?.dateTaken || photo.uploadedAt || 0);
    return Number.isNaN(d.getTime()) ? 0 : d.getTime();
  }
  async function fetchAllRows() {
    if (!client) return [];
    const pageSize = 1000;
    let from = 0;
    const rows = [];
    while (true) {
      const { data, error } = await client.from(TABLE).select('*').order('uploaded_at', { ascending: false }).range(from, from + pageSize - 1);
      if (error) throw error;
      rows.push(...(data || []));
      if (!data || data.length < pageSize) break;
      from += pageSize;
    }
    return rows;
  }
  async function fetchPhotos(options = {}) {
    let photos = (await fetchAllRows()).map(normalizePhoto);
    if (options.project) photos = photos.filter(p => p.project === options.project);
    const dir = options.sort === 'oldest' ? 1 : -1;
    photos.sort((a, b) => dir * (photoTime(a) - photoTime(b)) || a.sortOrder - b.sortOrder);
    return photos;
  }
  function groupProjects(photos) {
    const map = new Map();
    photos.forEach(photo => {
      const name = photo.project || '未分类';
      if (!map.has(name)) map.set(name, []);
      map.get(name).push(photo);
    });
    return [...map.entries()].map(([name, items]) => {
      const ordered = [...items].sort((a, b) => photoTime(b) - photoTime(a));
      const years = ordered.map(p => {
        const d = new Date(p.exif?.dateTaken || p.uploadedAt || 0);
        return Number.isNaN(d.getTime()) ? null : d.getFullYear();
      }).filter(Boolean);
      return {
        name,
        count: items.length,
        cover: ordered.find(p => p.isFeatured) || ordered[0],
        year: years.length ? String(Math.max(...years)) : '',
        updatedAt: ordered[0]?.uploadedAt || null
      };
    }).sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
  }
  function countBy(items, getter) {
    const map = new Map();
    items.forEach(item => {
      const key = getter(item);
      if (key == null || key === '') return;
      map.set(String(key), (map.get(String(key)) || 0) + 1);
    });
    return [...map.entries()].map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'zh-CN'));
  }
  function bucketFocal(value) {
    const n = numberOrNull(value);
    if (!n) return null;
    if (n <= 24) return '≤24mm';
    if (n <= 35) return '25–35mm';
    if (n <= 50) return '36–50mm';
    if (n <= 85) return '51–85mm';
    if (n <= 135) return '86–135mm';
    return '>135mm';
  }
  function bucketIso(value) {
    const n = numberOrNull(value);
    if (!n) return null;
    if (n <= 100) return '≤100';
    if (n <= 400) return '125–400';
    if (n <= 800) return '500–800';
    if (n <= 1600) return '1000–1600';
    if (n <= 3200) return '2000–3200';
    return '>3200';
  }
  function buildStats(photos) {
    const withExif = photos.filter(p => p.exif && Object.values(p.exif).some(v => v != null && v !== ''));
    const cameras = countBy(photos, p => p.exif?.camera);
    const lenses = countBy(photos, p => p.exif?.lens);
    const focalLengths = countBy(photos, p => bucketFocal(p.exif?.focalLength));
    const apertures = countBy(photos, p => {
      const n = numberOrNull(p.exif?.aperture);
      return n ? `ƒ/${Number(n.toFixed(1))}` : null;
    });
    const iso = countBy(photos, p => bucketIso(p.exif?.iso));
    const years = countBy(photos, p => {
      const d = p.exif?.dateTaken ? new Date(p.exif.dateTaken) : null;
      return d && !Number.isNaN(d.getTime()) ? d.getFullYear() : null;
    }).sort((a, b) => Number(a.label) - Number(b.label));
    const focalValues = photos.map(p => numberOrNull(p.exif?.focalLength)).filter(Boolean).sort((a, b) => a - b);
    let medianFocal = null;
    if (focalValues.length) {
      const mid = Math.floor(focalValues.length / 2);
      medianFocal = focalValues.length % 2 ? focalValues[mid] : (focalValues[mid - 1] + focalValues[mid]) / 2;
    }
    return {
      total: photos.length,
      withExif: withExif.length,
      exifCoverage: photos.length ? Math.round(withExif.length / photos.length * 100) : 0,
      primaryCamera: cameras[0]?.label || null,
      primaryLens: lenses[0]?.label || null,
      medianFocalLength: medianFocal,
      cameras: cameras.slice(0, 8), lenses: lenses.slice(0, 10), focalLengths,
      apertures: apertures.slice(0, 10), iso, years
    };
  }
  window.PhotoArchive = {
    config, configured, client, bucket: BUCKET, table: TABLE, escapeHtml, numberOrNull,
    cameraLabel, formatExposure, publicUrl, normalizePhoto, photoTime,
    fetchPhotos, groupProjects, buildStats
  };
})();
