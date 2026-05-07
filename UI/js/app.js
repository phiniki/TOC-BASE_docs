/**
 * TOC-BASE 案件管理システム — 案件シート（見積〜請求までの進捗列。売上・入金の確定は完了シート）
 */

const SELECT_OPTIONS = {
  'select-kubun': ['システム', 'ネット', '工事', '申請', '納品', '媒体'],
  'select-jorei': ['◯', '△', '×'],
  'select-status': ['見積提出済', '受注', '施行中', '施工完了', '失注'],
  'select-category': ['全体', 'Joshin', 'コラボ', '媒体', 'ネット', 'その他材料', '立替'],
};

/** 一覧では区分を編集不可のため、ピル表示用クラス（案件フォームで変更） */
const KUBUN_PILL_CLASS = {
  システム: 'kbn-system',
  ネット: 'kbn-net',
  工事: 'kbn-kouji',
  申請: 'kbn-shinsei',
  納品: 'kbn-nohin',
  媒体: 'kbn-baitai',
};

function kubunPillHtml(kubun) {
  const k = String(kubun ?? '').trim();
  const cls = KUBUN_PILL_CLASS[k] || 'kbn-new';
  const label = k || '—';
  return `<span class="kbn-pill ${cls}" title="区分は「編集」から変更できます">${escapeHtml(label)}</span>`;
}

/** 案件シート初期表示列（#〜編集まで全列） */
const CASE_SHEET_VISIBLE_COLS = Array.from({ length: 20 }, (_, i) => i);

const CASE_SHEET_SHOW_INVOICED_KEY = 'toc-case-sheet-show-invoiced';

function getShowInvoicedOnCaseSheet() {
  try {
    return sessionStorage.getItem(CASE_SHEET_SHOW_INVOICED_KEY) === '1';
  } catch (_) {
    return false;
  }
}

function setShowInvoicedOnCaseSheet(v) {
  try {
    if (v) sessionStorage.setItem(CASE_SHEET_SHOW_INVOICED_KEY, '1');
    else sessionStorage.removeItem(CASE_SHEET_SHOW_INVOICED_KEY);
  } catch (_) {}
}

function syncShowInvoicedButtonUI() {
  const btn = document.getElementById('showInvoicedCasesBtn');
  if (!btn) return;
  const on = getShowInvoicedOnCaseSheet();
  btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  btn.classList.toggle('is-pressed', on);
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 日付フィールド用（input[type=date] の value） */
function toDateInputValue(raw) {
  if (raw == null || raw === '—' || String(raw).trim() === '') return '';
  const s = String(raw).trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}

function syncCategoryOptionsFromStore() {
  if (!window.TocDataStore) return;
  const names = TocDataStore.getState()
    .categories.filter(x => x.status !== '無効')
    .map(x => x.name);
  if (names.length) SELECT_OPTIONS['select-category'] = names;
}

function updateCaseActionLinks(tr, caseId) {
  const enc = encodeURIComponent(caseId);
  tr.querySelectorAll('a.link-action').forEach(a => {
    const href = a.getAttribute('href') || '';
    if (href.includes('case-form.html')) a.href = 'case-form.html?id=' + enc;
  });
}

function monthInputValue(raw) {
  const s = String(raw ?? '')
    .trim()
    .slice(0, 7);
  return /^\d{4}-\d{2}$/.test(s) ? s : '';
}

function buildCaseRow(c, rowNum) {
  const tr = document.createElement('tr');
  tr.dataset.caseId = c.caseId || '';
  tr.dataset.category = c.category || '';
  const estRaw = (c.estimateNo && String(c.estimateNo).trim()) || '';
  tr.dataset.estimateNo = estRaw;
  const estDisp = estRaw ? escapeHtml(estRaw) : '—';
  const memoBody = escapeHtml(c.contentMemo || '');
  const billM = monthInputValue(c.billMonth);
  const cid = encodeURIComponent(c.caseId || '');
  const invDone = String(c.invoiceDone ?? '').trim() === '済';
  const invD = toDateInputValue(c.invoiceDate);
  const invoiceColInner = invDone
    ? `<div class="cell-invoice-done"><span class="badge badge--green">請求済</span>${
        invD ? `<span class="cell-invoice-done__date">${escapeHtml(invD)}</span>` : ''
      }</div>`
    : `<button type="button" class="link-action link-action--btn js-invoice-done">請求済みにする</button>`;
  const mediaInner = String(c.kubun || '').trim() === '媒体'
    ? `<a class="link-action link-action--btn" href="media-mgmt.html?caseId=${cid}">媒体管理</a>`
    : '—';

  tr.innerHTML = `
    <td class="col-sticky col-sticky-1 col-rownum">${rowNum}</td>
    <td class="col-sticky col-sticky-2 cell-estimate-no">${estDisp}</td>
    <td class="col-sticky col-sticky-3">${escapeHtml(c.client)}</td>
    <td class="col-sticky col-sticky-4">${escapeHtml(c.building)}</td>
    <td class="cell-kubun-readonly">${kubunPillHtml(c.kubun)}</td>
    <td data-sales>${escapeHtml(c.salesStaff)}</td>
    <td data-design>${escapeHtml(c.designStaff)}</td>
    <td class="cell-num" data-field="forecast_sales">${formatMoney(
      window.TocDataStore ? TocDataStore.computeCaseForecastSalesEx(c) : Number(c.forecastSales) || 0
    )}</td>
    <td class="cell-num" data-field="forecast_cost">${formatMoney(c.forecastCost)}</td>
    <td class="cell-num" data-field="forecast_profit">¥0</td>
    <td class="cell-rate" data-field="forecast_rate">—</td>
    <td class="cell-num" data-editable data-edit="money" data-field="actual_cost">${formatMoney(c.actualCost)}</td>
    <td class="cell-rate" data-field="utilization">—</td>
    <td data-editable data-edit="select-jorei" data-initial-value="${escapeHtml(c.jorei)}"></td>
    <td class="cell-date cell-date-input"><input type="month" class="cell-native-month" value="${billM}" aria-label="請求予定月" /></td>
    <td class="cell-content-memo"><textarea class="cell-native-text" rows="3" aria-label="内容状況（進捗メモ）">${memoBody}</textarea></td>
    <td data-editable data-edit="select-status" data-initial-value="${escapeHtml(c.status)}"></td>
    <td class="cell-actions">${invoiceColInner}</td>
    <td class="cell-actions">${mediaInner}</td>
    <td class="cell-actions"><a class="link-action" href="case-form.html?id=${cid}">編集</a></td>
  `;
  return tr;
}

function cellSelectValue(cells, i) {
  const td = cells[i];
  const sel = td.querySelector('.cell-native-select');
  if (sel) return sel.value;
  const pill = td.querySelector('.kbn-pill');
  if (pill) return pill.textContent.trim();
  return td.textContent.trim();
}

function cellMoneyOrZero(cells, i) {
  const n = parseMoney(cells[i].textContent);
  return Number.isNaN(n) ? 0 : n;
}

function readContentMemoFromCell(td) {
  const inp = td.querySelector('.cell-native-text');
  if (inp) return inp.value.trim();
  return td.textContent.trim();
}

function cellNativeMonthValue(td) {
  const inp = td.querySelector('input.cell-native-month');
  if (inp) return inp.value ? inp.value.trim() : '';
  return td.textContent.trim();
}

function readCaseFromRow(tr) {
  const cells = tr.cells;
  const contentMemo = readContentMemoFromCell(cells[15]);
  let est = cells[1].textContent.trim();
  if (est === '—') est = '';
  return {
    caseId: tr.dataset.caseId,
    estimateNo: est,
    client: cells[2].textContent.trim(),
    building: cells[3].textContent.trim(),
    kubun: cellSelectValue(cells, 4),
    salesStaff: cells[5].textContent.trim(),
    designStaff: cells[6].textContent.trim(),
    forecastSales: cellMoneyOrZero(cells, 7),
    forecastCost: cellMoneyOrZero(cells, 8),
    actualCost: cellMoneyOrZero(cells, 11),
    jorei: cellSelectValue(cells, 13),
    billMonth: cellNativeMonthValue(cells[14]),
    contentMemo,
    status: cellSelectValue(cells, 16),
  };
}

function persistCaseRow(tr) {
  if (!window.TocDataStore || !tr || !tr.cells || tr.cells.length < 20) return;
  const caseId = tr.dataset.caseId;
  if (!caseId) return;
  const prev = TocDataStore.getCase(caseId);
  if (!prev) return;
  const data = readCaseFromRow(tr);
  const patch = {
    contentMemo: data.contentMemo,
    status: data.status,
    invoiceDone: prev.invoiceDone,
    invoiceDate: prev.invoiceDate,
    paidDone: prev.paidDone,
    payDate: prev.payDate,
    actualCost: data.actualCost,
    kubun: prev.kubun,
    jorei: data.jorei,
    billMonth: data.billMonth,
  };
  TocDataStore.upsertCase({ ...prev, ...patch });
  updateCaseActionLinks(tr, caseId);
}

function hydrateCasesTable() {
  const tbody = document.getElementById('casesTableBody');
  if (!tbody || !window.TocDataStore) return;
  TocDataStore.ensureInit();
  syncCategoryOptionsFromStore();
  const allCases = TocDataStore.getState().cases;
  const showInvoiced = getShowInvoicedOnCaseSheet();
  const filtered = showInvoiced ? [...allCases] : allCases.filter(c => c.invoiceDone !== '済');
  const cases = TocDataStore.sortCasesByCreatedDesc(filtered);
  tbody.innerHTML = '';
  cases.forEach((c, i) => tbody.appendChild(buildCaseRow(c, i + 1)));
  const foot = document.getElementById('tableFooterCount');
  if (foot) {
    const invoicedCount = allCases.filter(c => c.invoiceDone === '済').length;
    if (showInvoiced) {
      foot.textContent =
        invoicedCount > 0
          ? `全 ${cases.length} 件を表示（請求済み ${invoicedCount} 件を含む）`
          : `全 ${cases.length} 件を表示`;
    } else {
      foot.textContent =
        invoicedCount > 0
          ? `未請求 ${cases.length} 件を表示（請求済み ${invoicedCount} 件は一覧に含みません）`
          : `未請求 ${cases.length} 件を表示`;
    }
  }
  assignColumnIndices();
  applyCaseSheetColumnPreset();
  syncFilterOptionsFromStore();
  initPersistentSelects();
  initPersistentDateInputs();
  initContentMemoInputs();
  tbody.querySelectorAll('tr').forEach(recalcRow);
  tbody.querySelectorAll('tr').forEach(refreshNegativeStyles);
  applyTableFilters();
}

function initInvoiceDoneDialog() {
  const dialog = document.getElementById('invoiceDoneDialog');
  const form = document.getElementById('invoiceDoneForm');
  const dateInp = document.getElementById('invoiceDoneDate');
  const label = document.getElementById('invoiceDoneCaseLabel');
  const btnCancel = document.getElementById('invoiceDoneCancel');
  if (!dialog || !form || !window.TocDataStore) return;

  let invoiceDialogCaseId = null;

  document.getElementById('casesTableBody')?.addEventListener('click', e => {
    const btn = e.target.closest('.js-invoice-done');
    if (!btn) return;
    const tr = btn.closest('tr');
    const caseId = tr?.dataset.caseId;
    if (!caseId) return;
    invoiceDialogCaseId = caseId;
    const c = TocDataStore.getCase(caseId);
    const est = (c?.estimateNo && String(c.estimateNo).trim()) || '—';
    if (label) {
      label.textContent = c ? `${c.client || '—'} / 見積 ${est}` : '';
    }
    if (dateInp) {
      dateInp.value = new Date().toISOString().slice(0, 10);
    }
    if (dialog.showModal) dialog.showModal();
  });

  btnCancel?.addEventListener('click', () => {
    invoiceDialogCaseId = null;
    dialog.close();
  });

  form.addEventListener('submit', e => {
    e.preventDefault();
    if (!invoiceDialogCaseId || !dateInp?.value) {
      alert('請求日を入力してください。');
      return;
    }
    const prev = TocDataStore.getCase(invoiceDialogCaseId);
    if (!prev) {
      invoiceDialogCaseId = null;
      dialog.close();
      return;
    }
    TocDataStore.upsertCase({
      ...prev,
      invoiceDone: '済',
      invoiceDate: dateInp.value,
    });
    invoiceDialogCaseId = null;
    dialog.close();
    hydrateCasesTable();
  });

  dialog.addEventListener('close', () => {
    invoiceDialogCaseId = null;
  });
}

function initPersistentDateInputs(root = document) {
  const bind = inp => {
    if (inp.dataset.bound === '1') return;
    inp.dataset.bound = '1';
    inp.addEventListener('change', () => {
      const tr = inp.closest('tr');
      refreshNegativeStyles(tr);
      applyTableFilters();
      persistCaseRow(tr);
    });
  };
  root.querySelectorAll('input.cell-native-date').forEach(bind);
  root.querySelectorAll('input.cell-native-month').forEach(bind);
}

function initContentMemoInputs(root = document) {
  root.querySelectorAll('.cell-content-memo .cell-native-text').forEach(inp => {
    if (inp.dataset.bound === '1') return;
    inp.dataset.bound = '1';
    const onUpd = () => {
      const tr = inp.closest('tr');
      persistCaseRow(tr);
    };
    inp.addEventListener('input', () => applyTableFilters());
    inp.addEventListener('change', onUpd);
    inp.addEventListener('blur', onUpd);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('casesTableBody') && window.TocDataStore) {
    syncShowInvoicedButtonUI();
    hydrateCasesTable();
  } else {
    syncFilterOptionsFromStore();
    assignColumnIndices();
  }

  initSearchAndFilters();
  initSortableHeaders();
  initInlineEdit();
  initColumnSettings();
  initCaseSheetColumns();
  initInvoiceDoneDialog();

  document.getElementById('showInvoicedCasesBtn')?.addEventListener('click', () => {
    setShowInvoicedOnCaseSheet(!getShowInvoicedOnCaseSheet());
    syncShowInvoicedButtonUI();
    hydrateCasesTable();
  });
  syncShowInvoicedButtonUI();

  document.addEventListener('click', e => {
    const panel = document.getElementById('columnSettingsPanel');
    const btn = document.getElementById('columnSettingsBtn');
    if (!panel || panel.hidden) return;
    if (panel.contains(e.target) || btn.contains(e.target)) return;
    closeColumnPanel();
  });
});

function assignColumnIndices() {
  const table = document.querySelector('.data-table');
  if (!table) return;
  table.querySelectorAll('thead tr:first-child th').forEach((th, i) => {
    th.dataset.colIndex = String(i);
  });
  table.querySelectorAll('tbody tr').forEach(tr => {
    Array.from(tr.cells).forEach((td, i) => {
      td.dataset.colIndex = String(i);
    });
  });
}

/** 条例・ステータス等は常時プルダウン（区分は一覧では編集不可・案件フォームで変更） */
function initPersistentSelects() {
  document.querySelectorAll('td[data-edit^="select-"]').forEach(td => {
    if (td.querySelector('.cell-native-select')) return;
    const type = td.dataset.edit;
    const options = SELECT_OPTIONS[type];
    if (!options) return;

    let current = readSelectValue(td);
    if ((!current || !options.includes(current)) && td.dataset.initialValue) {
      current = td.dataset.initialValue;
    }
    if (!options.includes(current)) current = options[0];

    td.classList.add('cell-select-td');
    td.innerHTML = '';
    const sel = document.createElement('select');
    sel.className = 'cell-native-select';
    sel.setAttribute('aria-label', type.replace('select-', ''));
    options.forEach(o => {
      const opt = document.createElement('option');
      opt.value = o;
      opt.textContent = o;
      if (o === current) opt.selected = true;
      sel.appendChild(opt);
    });
    if (type === 'select-status') {
      sel.setAttribute('data-status', sel.value);
    }
    td.appendChild(sel);

    sel.addEventListener('change', () => {
      if (type === 'select-status') sel.setAttribute('data-status', sel.value);
      refreshNegativeStyles(td.closest('tr'));
      applyTableFilters();
      persistCaseRow(td.closest('tr'));
    });

    delete td.dataset.initialValue;
  });
}

/* ===== 検索・フィルタ（統合・複数条件 AND） ===== */
function getMultiFilterValues(selectId) {
  const sel = document.getElementById(selectId);
  if (!sel) return [];
  return Array.from(sel.selectedOptions)
    .map(o => o.value)
    .filter(v => v != null && String(v).trim() !== '');
}

function fillMultiSelectOptions(selectId, labels) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const keep = new Set(Array.from(sel.selectedOptions).map(o => o.value));
  sel.innerHTML = '';
  labels.forEach(text => {
    const o = document.createElement('option');
    o.value = text;
    o.textContent = text;
    if (keep.has(text)) o.selected = true;
    sel.appendChild(o);
  });
}

function syncFilterOptionsFromStore() {
  if (!window.TocDataStore) return;
  TocDataStore.ensureInit();
  const st = TocDataStore.getState();
  const salesNames = st.staff.filter(s => s.salesOk && s.status !== '無効').map(s => s.name);
  const designNames = st.staff.filter(s => s.designOk && s.status !== '無効').map(s => s.name);
  fillMultiSelectOptions('salesFilter', salesNames);
  fillMultiSelectOptions('designFilter', designNames);
  fillMultiSelectOptions('kubunFilter', SELECT_OPTIONS['select-kubun'] || []);
}

function staffCellMatches(cell, selectedNames) {
  if (!selectedNames.length) return true;
  const text = cell ? cell.textContent.trim() : '';
  const parts = text.split(/[、,]/).map(s => s.trim()).filter(Boolean);
  return selectedNames.some(
    name =>
      parts.includes(name) ||
      text === name ||
      (name && text.includes(name))
  );
}

function initSearchAndFilters() {
  const searchInput = document.getElementById('searchInput');
  const multiIds = ['statusFilter', 'salesFilter', 'designFilter', 'kubunFilter'];

  const run = () => applyTableFilters();

  if (searchInput) searchInput.addEventListener('input', run);
  multiIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', run);
  });

  const resetBtn = document.getElementById('filterResetBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      multiIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) Array.from(el.options).forEach(o => (o.selected = false));
      });
      applyTableFilters();
    });
  }
}

function rowSearchableText(row) {
  let s = row.textContent || '';
  row.querySelectorAll('textarea.cell-native-text, input.cell-native-date, input.cell-native-month').forEach(inp => {
    if (inp.value) s += ' ' + inp.value;
  });
  return s.toLowerCase();
}

function applyTableFilters() {
  const raw = document.getElementById('searchInput')?.value.trim().toLowerCase() ?? '';
  const tokens = raw.split(/[\s\u3000]+/).filter(Boolean);
  const statusPick = getMultiFilterValues('statusFilter');
  const salesPick = getMultiFilterValues('salesFilter');
  const designPick = getMultiFilterValues('designFilter');
  const kubunPick = getMultiFilterValues('kubunFilter');
  const rows = document.querySelectorAll('.data-table tbody tr');
  let visible = 0;

  rows.forEach(row => {
    const hay = rowSearchableText(row);
    const textOk = tokens.length === 0 || tokens.every(t => hay.includes(t));

    const statusEl = row.querySelector('[data-status]');
    const rowStatus = statusEl?.dataset.status ?? '';
    const statusOk =
      statusPick.length === 0 || statusPick.includes(rowStatus);

    const salesOk = staffCellMatches(row.querySelector('td[data-sales]'), salesPick);
    const designOk = staffCellMatches(row.querySelector('td[data-design]'), designPick);

    const kubunVal = row.cells[4] ? row.cells[4].textContent.trim() : '';
    const kubunOk = kubunPick.length === 0 || kubunPick.includes(kubunVal);

    const show = textOk && statusOk && salesOk && designOk && kubunOk;
    row.style.display = show ? '' : 'none';
    if (show) visible++;
  });

  const countEl = document.getElementById('rowCount');
  if (countEl) countEl.textContent = `${visible} 件表示`;
}

/* ===== 列表示設定 ===== */
function initColumnSettings() {
  const btn = document.getElementById('columnSettingsBtn');
  const panel = document.getElementById('columnSettingsPanel');
  const list = document.getElementById('columnSettingsList');
  if (!btn || !panel || !list) return;

  const ths = document.querySelectorAll('.data-table thead tr:first-child th');
  list.innerHTML = '';

  ths.forEach((th, idx) => {
    const label = document.createElement('label');
    label.className = 'column-settings__item';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = true;
    cb.dataset.colIndex = String(idx);
    const text = th.textContent.replace(/\s+/g, ' ').trim() || `#${idx}`;
    label.appendChild(cb);
    label.appendChild(document.createTextNode(text));
    list.appendChild(label);

    cb.addEventListener('change', () => {
      setColumnVisible(idx, cb.checked);
    });
  });

  btn.addEventListener('click', e => {
    e.stopPropagation();
    const open = panel.hidden;
    if (open) {
      panel.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
    } else {
      closeColumnPanel();
    }
  });
}

function closeColumnPanel() {
  const panel = document.getElementById('columnSettingsPanel');
  const btn = document.getElementById('columnSettingsBtn');
  if (panel) panel.hidden = true;
  if (btn) btn.setAttribute('aria-expanded', 'false');
}

function setColumnVisible(colIndex, visible) {
  document.querySelectorAll(`[data-col-index="${colIndex}"]`).forEach(el => {
    el.classList.toggle('col-hidden', !visible);
  });
}

function applyColumnPreset(indices) {
  const vis = new Set(indices);
  const n = document.querySelectorAll('.data-table thead tr:first-child th').length;
  for (let i = 0; i < n; i++) {
    setColumnVisible(i, vis.has(i));
  }
  document.querySelectorAll('#columnSettingsList input[type="checkbox"][data-col-index]').forEach(cb => {
    const idx = parseInt(cb.dataset.colIndex, 10);
    cb.checked = vis.has(idx);
  });
}

function applyCaseSheetColumnPreset() {
  applyColumnPreset(CASE_SHEET_VISIBLE_COLS);
}

function initCaseSheetColumns() {
  applyCaseSheetColumnPreset();
  applyTableFilters();
}

/* ===== ソート ===== */
function initSortableHeaders() {
  const ths = document.querySelectorAll('.data-table thead th[data-col]');
  let sortState = { col: null, asc: true };

  ths.forEach(th => {
    th.style.cursor = 'pointer';
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (sortState.col === col) {
        sortState.asc = !sortState.asc;
      } else {
        sortState.col = col;
        sortState.asc = true;
      }

      ths.forEach(t => t.classList.remove('sort-asc', 'sort-desc'));
      th.classList.add(sortState.asc ? 'sort-asc' : 'sort-desc');

      sortTable(col, sortState.asc);
    });
  });
}

function getSortComparable(td) {
  if (!td) return '';
  const sel = td.querySelector('.cell-native-select');
  if (sel) return sel.value;
  const dInp = td.querySelector('input.cell-native-date');
  if (dInp) return dInp.value || null;
  const mInp = td.querySelector('input.cell-native-month');
  if (mInp) return mInp.value || null;
  const memoInp = td.querySelector('.cell-native-text');
  if (memoInp) return memoInp.value.trim();

  const t = td.textContent.trim();
  if (t === '—' || t === '') return null;

  const money = parseMoney(t);
  if (!Number.isNaN(money) && /¥/.test(td.textContent)) {
    return money;
  }

  const plainNum = parseInt(t.replace(/,/g, ''), 10);
  if (!Number.isNaN(plainNum) && td.classList.contains('cell-estimate-no')) {
    return plainNum;
  }

  const pct = parseFloat(t.replace(/%/g, ''));
  if (!Number.isNaN(pct) && td.classList.contains('cell-rate')) {
    return pct;
  }

  const n = parseFloat(t.replace(/[¥,%▲+]/g, ''));
  if (!Number.isNaN(n) && /%/.test(t)) return n;

  const rowNum = parseInt(t, 10);
  if (td.classList.contains('col-rownum') && !Number.isNaN(rowNum)) return rowNum;

  return t;
}

function sortTable(colIndex, asc) {
  const tbody = document.querySelector('.data-table tbody');
  if (!tbody) return;

  const rows = Array.from(tbody.querySelectorAll('tr'));
  const idx = parseInt(colIndex, 10);

  rows.sort((a, b) => {
    const aVal = getSortComparable(a.cells[idx]);
    const bVal = getSortComparable(b.cells[idx]);

    if (aVal === null && bVal === null) return 0;
    if (aVal === null) return 1;
    if (bVal === null) return -1;

    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return asc ? aVal - bVal : bVal - aVal;
    }

    const as = String(aVal);
    const bs = String(bVal);
    return asc ? as.localeCompare(bs, 'ja') : bs.localeCompare(as, 'ja');
  });

  rows.forEach((r, i) => {
    tbody.appendChild(r);
    const rn = r.querySelector('.col-rownum');
    if (rn) rn.textContent = String(i + 1);
  });
}

/* ===== インライン編集 ===== */
function initInlineEdit() {
  const table = document.querySelector('.data-table tbody');
  if (!table) return;

  table.addEventListener('click', e => {
    if (e.target.closest('.cell-native-select')) return;
    const td = e.target.closest('td[data-editable]');
    if (!td || td.querySelector('.cell-inline-input, .cell-inline-select')) return;
    if (td.classList.contains('cell-select-td')) return;
    if ((td.dataset.edit || '').startsWith('select-')) return;
    if (e.target.closest('a, button')) return;
    startEdit(td);
  });
}

function getEditType(td) {
  return td.dataset.edit || 'text';
}

function readCellPlainValue(td) {
  const type = getEditType(td);
  if (type === 'money') {
    const n = parseMoney(td.textContent);
    return Number.isNaN(n) ? '' : String(Math.round(n));
  }
  return td.textContent.trim();
}

function readSelectValue(td) {
  const sel = td.querySelector('.cell-native-select');
  if (sel) return sel.value;
  const badge = td.querySelector('[data-status]');
  if (badge) return badge.textContent.trim();
  const kubun = td.querySelector('.kbn-pill');
  if (kubun) return kubun.textContent.trim();
  const b = td.querySelector('.badge:not([data-status])');
  if (b && getEditType(td) === 'select-category') return b.textContent.trim();
  return td.textContent.trim();
}

function startEdit(td) {
  if (td.querySelector('.cell-inline-input, .cell-inline-select')) return;
  if (td.querySelector('.cell-native-select')) return;

  const type = getEditType(td);
  if (type.startsWith('select-')) return;

  td.dataset.editSnapshot = td.innerHTML;

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'cell-inline-input';
  input.value = readCellPlainValue(td);
  if (type === 'money') {
    input.inputMode = 'numeric';
  }

  td.innerHTML = '';
  td.appendChild(input);
  input.focus();
  input.select();

  const commit = () => {
    if (td.dataset.editCancelled === '1') {
      td.removeAttribute('data-edit-cancelled');
      return;
    }
    const raw = input.value.trim();
    if (type === 'money') {
      const n = parseFloat(raw.replace(/,/g, ''));
      if (Number.isNaN(n)) {
        td.innerHTML = td.dataset.editSnapshot;
      } else {
        td.textContent = formatMoney(n);
        if (td.dataset.field) recalcRow(td.closest('tr'));
      }
    } else {
      const temp = document.createElement('div');
      temp.innerHTML = td.dataset.editSnapshot;
      const existingBadge = temp.querySelector('.badge');
      if (existingBadge) {
        existingBadge.textContent = raw;
        td.innerHTML = temp.innerHTML;
      } else {
        td.textContent = raw;
      }
      persistCaseRow(td.closest('tr'));
    }
    td.removeAttribute('data-edit-snapshot');
    refreshNegativeStyles(td.closest('tr'));
  };

  input.addEventListener('blur', commit);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      input.blur();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      td.dataset.editCancelled = '1';
      td.innerHTML = td.dataset.editSnapshot;
      td.removeAttribute('data-edit-snapshot');
    }
  });
}

/* ===== 自動計算 ===== */
function getFieldCell(row, field) {
  return row.querySelector(`[data-field="${field}"]`);
}

function parseMoney(str) {
  const t = String(str).replace(/[¥,\s]/g, '').replace(/[−–—]/g, '-');
  if (t === '' || t === '-') return NaN;
  const n = parseFloat(t);
  return Number.isNaN(n) ? NaN : n;
}

function formatMoney(n) {
  return '¥' + Math.round(n).toLocaleString('ja-JP');
}

function formatPercent(ratio) {
  if (ratio === null || Number.isNaN(ratio)) return '—';
  return (ratio * 100).toFixed(1) + '%';
}

function recalcRow(row) {
  if (!row) return;

  const fsCell = getFieldCell(row, 'forecast_sales');
  const fcCell = getFieldCell(row, 'forecast_cost');
  const fpCell = getFieldCell(row, 'forecast_profit');
  const frCell = getFieldCell(row, 'forecast_rate');
  const acCell = getFieldCell(row, 'actual_cost');

  const fs = parseMoney(fsCell?.textContent ?? '');
  const fc = parseMoney(fcCell?.textContent ?? '');
  const forecastSales = Number.isNaN(fs) ? 0 : fs;
  const forecastCost = Number.isNaN(fc) ? 0 : fc;

  const fProfit = forecastSales - forecastCost;
  const fRate = forecastSales !== 0 ? fProfit / forecastSales : null;

  if (fpCell) fpCell.textContent = formatMoney(fProfit);
  if (frCell) frCell.textContent = formatPercent(fRate);

  const ac = parseMoney(acCell?.textContent ?? '');
  const actualCost = Number.isNaN(ac) ? 0 : ac;

  const utilCell = getFieldCell(row, 'utilization');
  if (utilCell) {
    utilCell.textContent =
      forecastCost > 0 ? ((actualCost / forecastCost) * 100).toFixed(1) + '%' : '—';
  }

  refreshNegativeStyles(row);
  persistCaseRow(row);
}

function refreshNegativeStyles(row) {
  if (!row) return;

  const fp = getFieldCell(row, 'forecast_profit');
  if (fp) {
    const n = parseMoney(fp.textContent);
    toggleNeg(fp, !Number.isNaN(n) && n < 0);
  }

  const fr = getFieldCell(row, 'forecast_rate');
  if (fr) {
    const t = fr.textContent.trim();
    if (t === '—') fr.classList.remove('cell-value--negative');
    else {
      const v = parseFloat(t.replace(/%/g, ''));
      toggleNeg(fr, !Number.isNaN(v) && v < 0);
    }
  }

}

function toggleNeg(el, neg) {
  el.classList.toggle('cell-value--negative', neg);
  if (el.classList.contains('cell-num')) {
    el.classList.toggle('cell-num--neg', neg);
  }
}

