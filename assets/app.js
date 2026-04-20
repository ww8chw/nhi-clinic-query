/* 健保給付查詢 - 前端邏輯 */

const state = {
  items: [],
  diagnoses: [],
  meta: {},
  fuse: null,
  favorites: new Set(JSON.parse(localStorage.getItem('nhi_favs') || '[]')),
  filter: { type: 'all', value: null }, // type: all|fav|lab|imaging|procedure|cat|dx
  query: '',
};

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

/* ---------- Theme ---------- */
function initTheme() {
  const saved = localStorage.getItem('nhi_theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (saved === 'dark' || (!saved && prefersDark)) {
    document.documentElement.classList.add('dark');
  }
  $('#themeToggle').addEventListener('click', () => {
    document.documentElement.classList.toggle('dark');
    localStorage.setItem('nhi_theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light');
  });
}

/* ---------- Load data ---------- */
async function loadData() {
  const res = await fetch('data/data.json');
  const data = await res.json();
  state.items = data.items || [];
  state.diagnoses = data.diagnoses || [];
  state.meta = data.meta || {};
  $('#updatedAt').textContent = state.meta.updated_at || '—';

  state.fuse = new Fuse(state.items, {
    keys: [
      { name: 'name_zh',      weight: 0.30 },
      { name: 'name_zh_full', weight: 0.20 },
      { name: 'name_en',      weight: 0.20 },
      { name: 'aliases',      weight: 0.20 },
      { name: 'code',         weight: 0.08 },
      { name: 'subcategory',  weight: 0.01 },
      { name: 'indication_desc', weight: 0.01 },
    ],
    threshold: 0.35,
    ignoreLocation: true,
    includeScore: false,
    minMatchCharLength: 1,
  });
}

/* ---------- Favorites ---------- */
function toggleFavorite(id, e) {
  if (e) e.stopPropagation();
  if (state.favorites.has(id)) state.favorites.delete(id);
  else state.favorites.add(id);
  localStorage.setItem('nhi_favs', JSON.stringify([...state.favorites]));
  updateFavCount();
  render();
}
function updateFavCount() {
  $('#favCount').textContent = state.favorites.size ? `(${state.favorites.size})` : '';
}

/* ---------- Filter / Search ---------- */
function applyFilter() {
  let list = state.items;

  // Category filter
  const { type, value } = state.filter;
  if (type === 'fav') {
    list = list.filter(i => state.favorites.has(i.id));
  } else if (type === 'lab' || type === 'imaging' || type === 'procedure') {
    list = list.filter(i => i.category === type && i.subcategory === value);
  } else if (type === 'cat') {
    list = list.filter(i => i.subcategory === value);
  } else if (type === 'dx') {
    list = list.filter(i => (i.indications || []).some(c => c === value || c.startsWith(value)));
  }

  // Keyword search (on top of filter)
  const q = state.query.trim();
  if (q) {
    const qLower = q.toLowerCase();
    // 1) Exact / substring match on code, id, name, aliases (fast path)
    const hit = (it) => {
      if (it.code && it.code.toLowerCase().includes(qLower)) return true;
      if (it.id && it.id.toLowerCase().includes(qLower)) return true;
      if (it.name_zh && it.name_zh.toLowerCase().includes(qLower)) return true;
      if (it.name_zh_full && it.name_zh_full.toLowerCase().includes(qLower)) return true;
      if (it.name_en && it.name_en.toLowerCase().includes(qLower)) return true;
      if ((it.aliases || []).some(a => a.toLowerCase().includes(qLower))) return true;
      return false;
    };
    const exactHits = list.filter(hit);
    if (exactHits.length) {
      list = exactHits;
    } else {
      // 2) Fallback fuzzy on the filtered subset
      const fuseOnSubset = new Fuse(list, state.fuse.options);
      list = fuseOnSubset.search(q).map(r => r.item);
    }
  }
  return list;
}

/* ---------- Render ---------- */
const CATEGORY_BADGE = {
  lab:       { label: '檢驗', cls: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' },
  imaging:   { label: '影像', cls: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300' },
  procedure: { label: '處置', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
};

const ELIGIBILITY_BADGE = {
  p4p:     { label: '需加入計畫', cls: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-200', icon: '📋' },
  cert:    { label: '需特殊資格', cls: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-200', icon: '🎓' },
  program: { label: '公費計畫', cls: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-200', icon: '🛡️' },
  prior:   { label: '需事前審查', cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200', icon: '⏱' },
};

function itemCard(it) {
  const badge = CATEGORY_BADGE[it.category] || { label: it.category, cls: 'bg-slate-100 text-slate-700' };
  const fav = state.favorites.has(it.id);
  const freq = it.frequency ? `<span class="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">⏱ ${escapeHtml(it.frequency)}</span>` : '';
  const pts = Number(it.points) > 0 ? `<span class="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700">💰 ${it.points} 點</span>` : `<span class="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700">公費 / 特殊</span>`;
  const code = it.code && it.code !== '-' ? `<code class="text-xs font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700">${escapeHtml(it.code)}</code>` : '';
  const elig = it.eligibility && ELIGIBILITY_BADGE[it.eligibility]
    ? `<span class="text-xs px-2 py-0.5 rounded-full ${ELIGIBILITY_BADGE[it.eligibility].cls}" title="${escapeHtml(it.eligibility_desc || '')}">${ELIGIBILITY_BADGE[it.eligibility].icon} ${ELIGIBILITY_BADGE[it.eligibility].label}</span>`
    : '';
  return `
    <article class="card p-4 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-brand-500 dark:hover:border-brand-500 cursor-pointer shadow-sm" data-id="${it.id}">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2 flex-wrap mb-1">
            <span class="text-xs px-2 py-0.5 rounded-full ${badge.cls}">${badge.label}</span>
            ${code}
            <span class="text-xs text-slate-500">${escapeHtml(it.subcategory || '')}</span>
          </div>
          <h3 class="font-semibold text-base truncate">${escapeHtml(it.name_zh)}</h3>
          <p class="text-sm text-slate-500 truncate">${escapeHtml(it.name_en || '')}</p>
          <div class="mt-2 flex flex-wrap items-center gap-1.5">
            ${pts} ${freq} ${elig}
          </div>
        </div>
        <button class="fav-btn p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 shrink-0" title="${fav ? '取消釘選' : '釘選最愛'}" data-id="${it.id}">
          <span class="text-xl">${fav ? '⭐' : '☆'}</span>
        </button>
      </div>
    </article>
  `;
}

function render() {
  const list = applyFilter();
  const root = $('#resultList');
  $('#resultCount').textContent = `${list.length} 筆`;

  // Title
  const titleMap = {
    all: '全部項目',
    fav: '⭐ 我的最愛',
  };
  let title = titleMap[state.filter.type] || state.filter.value || '全部項目';
  if (state.filter.type === 'dx') {
    const d = state.diagnoses.find(d => d.icd === state.filter.value);
    title = d ? `🔍 ${d.name_zh} (${d.icd})` : `診斷：${state.filter.value}`;
  }
  if (state.query.trim()) title = `🔎 "${state.query}" — ${title}`;
  $('#resultTitle').textContent = title;

  // Diagnosis banner
  const banner = $('#dxBanner');
  if (state.filter.type === 'dx') {
    const d = state.diagnoses.find(d => d.icd === state.filter.value);
    if (d) {
      banner.innerHTML = `
        <div class="font-semibold mb-1">${escapeHtml(d.name_zh)} <span class="text-sm text-slate-500">${escapeHtml(d.name_en)} · ${escapeHtml(d.icd)}</span></div>
        <p class="text-sm leading-relaxed">${escapeHtml(d.key_rules)}</p>
      `;
      banner.classList.remove('hidden');
    }
  } else {
    banner.classList.add('hidden');
  }

  if (!list.length) {
    root.innerHTML = '';
    $('#emptyState').classList.remove('hidden');
    return;
  }
  $('#emptyState').classList.add('hidden');
  root.innerHTML = list.map(itemCard).join('');
}

/* ---------- Modal ---------- */
function openModal(id) {
  const it = state.items.find(i => i.id === id);
  if (!it) return;
  $('#modalTitle').textContent = it.name_zh;
  const subtitleParts = [];
  if (it.name_en) subtitleParts.push(it.name_en);
  if (it.code && it.code !== '-') subtitleParts.push(it.code);
  if (it.effective_date) subtitleParts.push(`生效 ${it.effective_date}`);
  $('#modalSubtitle').textContent = subtitleParts.join(' · ');

  const indicHtml = (it.indications || []).length
    ? `<div class="flex flex-wrap gap-1.5">${it.indications.map(c => `
        <button class="dx-chip text-xs px-2 py-0.5 rounded-full bg-brand-50 dark:bg-brand-700/30 text-brand-700 dark:text-brand-100 hover:bg-brand-100" data-icd="${escapeHtml(c)}">${escapeHtml(c)}</button>`).join('')}</div>`
    : '<span class="text-slate-400 text-sm">—</span>';

  const aliases = (it.aliases || []).length
    ? `<div class="flex flex-wrap gap-1">${it.aliases.map(a => `<span class="text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700">${escapeHtml(a)}</span>`).join('')}</div>`
    : '';

  const eligInfo = it.eligibility && ELIGIBILITY_BADGE[it.eligibility] ? ELIGIBILITY_BADGE[it.eligibility] : null;
  const eligBlock = eligInfo
    ? `<div class="p-3 rounded-lg border ${eligInfo.cls.replace(/bg-\S+/g,'').replace(/text-\S+/g,'')} border-current">
        <div class="text-xs text-slate-500 mb-1">申報條件</div>
        <div class="flex items-center gap-2 mb-1">
          <span class="text-xs px-2 py-0.5 rounded-full ${eligInfo.cls}">${eligInfo.icon} ${eligInfo.label}</span>
        </div>
        <div class="text-sm leading-relaxed">${escapeHtml(it.eligibility_desc || '')}</div>
      </div>`
    : `<div class="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-sm">
        ✅ <span class="font-medium">診斷符合 + 頻率在規定內即可申報</span>
        <div class="text-xs text-slate-500 mt-0.5">無需額外加入計畫或特殊資格</div>
      </div>`;

  $('#modalBody').innerHTML = `
    <div class="grid grid-cols-2 gap-3 text-sm">
      <div class="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/60">
        <div class="text-xs text-slate-500 mb-1">支付點數</div>
        <div class="font-bold text-lg">${Number(it.points) > 0 ? it.points + ' 點' : '公費 / 特殊'}</div>
      </div>
      <div class="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/60">
        <div class="text-xs text-slate-500 mb-1">頻率限制</div>
        <div class="font-semibold">${escapeHtml(it.frequency || '—')}</div>
      </div>
    </div>
    ${eligBlock}
    <div>
      <div class="text-xs text-slate-500 mb-1">類別</div>
      <div class="text-sm">${escapeHtml(it.subcategory || '')}</div>
    </div>
    ${it.name_zh_full && it.name_zh_full !== it.name_zh ? `
    <div>
      <div class="text-xs text-slate-500 mb-1">官方完整名稱</div>
      <div class="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">${escapeHtml(it.name_zh_full)}</div>
    </div>` : ''}
    ${aliases ? `<div><div class="text-xs text-slate-500 mb-1">別名 / 縮寫</div>${aliases}</div>` : ''}
    <div>
      <div class="text-xs text-slate-500 mb-1">適用診斷 (ICD-10)</div>
      ${indicHtml}
      ${it.indication_desc ? `<p class="text-sm text-slate-600 dark:text-slate-400 mt-2">${escapeHtml(it.indication_desc)}</p>` : ''}
    </div>
    ${it.notes ? `
      <div>
        <div class="text-xs text-slate-500 mb-1">備註 / 給付規定</div>
        <div class="text-sm leading-relaxed p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">${escapeHtml(it.notes)}</div>
      </div>` : ''}
    <div class="flex items-center justify-between pt-2">
      <a href="${it.source_url || 'https://info.nhi.gov.tw/INAE5000/INAE5001S01'}" target="_blank" rel="noopener"
         class="text-sm text-brand-600 hover:underline">查看健保署官方資料 →</a>
      <button id="modalFav" class="text-sm px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700">
        ${state.favorites.has(it.id) ? '⭐ 取消釘選' : '☆ 釘選最愛'}
      </button>
    </div>
  `;
  $('#modal').classList.remove('hidden');
  $('#modalFav').addEventListener('click', () => {
    toggleFavorite(it.id);
    openModal(it.id); // re-render button
  });
  $$('.dx-chip').forEach(el => el.addEventListener('click', () => {
    closeModal();
    setFilter('dx', el.dataset.icd);
  }));
}
function closeModal() { $('#modal').classList.add('hidden'); }

/* ---------- Filters ---------- */
function setFilter(type, value) {
  state.filter = { type, value };
  // Highlight active button
  $$('.filter-btn').forEach(b => b.classList.remove('bg-brand-100', 'dark:bg-brand-700/40', 'text-brand-700', 'dark:text-brand-100'));
  const key = type === 'all' || type === 'fav' ? type : `${type}:${value}`;
  const btn = document.querySelector(`[data-filter="${key}"]`);
  if (btn) btn.classList.add('bg-brand-100', 'dark:bg-brand-700/40', 'text-brand-700', 'dark:text-brand-100');
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------- Utils ---------- */
function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}

/* ---------- Wire up ---------- */
function bindEvents() {
  // Search with debounce
  let t;
  $('#searchInput').addEventListener('input', (e) => {
    clearTimeout(t);
    const v = e.target.value;
    t = setTimeout(() => { state.query = v; render(); }, 100);
  });

  // Keyboard: "/" focuses search; Esc closes modal
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement.tagName !== 'INPUT') {
      e.preventDefault(); $('#searchInput').focus();
    }
    if (e.key === 'Escape') closeModal();
  });

  // Filter buttons (delegated)
  document.addEventListener('click', (e) => {
    const fb = e.target.closest('.filter-btn');
    if (fb) {
      const raw = fb.dataset.filter;
      if (raw === 'all' || raw === 'fav') setFilter(raw, null);
      else {
        const [type, ...rest] = raw.split(':');
        setFilter(type, rest.join(':'));
      }
      // Close mobile sidebar if open
      if (window.innerWidth < 768) $('#sidebar').classList.add('hidden');
      return;
    }
    // Card click
    const card = e.target.closest('.card');
    if (card && !e.target.closest('.fav-btn')) {
      openModal(card.dataset.id); return;
    }
    // Fav button in card
    const favBtn = e.target.closest('.fav-btn');
    if (favBtn) toggleFavorite(favBtn.dataset.id, e);
  });

  // Modal close
  $('#modalClose').addEventListener('click', closeModal);
  $('#modal').addEventListener('click', (e) => {
    if (e.target.id === 'modal') closeModal();
  });

  // Mobile sidebar
  $('#mobileMenuBtn').addEventListener('click', () => {
    $('#sidebar').classList.toggle('hidden');
    $('#sidebar').classList.toggle('fixed');
    $('#sidebar').classList.toggle('inset-x-4');
    $('#sidebar').classList.toggle('top-16');
    $('#sidebar').classList.toggle('z-20');
    $('#sidebar').classList.toggle('p-4');
    $('#sidebar').classList.toggle('bg-white');
    $('#sidebar').classList.toggle('dark:bg-slate-800');
    $('#sidebar').classList.toggle('rounded-lg');
    $('#sidebar').classList.toggle('shadow-lg');
    $('#sidebar').classList.toggle('max-h-[70vh]');
  });
}

/* ---------- Boot ---------- */
(async function init() {
  initTheme();
  try {
    await loadData();
  } catch (err) {
    $('#resultList').innerHTML = `<div class="p-4 text-red-600">載入資料失敗：${escapeHtml(err.message)}<br/>請確認透過 HTTP 伺服器開啟（非 file://）。</div>`;
    return;
  }
  bindEvents();
  setFilter('all', null);
  updateFavCount();
  $('#searchInput').focus();
})();
