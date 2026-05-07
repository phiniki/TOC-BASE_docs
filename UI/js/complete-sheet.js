/**
 * 完了シート — 月別の金額・請求日・入金確認（データは案件シートと同一ストア）
 */

const COMPLETE_MONTH_KEY = 'toc-complete-sheet-month';

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function toDateInputValue(raw) {
  if (raw == null || raw === '—' || String(raw).trim() === '') return '';
  const s = String(raw).trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}

function toYearMonth(raw) {
  const d = toDateInputValue(raw);
  return d.length >= 7 ? d.slice(0, 7) : '';
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

function formatMarginDiffPct(forecastRate, actualRate) {
  if (forecastRate === null || actualRate === null || Number.isNaN(forecastRate) || Number.isNaN(actualRate)) {
    return '—';
  }
  const d = (actualRate - forecastRate) * 100;
  const sign = d > 0 ? '+' : '';
  return sign + d.toFixed(1) + '%';
}

function aggregateCompleteSheetByCategory(cases) {
  const map = new Map();
  for (const c of cases) {
    const cat = (c.category || '').trim() || '（未分類）';
    if (!map.has(cat)) {
      map.set(cat, { sumFS: 0, sumFC: 0, sumAS: 0, sumAC: 0 });
    }
    const r = map.get(cat);
    r.sumFS +=
      (window.TocDataStore && typeof TocDataStore.computeCaseForecastSalesEx === 'function'
        ? TocDataStore.computeCaseForecastSalesEx(c)
        : Number(c.forecastSales)) || 0;
    r.sumFC += Number(c.forecastCost) || 0;
    const as =
      c.actualSales != null && !Number.isNaN(Number(c.actualSales)) ? Number(c.actualSales) : 0;
    r.sumAS += as;
    r.sumAC += Number(c.actualCost) || 0;
  }
  return map;
}

function categorySummaryRowCells(label, sumFS, sumFC, sumAS, sumAC) {
  const fProfit = sumFS - sumFC;
  const fRate = sumFS > 0 ? fProfit / sumFS : null;
  const aProfit = sumAS - sumAC;
  const aRate = sumAS > 0 ? aProfit / sumAS : null;
  return `
    <th scope="row">${label}</th>
    <td class="num">${formatMoney(sumFS)}</td>
    <td class="num">${formatMoney(sumFC)}</td>
    <td class="num">${formatMoney(fProfit)}</td>
    <td class="num">${formatPercent(fRate)}</td>
    <td class="num">${formatMoney(sumAS)}</td>
    <td class="num">${formatMoney(sumAC)}</td>
    <td class="num">${formatMoney(aProfit)}</td>
    <td class="num">${formatPercent(aRate)}</td>
    <td class="num">${formatMarginDiffPct(fRate, aRate)}</td>`;
}

function getCompleteFilteredCases() {
  if (!window.TocDataStore || !window.TocFiscal) return [];
  const periodSelect = document.getElementById('fiscalPeriodSelect');
  const monthSelect = document.getElementById('fiscalMonthSelect');
  if (!periodSelect || !monthSelect) return [];
  const ym = getCompleteSelectedYm(periodSelect, monthSelect);
  return TocDataStore.getState().cases.filter(c => caseTouchesMonth(c, ym));
}

/** 集計表の行: 有効なマスタカテゴリ＋（未分類）＋データにだけあるカテゴリ（いずれも対象月に0件なら0表示） */
function completeSummaryCategoryRowOrder(aggregateMap) {
  const labels = new Set();
  if (window.TocDataStore) {
    TocDataStore.getState()
      .categories.filter(x => x.status !== '無効')
      .forEach(x => {
        const n = (x.name || '').trim();
        if (n) labels.add(n);
      });
  }
  labels.add('（未分類）');
  aggregateMap.forEach((_, cat) => labels.add(cat));
  return Array.from(labels).sort((a, b) => a.localeCompare(b, 'ja'));
}

function renderCategorySummary() {
  const tbody = document.getElementById('completeCategorySummaryBody');
  const tfoot = document.getElementById('completeCategorySummaryFoot');
  if (!tbody || !window.TocDataStore) return;

  const cases = getCompleteFilteredCases();
  const map = aggregateCompleteSheetByCategory(cases);
  const keys = completeSummaryCategoryRowOrder(map);
  const zero = { sumFS: 0, sumFC: 0, sumAS: 0, sumAC: 0 };

  let totFS = 0;
  let totFC = 0;
  let totAS = 0;
  let totAC = 0;

  tbody.innerHTML = keys
    .map(cat => {
      const r = map.get(cat) || zero;
      totFS += r.sumFS;
      totFC += r.sumFC;
      totAS += r.sumAS;
      totAC += r.sumAC;
      return `<tr>${categorySummaryRowCells(cat, r.sumFS, r.sumFC, r.sumAS, r.sumAC)}</tr>`;
    })
    .join('');

  if (tfoot) {
    tfoot.innerHTML = `<tr>${categorySummaryRowCells('合計', totFS, totFC, totAS, totAC)}</tr>`;
  }
}

function defaultMonthYm() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function loadSavedMonth() {
  try {
    const v = localStorage.getItem(COMPLETE_MONTH_KEY);
    if (v && /^\d{4}-\d{2}$/.test(v)) return v;
  } catch (_) {}
  return defaultMonthYm();
}

function saveMonthYm(ym) {
  try {
    localStorage.setItem(COMPLETE_MONTH_KEY, ym);
  } catch (_) {}
}

let completeFiscalUiReady = false;

function initCompleteFiscalUiOnce(periodSelect, monthSelect) {
  if (completeFiscalUiReady || !window.TocFiscal) return;
  monthSelect.innerHTML = '';
  for (let m = 1; m <= 12; m++) {
    const opt = document.createElement('option');
    opt.value = String(m);
    opt.textContent = `${TocFiscal.fiscalMonthIndexToCalendarMonth(m)}月`;
    monthSelect.appendChild(opt);
  }
  const savedYm = loadSavedMonth();
  const f = TocFiscal.calendarYmToFiscal(savedYm) || TocFiscal.currentFiscal();
  const cur = TocFiscal.currentFiscal();
  const maxKi = Math.max(cur.ki + 2, f.ki, 1);
  periodSelect.innerHTML = '';
  for (let k = 1; k <= maxKi; k++) {
    const opt = document.createElement('option');
    opt.value = String(k);
    opt.textContent = `${k}期目`;
    periodSelect.appendChild(opt);
  }
  periodSelect.value = String(f.ki);
  monthSelect.value = String(f.mi);
  completeFiscalUiReady = true;
}

function getCompleteSelectedYm(periodSelect, monthSelect) {
  if (!window.TocFiscal) return loadSavedMonth();
  const ki = parseInt(periodSelect.value, 10);
  const mi = parseInt(monthSelect.value, 10);
  if (!Number.isFinite(ki) || !Number.isFinite(mi)) return loadSavedMonth();
  try {
    return TocFiscal.fiscalToYyyyMm(ki, mi);
  } catch (_) {
    return loadSavedMonth();
  }
}

function caseTouchesMonth(c, ym) {
  if (!ym) return true;
  const bill = (c.billMonth || '').trim().slice(0, 7);
  if (bill === ym) return true;
  if (toYearMonth(c.invoiceDate) === ym) return true;
  if (toYearMonth(c.payDate) === ym) return true;
  return false;
}

function buildCompleteRow(c, rowNum) {
  const tr = document.createElement('tr');
  tr.dataset.caseId = c.caseId || '';
  const estRaw = (c.estimateNo && String(c.estimateNo).trim()) || '';
  const estDisp = estRaw ? escapeHtml(estRaw) : '—';
  const actualSalesInner = c.actualSales == null ? '—' : formatMoney(c.actualSales);
  const invVal = toDateInputValue(c.invoiceDate);
  const invDisp = invVal ? escapeHtml(invVal) : '—';
  const payDone = String(c.paidDone ?? '').trim() === '済';
  const payD = toDateInputValue(c.payDate);
  const paySort = payDone && payD ? payD : payDone ? '0000-01-01' : '';
  const payCellInner = payDone
    ? `<div class="cell-pay-stack"><span class="cell-pay-date">${escapeHtml(payD || '—')}</span></div>`
    : `<div class="cell-pay-stack"><button type="button" class="link-action link-action--btn js-paid-done">入金済みにする</button></div>`;
  const fs =
    window.TocDataStore && typeof TocDataStore.computeCaseForecastSalesEx === 'function'
      ? TocDataStore.computeCaseForecastSalesEx(c)
      : c.forecastSales != null
        ? Number(c.forecastSales)
        : 0;
  const fc = c.forecastCost != null ? Number(c.forecastCost) : 0;
  const fProfit = fs - fc;
  const fRate = fs !== 0 ? fProfit / fs : null;

  tr.innerHTML = `
    <td class="col-sticky col-sticky-1 col-rownum">${rowNum}</td>
    <td class="col-sticky col-sticky-2 cell-estimate-no">${estDisp}</td>
    <td class="col-sticky col-sticky-3">${escapeHtml(c.client)}</td>
    <td class="col-sticky col-sticky-4">${escapeHtml(c.building)}</td>
    <td>${escapeHtml(c.category)}</td>
    <td>${escapeHtml(c.kubun)}</td>
    <td>${escapeHtml(c.salesStaff)}</td>
    <td>${escapeHtml(c.designStaff)}</td>
    <td class="cell-num" data-field="forecast_sales">${formatMoney(fs)}</td>
    <td class="cell-num" data-field="forecast_cost">${formatMoney(fc)}</td>
    <td class="cell-num" data-field="forecast_profit">${formatMoney(fProfit)}</td>
    <td class="cell-rate" data-field="forecast_gross_rate">${formatPercent(fRate)}</td>
    <td class="cell-num" data-editable data-edit="money" data-field="actual_sales">${actualSalesInner}</td>
    <td class="cell-num" data-editable data-edit="money" data-field="actual_cost">${formatMoney(c.actualCost)}</td>
    <td class="cell-num" data-field="actual_profit">—</td>
    <td class="cell-rate" data-field="actual_gross_rate">—</td>
    <td class="cell-num" data-field="margin_rate_diff">—</td>
    <td class="cell-date cell-date-readonly" data-date-cell="invoice">${invDisp}</td>
    <td class="cell-pay-col cell-actions" data-paid-done="${escapeHtml(payDone ? '済' : '未')}" data-pay-sort="${escapeHtml(paySort)}">
      ${payCellInner}
    </td>
    <td class="cell-num" data-editable data-edit="money" data-field="sales_tax_included">${formatMoney(c.salesTaxIncluded)}</td>
    <td class="cell-num" data-field="consumption_tax">—</td>
  `;
  return tr;
}

function cellMoneyOrZero(td) {
  if (!td) return 0;
  const n = parseMoney(td.textContent);
  return Number.isNaN(n) ? 0 : n;
}

function cellMoneyOptional(td) {
  if (!td) return null;
  const t = td.textContent.trim();
  if (t === '—' || t === '') return null;
  const n = parseMoney(t);
  return Number.isNaN(n) ? null : n;
}

function readCompletePatch(tr) {
  return {
    actualCost: cellMoneyOrZero(getFieldCell(tr, 'actual_cost')),
    actualSales: cellMoneyOptional(getFieldCell(tr, 'actual_sales')),
    salesTaxIncluded: cellMoneyOrZero(getFieldCell(tr, 'sales_tax_included')),
  };
}

function persistCompleteRow(tr) {
  if (!window.TocDataStore || !tr?.dataset.caseId) return;
  const caseId = tr.dataset.caseId;
  const prev = TocDataStore.getCase(caseId);
  if (!prev) return;
  const patch = readCompletePatch(tr);
  TocDataStore.upsertCase({
    ...prev,
    ...patch,
    invoiceDate: prev.invoiceDate,
    invoiceDone: prev.invoiceDone,
  });
}

function getFieldCell(row, field) {
  return row.querySelector(`[data-field="${field}"]`);
}

function recalcCompleteRow(row) {
  if (!row) return;
  const fsEl = getFieldCell(row, 'forecast_sales');
  const fcEl = getFieldCell(row, 'forecast_cost');
  const fpEl = getFieldCell(row, 'forecast_profit');
  const frEl = getFieldCell(row, 'forecast_gross_rate');
  const acCell = getFieldCell(row, 'actual_cost');
  const asCell = getFieldCell(row, 'actual_sales');
  const apCell = getFieldCell(row, 'actual_profit');
  const agCell = getFieldCell(row, 'actual_gross_rate');
  const diffCell = getFieldCell(row, 'margin_rate_diff');
  const taxIncCell = getFieldCell(row, 'sales_tax_included');
  const ctCell = getFieldCell(row, 'consumption_tax');

  const fs = parseMoney(fsEl?.textContent ?? '');
  const forecastSales = Number.isNaN(fs) ? 0 : fs;
  const fc = parseMoney(fcEl?.textContent ?? '');
  const forecastCost = Number.isNaN(fc) ? 0 : fc;
  const fProfit = forecastSales - forecastCost;
  const fRate = forecastSales !== 0 ? fProfit / forecastSales : null;
  if (fpEl) fpEl.textContent = formatMoney(fProfit);
  if (frEl) frEl.textContent = formatPercent(fRate);

  const ac = parseMoney(acCell?.textContent ?? '');
  const actualCost = Number.isNaN(ac) ? 0 : ac;
  const salesRaw = asCell?.textContent.trim() ?? '';
  const salesEmDash = salesRaw === '—' || salesRaw === '';
  const aSalesParsed = parseMoney(asCell?.textContent ?? '');
  const actualSales = Number.isNaN(aSalesParsed) ? 0 : aSalesParsed;

  const profit = actualSales - actualCost;
  const rate = actualSales !== 0 ? profit / actualSales : null;

  if (salesEmDash) {
    if (apCell) apCell.textContent = '—';
    if (agCell) agCell.textContent = '—';
    if (diffCell) diffCell.textContent = '—';
  } else {
    if (apCell) apCell.textContent = formatMoney(profit);
    if (agCell) agCell.textContent = formatPercent(rate);
    if (diffCell) {
      if (fRate === null || rate === null) diffCell.textContent = '—';
      else {
        const d = (rate - fRate) * 100;
        const sign = d > 0 ? '+' : '';
        diffCell.textContent = sign + d.toFixed(1) + '%';
      }
    }
  }

  const ti = parseMoney(taxIncCell?.textContent ?? '');
  const taxIncluded = Number.isNaN(ti) ? 0 : ti;
  if (ctCell) {
    const base = salesEmDash ? 0 : actualSales;
    ctCell.textContent = formatMoney(taxIncluded - base);
  }

  persistCompleteRow(row);
  renderCategorySummary();
}

function initCompletePaidDoneDialog() {
  const dialog = document.getElementById('paidDoneDialog');
  const form = document.getElementById('paidDoneForm');
  const dateInp = document.getElementById('paidDoneDate');
  const label = document.getElementById('paidDoneCaseLabel');
  const btnCancel = document.getElementById('paidDoneCancel');
  if (!dialog || !form || !window.TocDataStore) return;

  let paidDialogCaseId = null;

  document.getElementById('completeTableBody')?.addEventListener('click', e => {
    const btn = e.target.closest('.js-paid-done');
    if (!btn) return;
    const tr = btn.closest('tr');
    const caseId = tr?.dataset.caseId;
    if (!caseId) return;
    paidDialogCaseId = caseId;
    const c = TocDataStore.getCase(caseId);
    const est = (c?.estimateNo && String(c.estimateNo).trim()) || '—';
    if (label) {
      label.textContent = c ? `${c.client || '—'} / 見積 ${est}` : '';
    }
    if (dateInp) {
      const existing = c && String(c.paidDone ?? '').trim() === '済' ? toDateInputValue(c.payDate) : '';
      dateInp.value = existing || new Date().toISOString().slice(0, 10);
    }
    if (dialog.showModal) dialog.showModal();
  });

  btnCancel?.addEventListener('click', () => {
    paidDialogCaseId = null;
    dialog.close();
  });

  form.addEventListener('submit', e => {
    e.preventDefault();
    if (!paidDialogCaseId || !dateInp?.value) {
      alert('入金日を入力してください。');
      return;
    }
    const prev = TocDataStore.getCase(paidDialogCaseId);
    if (!prev) {
      paidDialogCaseId = null;
      dialog.close();
      return;
    }
    TocDataStore.upsertCase({
      ...prev,
      paidDone: '済',
      payDate: dateInp.value,
    });
    paidDialogCaseId = null;
    dialog.close();
    hydrateCompleteTable();
  });

  dialog.addEventListener('close', () => {
    paidDialogCaseId = null;
  });
}

function initCompleteInlineEdit() {
  const table = document.querySelector('.data-table--complete tbody');
  if (!table) return;

  table.addEventListener('click', e => {
    if (e.target.closest('.cell-native-select')) return;
    const td = e.target.closest('td[data-editable]');
    if (!td || td.querySelector('.cell-inline-input')) return;
    if (td.classList.contains('cell-select-td')) return;
    if (e.target.closest('a, button')) return;

    td.dataset.editSnapshot = td.innerHTML;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'cell-inline-input';
    input.inputMode = 'numeric';
    const t = td.textContent.trim();
    if (t !== '—' && /¥/.test(t)) {
      const n = parseMoney(t);
      input.value = Number.isNaN(n) ? '' : String(Math.round(n));
    } else input.value = '';

    td.innerHTML = '';
    td.appendChild(input);
    input.focus();
    input.select();

    const tr = td.closest('tr');
    const commit = () => {
      if (td.dataset.editCancelled === '1') {
        td.removeAttribute('data-edit-cancelled');
        return;
      }
      const raw = input.value.trim().replace(/,/g, '');
      const n = parseFloat(raw);
      if (Number.isNaN(n)) {
        td.innerHTML = td.dataset.editSnapshot;
      } else {
        td.textContent = formatMoney(n);
        recalcCompleteRow(tr);
      }
      td.removeAttribute('data-edit-snapshot');
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
  });
}

function assignCompleteColumnIndices() {
  const table = document.querySelector('.data-table--complete');
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

function hydrateCompleteTable() {
  const tbody = document.getElementById('completeTableBody');
  const periodSelect = document.getElementById('fiscalPeriodSelect');
  const monthSelect = document.getElementById('fiscalMonthSelect');
  if (!tbody || !periodSelect || !monthSelect || !window.TocDataStore || !window.TocFiscal) return;

  TocDataStore.ensureInit();
  initCompleteFiscalUiOnce(periodSelect, monthSelect);

  const ym = getCompleteSelectedYm(periodSelect, monthSelect);
  saveMonthYm(ym);

  const filtered = TocDataStore.getState().cases.filter(c => caseTouchesMonth(c, ym));
  const cases = TocDataStore.sortCasesByCreatedDesc(filtered);
  tbody.innerHTML = '';
  cases.forEach((c, i) => tbody.appendChild(buildCompleteRow(c, i + 1)));

  assignCompleteColumnIndices();
  tbody.querySelectorAll('tr').forEach(recalcCompleteRow);

  const f = TocFiscal.calendarYmToFiscal(ym) || TocFiscal.currentFiscal();
  const { y, m } = TocFiscal.fiscalToCalendarYearMonth(f.ki, f.mi);
  const calM = String(m).padStart(2, '0');

  const foot = document.getElementById('completeTableFooter');
  if (foot) {
    foot.textContent = `${TocFiscal.formatKiGetsu(f.ki, f.mi)}（${y}年${calM}月） ${cases.length} 件`;
  }
  const countEl = document.getElementById('completeRowCount');
  if (countEl) countEl.textContent = `${cases.length} 件`;

  renderCategorySummary();
}

function applyCompleteMonthFilter() {
  const periodSelect = document.getElementById('fiscalPeriodSelect');
  const monthSelect = document.getElementById('fiscalMonthSelect');
  if (!periodSelect || !monthSelect) return;
  saveMonthYm(getCompleteSelectedYm(periodSelect, monthSelect));
  hydrateCompleteTable();
}

function initCompleteSort() {
  const ths = document.querySelectorAll('.data-table--complete thead th[data-col]');
  let sortState = { col: null, asc: true };

  ths.forEach(th => {
    th.style.cursor = 'pointer';
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (sortState.col === col) sortState.asc = !sortState.asc;
      else {
        sortState.col = col;
        sortState.asc = true;
      }
      ths.forEach(t => t.classList.remove('sort-asc', 'sort-desc'));
      th.classList.add(sortState.asc ? 'sort-asc' : 'sort-desc');

      const tbody = document.querySelector('.data-table--complete tbody');
      if (!tbody) return;
      const idx = parseInt(col, 10);
      const rows = Array.from(tbody.querySelectorAll('tr'));
      rows.sort((a, b) => {
        const ac = a.cells[idx];
        const bc = b.cells[idx];

        if (ac?.classList.contains('cell-pay-col') && bc?.classList.contains('cell-pay-col')) {
          const paySortKey = cell => {
            if (!cell) return null;
            const s = cell.dataset.paySort || '';
            if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
            if (cell.dataset.paidDone === '済') return '0000-01-01';
            return null;
          };
          const av = paySortKey(ac);
          const bv = paySortKey(bc);
          if (av === null && bv === null) return 0;
          if (av === null) return 1;
          if (bv === null) return -1;
          return sortState.asc ? av.localeCompare(bv) : bv.localeCompare(av);
        }

        const sel = ac?.querySelector('.cell-native-select');
        const av = sel ? sel.value : ac?.textContent.trim() ?? '';
        const bv = bc?.querySelector('.cell-native-select')?.value ?? bc?.textContent.trim() ?? '';
        const an = parseMoney(av);
        const bn = parseMoney(bv);
        if (!Number.isNaN(an) && !Number.isNaN(bn) && /¥/.test(ac.textContent)) {
          return sortState.asc ? an - bn : bn - an;
        }
        return sortState.asc
          ? String(av).localeCompare(String(bv), 'ja')
          : String(bv).localeCompare(String(av), 'ja');
      });
      rows.forEach((r, i) => {
        tbody.appendChild(r);
        const rn = r.querySelector('.col-rownum');
        if (rn) rn.textContent = String(i + 1);
      });
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  if (!document.getElementById('completeTableBody')) return;

  if (window.TocDataStore) {
    hydrateCompleteTable();
  }

  initCompletePaidDoneDialog();

  const periodSelect = document.getElementById('fiscalPeriodSelect');
  const monthSelect = document.getElementById('fiscalMonthSelect');
  if (periodSelect) periodSelect.addEventListener('change', applyCompleteMonthFilter);
  if (monthSelect) monthSelect.addEventListener('change', applyCompleteMonthFilter);

  initCompleteInlineEdit();
  initCompleteSort();
});
