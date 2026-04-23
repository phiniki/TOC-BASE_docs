/**
 * 案件登録・編集フォーム — localStorage（TocDataStore）連携
 * フォームはコア項目のみ。それ以外は一覧表で編集。
 */
function parseDigits(str) {
  const n = parseInt(String(str ?? '').replace(/[^\d]/g, ''), 10);
  return Number.isNaN(n) ? 0 : n;
}

function fillClientSelect() {
  const sel = document.getElementById('client');
  if (!sel || !window.TocDataStore) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">選択してください</option>';
  TocDataStore.getState().clients.forEach(c => {
    const o = document.createElement('option');
    o.value = c.name;
    o.textContent = c.name;
    sel.appendChild(o);
  });
  if (cur) {
    const o = Array.from(sel.options).find(op => op.value === cur);
    if (o) sel.value = cur;
  }
}

function ensureSelectOption(sel, value, label) {
  if (!sel || !value) return;
  if (Array.from(sel.options).some(o => o.value === value)) return;
  const o = document.createElement('option');
  o.value = value;
  o.textContent = label || value;
  sel.appendChild(o);
}

function fillCategorySelect() {
  const sel = document.getElementById('cat');
  if (!sel || !window.TocDataStore) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">選択してください</option>';
  TocDataStore.getState()
    .categories.filter(x => x.status !== '無効')
    .forEach(c => {
      const o = document.createElement('option');
      o.value = c.name;
      o.textContent = c.name;
      sel.appendChild(o);
    });
  if (cur) {
    const o = Array.from(sel.options).find(op => op.value === cur);
    if (o) sel.value = cur;
  }
}

function fillStaffMultiSelects() {
  const salesSel = document.getElementById('salesStaff');
  const designSel = document.getElementById('designStaff');
  if (!salesSel || !designSel || !window.TocDataStore) return;
  salesSel.innerHTML = '';
  designSel.innerHTML = '';
  TocDataStore.getState()
    .staff.filter(s => s.status === '在籍')
    .forEach(s => {
      if (s.salesOk) {
        const o = document.createElement('option');
        o.value = s.name;
        o.textContent = s.name;
        salesSel.appendChild(o);
      }
      if (s.designOk) {
        const o = document.createElement('option');
        o.value = s.name;
        o.textContent = s.name;
        designSel.appendChild(o);
      }
    });
}

function selectedNamesJoined(sel) {
  if (!sel || sel.tagName !== 'SELECT') return '';
  return Array.from(sel.selectedOptions)
    .map(o => o.value)
    .filter(Boolean)
    .join('、');
}

function applyMultiSelectionFromString(sel, str) {
  if (!sel) return;
  const names = String(str || '')
    .split(/[、,]/)
    .map(s => s.trim())
    .filter(Boolean);
  Array.from(sel.options).forEach(o => {
    o.selected = names.includes(o.value);
  });
}

function loadCaseIntoForm(c) {
  if (!c) return;
  const set = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.value = v != null ? v : '';
  };
  set('estNo', c.estimateNo || '');
  ensureSelectOption(document.getElementById('client'), c.client, c.client);
  set('client', c.client);
  set('building', c.building);
  set('kubun', c.kubun);
  ensureSelectOption(document.getElementById('cat'), c.category, c.category);
  fillStaffMultiSelects();
  applyMultiSelectionFromString(document.getElementById('salesStaff'), c.salesStaff);
  applyMultiSelectionFromString(document.getElementById('designStaff'), c.designStaff);
  set('fForecastSales', c.forecastSales != null ? String(c.forecastSales) : '');
  set('fForecastCost', c.forecastCost != null ? String(c.forecastCost) : '');
  set('jorei', c.jorei || '◯');
  set('billMonth', c.billMonth || '');
  set('startDay', c.startDate && c.startDate !== '—' ? c.startDate : '');
  set('memo', c.contentMemo || '');
  set('cat', c.category);
}

/** フォームで触る項目のみ。他は prev から引き継ぎ */
function readFormPayload(prev) {
  const g = id => document.getElementById(id);
  return {
    estimateNo: (g('estNo')?.value || '').trim(),
    client: g('client')?.value.trim() || '',
    building: g('building')?.value.trim() || '',
    kubun: g('kubun')?.value || '',
    salesStaff: selectedNamesJoined(g('salesStaff')),
    designStaff: selectedNamesJoined(g('designStaff')),
    forecastSales: parseDigits(g('fForecastSales')?.value),
    forecastCost: parseDigits(g('fForecastCost')?.value),
    jorei: g('jorei')?.value || '◯',
    billMonth: g('billMonth')?.value || '',
    startDate: g('startDay')?.value || '',
    contentMemo: g('memo')?.value.trim() || '',
    category: g('cat')?.value || '',
    contentBadge: prev?.contentBadge || 'blue',
  };
}

document.addEventListener('DOMContentLoaded', () => {
  if (!window.TocDataStore) return;
  TocDataStore.ensureInit();

  const p = new URLSearchParams(location.search);
  const urlId = p.get('id');
  const urlNo = p.get('no');
  let editingCaseId = null;
  if (urlId) {
    editingCaseId = urlId;
  } else if (urlNo) {
    const hit = TocDataStore.getCase(urlNo);
    editingCaseId = hit?.caseId || null;
  }

  const h = document.getElementById('formPageTitle');

  fillClientSelect();
  fillCategorySelect();
  fillStaffMultiSelects();

  if (editingCaseId) {
    const c = TocDataStore.getCase(editingCaseId);
    if (h) h.textContent = '案件編集';
    if (c) loadCaseIntoForm(c);
  } else {
    if (h) h.textContent = '新規案件登録';
    document.getElementById('estNo').value = '';
  }

  const fs = document.getElementById('fForecastSales');
  const fc = document.getElementById('fForecastCost');
  const preview = document.getElementById('forecastPreview');

  function updForecast() {
    if (!preview) return;
    const a = parseDigits(fs && fs.value);
    const b = parseDigits(fc && fc.value);
    const pr = a - b;
    const r = a ? ((pr / a) * 100).toFixed(1) : '—';
    preview.textContent =
      '予想粗利 ¥' + pr.toLocaleString() + ' ／ 予想粗利率 ' + r + '%（入力値から即時反映）';
  }

  if (fs) fs.addEventListener('input', updForecast);
  if (fc) fc.addEventListener('input', updForecast);
  updForecast();

  const btnSave = document.getElementById('btnSaveCase');
  const btnDel = document.getElementById('btnDeleteCase');

  function validate() {
    const g = id => document.getElementById(id);
    if (!g('client')?.value.trim()) {
      alert('取引先を選択してください。');
      return false;
    }
    if (!g('building')?.value.trim()) {
      alert('物件名を入力してください。');
      return false;
    }
    if (!g('cat')?.value.trim()) {
      alert('カテゴリを選択してください。');
      return false;
    }
    if (!g('kubun')?.value.trim()) {
      alert('区分を選択してください。');
      return false;
    }
    return true;
  }

  function doSave() {
    if (!validate()) return;
    const prev = editingCaseId ? TocDataStore.getCase(editingCaseId) || {} : {};
    const payload = readFormPayload(prev);
    const merged = { ...prev, ...payload };

    if (editingCaseId) {
      merged.caseId = editingCaseId;
      const oldEst = (prev.estimateNo || '').trim();
      const newEst = (payload.estimateNo || '').trim();
      if (newEst !== oldEst) {
        if (!TocDataStore.renameEstimateNo(editingCaseId, newEst)) {
          alert('その見積No.は別案件で使われています。');
          return;
        }
      }
      merged.estimateNo = newEst;
      TocDataStore.upsertCase(merged);
    } else {
      TocDataStore.upsertCase(merged);
    }
    location.href = 'index.html';
  }

  if (btnSave) btnSave.addEventListener('click', doSave);

  if (btnDel) {
    btnDel.addEventListener('click', () => {
      if (!editingCaseId) return;
      if (!confirm('この案件を削除しますか？')) return;
      TocDataStore.deleteCase(editingCaseId);
      location.href = 'index.html';
    });
    if (!editingCaseId) btnDel.disabled = true;
  }

  const lp = document.getElementById('linkCasePurchases');
  function syncPurchaseLink() {
    if (!lp) return;
    if (editingCaseId) {
      lp.href = 'case-purchases.html?id=' + encodeURIComponent(editingCaseId);
      return;
    }
    const n = (document.getElementById('estNo')?.value || '').trim();
    if (n) {
      const hit = TocDataStore.getCase(n);
      lp.href = hit
        ? 'case-purchases.html?id=' + encodeURIComponent(hit.caseId)
        : 'case-purchases.html?no=' + encodeURIComponent(n);
    } else {
      lp.href = 'case-purchases.html';
    }
  }
  syncPurchaseLink();
  document.getElementById('estNo')?.addEventListener('input', syncPurchaseLink);
});
