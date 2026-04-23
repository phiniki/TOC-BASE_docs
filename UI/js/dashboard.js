/**
 * TOC-BASE 全体ダッシュボード
 * 会計期（9月始まり）を選択し、案件データから月次・半期・年間を集計
 */

const FIRST_HALF_IDX = [0, 1, 2, 3, 4, 5];
const SECOND_HALF_IDX = [6, 7, 8, 9, 10, 11];

let dashboardKi = 1;
let companyChart = null;
let salesRepMetric = 'sales';
let cachedSalesRepMatrix = null;

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function dashboardFiscalMonthLabels() {
  if (!window.TocFiscal) {
    return Array.from({ length: 12 }, (_, i) => `${i + 1}月`);
  }
  return Array.from({ length: 12 }, (_, i) =>
    `${TocFiscal.fiscalMonthIndexToCalendarMonth(i + 1)}月`
  );
}

/** 表の列順: 9–2月, 上期計, 3–8月, 下期計, 年間計 */
function dashboardMatrixColLabels(monthLabels) {
  return [
    ...FIRST_HALF_IDX.map(i => monthLabels[i]),
    '上期計',
    ...SECOND_HALF_IDX.map(i => monthLabels[i]),
    '下期計',
    '年間計',
  ];
}

function splitStaffNames(s) {
  if (!s || !String(s).trim()) return [];
  return String(s)
    .split(/[、,，/]/)
    .map(x => x.trim())
    .filter(Boolean);
}

function fiscalMonthIndexForCase(c, ki) {
  if (!c.billMonth || !window.TocFiscal) return null;
  const fd = TocFiscal.calendarYmToFiscal(c.billMonth);
  if (!fd || fd.ki !== ki) return null;
  return fd.mi - 1;
}

function getDashboardHalfBillMonthSets(ki) {
  if (!window.TocFiscal) return { h1: new Set(), h2: new Set(), year: new Set() };
  const h1 = new Set();
  const h2 = new Set();
  for (let fm = 1; fm <= 6; fm++) h1.add(TocFiscal.fiscalToYyyyMm(ki, fm));
  for (let fm = 7; fm <= 12; fm++) h2.add(TocFiscal.fiscalToYyyyMm(ki, fm));
  const year = new Set([...h1, ...h2]);
  return { h1, h2, year };
}

function sumHalfActualSales(cases, half, ki) {
  const { h1, h2 } = getDashboardHalfBillMonthSets(ki);
  const set = half === 'h1' ? h1 : h2;
  return cases.reduce((s, c) => {
    if (!c.billMonth || !set.has(c.billMonth) || c.actualSales == null) return s;
    return s + (Number(c.actualSales) || 0);
  }, 0);
}

function buildCompanyBuckets(cases, ki) {
  const buckets = Array.from({ length: 12 }, () => ({
    fSales: 0,
    fCost: 0,
    aSales: 0,
    aCost: 0,
  }));
  cases.forEach(c => {
    const idx = fiscalMonthIndexForCase(c, ki);
    if (idx === null) return;
    const t = buckets[idx];
    t.fSales += Number(c.forecastSales) || 0;
    t.fCost += Number(c.forecastCost) || 0;
    t.aCost += Number(c.actualCost) || 0;
    if (c.actualSales != null) t.aSales += Number(c.actualSales) || 0;
  });
  return buckets;
}

function sumBucketsRaw(buckets, indices) {
  const acc = { fSales: 0, fCost: 0, aSales: 0, aCost: 0 };
  indices.forEach(i => {
    acc.fSales += buckets[i].fSales;
    acc.fCost += buckets[i].fCost;
    acc.aSales += buckets[i].aSales;
    acc.aCost += buckets[i].aCost;
  });
  return acc;
}

function deriveMetrics(raw) {
  const fProfit = raw.fSales - raw.fCost;
  const aProfit = raw.aSales - raw.aCost;
  const fMargin = raw.fSales > 0 ? (fProfit / raw.fSales) * 100 : 0;
  const aMargin = raw.aSales > 0 ? (aProfit / raw.aSales) * 100 : 0;
  return { ...raw, fProfit, aProfit, fMargin, aMargin };
}

function buildSalesRepMatrix(cases, ki) {
  const init = () => ({
    sales: Array(12).fill(0),
    cost: Array(12).fill(0),
    count: Array(12).fill(0),
  });
  const map = new Map();
  cases.forEach(c => {
    const idx = fiscalMonthIndexForCase(c, ki);
    if (idx === null) return;
    const names = splitStaffNames(c.salesStaff);
    if (!names.length) return;
    const n = names.length;
    const as = c.actualSales != null ? Number(c.actualSales) || 0 : 0;
    const ac = Number(c.actualCost) || 0;
    names.forEach(name => {
      if (!map.has(name)) map.set(name, init());
      const r = map.get(name);
      r.sales[idx] += as / n;
      r.cost[idx] += ac / n;
      r.count[idx] += 1 / n;
    });
  });
  return map;
}

function buildDesignRepMatrix(cases, ki) {
  const init = () => Array(12).fill(0);
  const map = new Map();
  cases.forEach(c => {
    const idx = fiscalMonthIndexForCase(c, ki);
    if (idx === null) return;
    const names = splitStaffNames(c.designStaff);
    if (!names.length) return;
    const n = names.length;
    names.forEach(name => {
      if (!map.has(name)) map.set(name, init());
      map.get(name)[idx] += 1 / n;
    });
  });
  return map;
}

function sumArr(arr, indices) {
  return indices.reduce((s, i) => s + arr[i], 0);
}

function aggRepPeriod(rep, indices) {
  return {
    sales: sumArr(rep.sales, indices),
    cost: sumArr(rep.cost, indices),
    count: sumArr(rep.count, indices),
  };
}

function formatCount(n) {
  if (Math.abs(n - Math.round(n)) < 1e-6) return String(Math.round(n));
  return n.toFixed(1);
}

function cellForSalesMetric(metric, sales, cost, count) {
  const profit = sales - cost;
  const margin = sales > 0 ? (profit / sales) * 100 : 0;
  switch (metric) {
    case 'sales':
      return formatYen(sales);
    case 'count':
      return formatCount(count);
    case 'profit':
      return formatYen(profit);
    case 'margin':
      return formatPct(margin);
    default:
      return '—';
  }
}

/* カテゴリ別：月次売上・粗利（千円単位で生成し表示時に円へ） */
const CATEGORY_ROWS = [
  { name: 'Joshin', base: 1200 },
  { name: 'コラボ', base: 980 },
  { name: '媒体', base: 760 },
  { name: 'ネット', base: 640 },
  { name: 'その他材料', base: 520 },
  { name: '立替', base: 310 },
];

const CLIENT_ROWS = [
  { name: '株式会社アクシスデザイン', base: 1500 },
  { name: '有限会社ブライトホーム', base: 1320 },
  { name: '東京リアルティ株式会社', base: 1180 },
  { name: '合同会社グリーンスペース', base: 890 },
  { name: '株式会社フジワラ建設', base: 720 },
];

function buildPurchaseMatrix(factor = 1) {
  const rows = [];
  for (let r = 0; r < 12; r++) {
    const row = [];
    for (let c = 0; c < 12; c++) {
      const v = Math.max(0, Math.round((800 + (r - c) * 120 + (r + c) * 45) * 100_000 * factor / 1000));
      row.push(v);
    }
    rows.push(row);
  }
  return rows;
}

let purchaseMatrixCache = buildPurchaseMatrix(1);

const WIP_BY_ROW = Array.from({ length: 12 }, (_, i) =>
  Math.round((420 + i * 85 + (i % 3) * 110) * 100_000 / 10)
);

document.addEventListener('DOMContentLoaded', () => {
  if (window.TocDataStore) TocDataStore.ensureInit();
  initFiscalKiSelect();
  initSalesMetricTabs();
  renderSegmentMatrices();
  renderPurchaseSection();
  renderWipTable();

  document.getElementById('segmentTabCategory')?.addEventListener('click', () => setSegmentTab('category'));
  document.getElementById('segmentTabClient')?.addEventListener('click', () => setSegmentTab('client'));

  document.getElementById('vendorFilter')?.addEventListener('change', e => {
    const v = e.target.value;
    const factor = v === 'すべて' ? 1 : 0.72 + (v.length % 5) * 0.05;
    purchaseMatrixCache = buildPurchaseMatrix(factor);
    renderPurchaseSection();
  });

  refreshDashboard();
  highlightMatrixMonth(null);
});

function initFiscalKiSelect() {
  const sel = document.getElementById('fiscalKiSelect');
  const fyLabel = document.getElementById('fyDisplay');
  if (!sel) return;

  if (!window.TocFiscal) {
    sel.innerHTML = '<option value="1">1期目</option>';
    dashboardKi = 1;
    if (fyLabel) fyLabel.textContent = '—';
    return;
  }

  const cur = TocFiscal.currentFiscal().ki;
  dashboardKi = cur;
  const maxKi = Math.max(cur + 1, 15);
  sel.innerHTML = '';
  for (let k = 1; k <= maxKi; k++) {
    const opt = document.createElement('option');
    opt.value = String(k);
    opt.textContent = `${k}期目（${TocFiscal.fiscalYearRangeJa(k)}）`;
    if (k === cur) opt.selected = true;
    sel.appendChild(opt);
  }
  if (fyLabel) fyLabel.textContent = `${dashboardKi}期目（${TocFiscal.fiscalYearRangeJa(dashboardKi)}）`;

  sel.addEventListener('change', () => {
    dashboardKi = parseInt(sel.value, 10) || 1;
    if (fyLabel) fyLabel.textContent = `${dashboardKi}期目（${TocFiscal.fiscalYearRangeJa(dashboardKi)}）`;
    refreshDashboard();
    highlightMatrixMonth(null);
  });
}

function initSalesMetricTabs() {
  document.querySelectorAll('.dash-metric-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const m = btn.dataset.metric;
      if (!m) return;
      salesRepMetric = m;
      document.querySelectorAll('.dash-metric-tab').forEach(b => {
        const on = b.dataset.metric === m;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      renderSalesRepTable(cachedSalesRepMatrix);
    });
  });
}

function refreshDashboard() {
  const cap = document.getElementById('kpiPeriodCaption');
  if (cap && window.TocFiscal) {
    cap.textContent = `${dashboardKi}期目 ${TocFiscal.fiscalYearRangeJa(dashboardKi)}`;
  } else if (cap) {
    cap.textContent = `${dashboardKi}期目`;
  }

  if (!window.TocDataStore || !window.TocFiscal) return;

  const state = TocDataStore.getState();
  const cases = state.cases;
  const buckets = buildCompanyBuckets(cases, dashboardKi);
  const labels = dashboardFiscalMonthLabels();

  renderCompanyChart(labels, buckets);
  renderCompanyFiscalTable(buckets, labels);
  renderGoalBlock(state);

  cachedSalesRepMatrix = buildSalesRepMatrix(cases, dashboardKi);
  renderSalesRepTable(cachedSalesRepMatrix);
  renderDesignRepTable(buildDesignRepMatrix(cases, dashboardKi));
}

function renderCompanyFiscalTable(buckets, labels) {
  const head = document.getElementById('companyFiscalHead');
  const body = document.getElementById('companyFiscalBody');
  if (!head || !body) return;

  const months = buckets.map(b => deriveMetrics(b));
  const h1 = deriveMetrics(sumBucketsRaw(buckets, FIRST_HALF_IDX));
  const h2 = deriveMetrics(sumBucketsRaw(buckets, SECOND_HALF_IDX));
  const yr = deriveMetrics(sumBucketsRaw(buckets, [...FIRST_HALF_IDX, ...SECOND_HALF_IDX]));
  const cols = [
    ...FIRST_HALF_IDX.map(i => ({ label: labels[i], m: months[i] })),
    { label: '上期計', m: h1 },
    ...SECOND_HALF_IDX.map(i => ({ label: labels[i], m: months[i] })),
    { label: '下期計', m: h2 },
    { label: '年間計', m: yr },
  ];

  head.innerHTML = `<tr><th scope="col">指標</th>${cols
    .map(c => `<th class="num" scope="col">${escapeHtml(c.label)}</th>`)
    .join('')}</tr>`;

  const rows = [
    ['予想売上', m => formatYen(m.fSales)],
    ['予想原価', m => formatYen(m.fCost)],
    ['予想粗利', m => formatYen(m.fProfit)],
    ['予想粗利率', m => formatPct(m.fMargin)],
    ['実際売上', m => formatYen(m.aSales)],
    ['実際原価', m => formatYen(m.aCost)],
    ['実際粗利', m => formatYen(m.aProfit)],
    ['実際粗利率', m => formatPct(m.aMargin)],
  ];

  body.innerHTML = rows
    .map(
      ([title, fn]) =>
        `<tr><th scope="row">${escapeHtml(title)}</th>${cols.map(c => `<td class="num">${fn(c.m)}</td>`).join('')}</tr>`
    )
    .join('');
}

function renderCompanyChart(labels, buckets) {
  const canvas = document.getElementById('companyMonthlyChart');
  if (!canvas || typeof Chart === 'undefined') return;

  const fSales = buckets.map(b => b.fSales / 1_000_000);
  const aSales = buckets.map(b => b.aSales / 1_000_000);
  const fProfit = buckets.map(b => (b.fSales - b.fCost) / 1_000_000);
  const aProfit = buckets.map(b => (b.aSales - b.aCost) / 1_000_000);

  if (companyChart) companyChart.destroy();

  companyChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: '予想売上',
          data: fSales,
          borderColor: '#94a3b8',
          backgroundColor: 'rgba(148,163,184,0.08)',
          fill: false,
          tension: 0.25,
          pointRadius: 3,
        },
        {
          label: '実際売上',
          data: aSales,
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37,99,235,0.08)',
          fill: false,
          tension: 0.25,
          pointRadius: 3,
        },
        {
          label: '予想粗利',
          data: fProfit,
          borderColor: '#cbd5e1',
          borderDash: [6, 4],
          fill: false,
          tension: 0.25,
          pointRadius: 2,
        },
        {
          label: '実際粗利',
          data: aProfit,
          borderColor: '#16a34a',
          borderDash: [6, 4],
          fill: false,
          tension: 0.25,
          pointRadius: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'top',
          labels: { boxWidth: 12, font: { size: 11 } },
        },
        tooltip: {
          callbacks: {
            label(ctx) {
              const v = ctx.raw * 1_000_000;
              return `${ctx.dataset.label}: ${formatYen(v)}`;
            },
          },
        },
      },
      scales: {
        y: {
          grid: { color: '#e2e8f0' },
          title: { display: true, text: '百万円' },
          ticks: {
            callback(v) {
              return `${v}M`;
            },
          },
        },
        x: {
          grid: { display: false },
        },
      },
    },
  });
}

function renderSalesRepTable(repMap) {
  const head = document.getElementById('salesRepTableHead');
  const body = document.getElementById('salesRepTableBody');
  if (!head || !body) return;

  const labels = dashboardFiscalMonthLabels();
  const colLabels = dashboardMatrixColLabels(labels);
  head.innerHTML = `<tr><th scope="col">営業担当</th>${colLabels
    .map(l => `<th class="num" scope="col">${escapeHtml(l)}</th>`)
    .join('')}</tr>`;

  if (!repMap || !repMap.size) {
    body.innerHTML = `<tr><td colspan="${colLabels.length + 1}">該当する案件がありません</td></tr>`;
    return;
  }

  const names = Array.from(repMap.keys()).sort((a, b) => a.localeCompare(b, 'ja'));
  body.innerHTML = names
    .map(name => {
      const rep = repMap.get(name);
      const cells = [];
      const pushMonth = i =>
        cells.push(
          `<td class="num">${cellForSalesMetric(salesRepMetric, rep.sales[i], rep.cost[i], rep.count[i])}</td>`
        );
      FIRST_HALF_IDX.forEach(pushMonth);
      const h1 = aggRepPeriod(rep, FIRST_HALF_IDX);
      const h2 = aggRepPeriod(rep, SECOND_HALF_IDX);
      const yr = aggRepPeriod(rep, [...FIRST_HALF_IDX, ...SECOND_HALF_IDX]);
      cells.push(`<td class="num">${cellForSalesMetric(salesRepMetric, h1.sales, h1.cost, h1.count)}</td>`);
      SECOND_HALF_IDX.forEach(pushMonth);
      cells.push(`<td class="num">${cellForSalesMetric(salesRepMetric, h2.sales, h2.cost, h2.count)}</td>`);
      cells.push(`<td class="num">${cellForSalesMetric(salesRepMetric, yr.sales, yr.cost, yr.count)}</td>`);
      return `<tr><th scope="row">${escapeHtml(name)}</th>${cells.join('')}</tr>`;
    })
    .join('');
}

function renderDesignRepTable(repMap) {
  const head = document.getElementById('designRepTableHead');
  const body = document.getElementById('designRepTableBody');
  if (!head || !body) return;

  const labels = dashboardFiscalMonthLabels();
  const colLabels = dashboardMatrixColLabels(labels);
  head.innerHTML = `<tr><th scope="col">デザイン担当</th>${colLabels
    .map(l => `<th class="num" scope="col">${escapeHtml(l)}</th>`)
    .join('')}</tr>`;

  if (!repMap || !repMap.size) {
    body.innerHTML = `<tr><td colspan="${colLabels.length + 1}">該当する案件がありません</td></tr>`;
    return;
  }

  const names = Array.from(repMap.keys()).sort((a, b) => a.localeCompare(b, 'ja'));
  body.innerHTML = names
    .map(name => {
      const arr = repMap.get(name);
      const cells = [];
      FIRST_HALF_IDX.forEach(i => cells.push(`<td class="num">${formatCount(arr[i])}</td>`));
      const h1 = sumArr(arr, FIRST_HALF_IDX);
      const h2 = sumArr(arr, SECOND_HALF_IDX);
      const y = h1 + h2;
      cells.push(`<td class="num">${formatCount(h1)}</td>`);
      SECOND_HALF_IDX.forEach(i => cells.push(`<td class="num">${formatCount(arr[i])}</td>`));
      cells.push(`<td class="num">${formatCount(h2)}</td>`);
      cells.push(`<td class="num">${formatCount(y)}</td>`);
      return `<tr><th scope="row">${escapeHtml(name)}</th>${cells.join('')}</tr>`;
    })
    .join('');
}

function formatYen(n) {
  const sign = n < 0 ? '−' : '';
  return `${sign}¥${Math.abs(Math.round(n)).toLocaleString('ja-JP')}`;
}

function formatPct(n, digits = 1) {
  return `${n.toFixed(digits)}%`;
}

function achievementPct(actual, target) {
  if (!target) return 0;
  return (actual / target) * 100;
}

function renderGoalBlock(state) {
  const g = state.goals || {};
  const h1t = Number(g.targetH1) || 0;
  const h2t = Number(g.targetH2) || 0;
  const totalTarget = h1t + h2t;
  const h1a = sumHalfActualSales(state.cases, 'h1', dashboardKi);
  const h2a = sumHalfActualSales(state.cases, 'h2', dashboardKi);
  const actualYear = h1a + h2a;
  const ach = achievementPct(actualYear, totalTarget);
  const diff = totalTarget - actualYear;

  const sumEl = document.getElementById('goalYearSummary');
  if (sumEl) {
    sumEl.innerHTML = `
      <span class="goal-summary-item">年間目標（上期+下期） <strong>${formatYen(totalTarget)}</strong></span>
      <span class="goal-summary-item">実績売上 <strong>${formatYen(actualYear)}</strong></span>
      <span class="goal-summary-item">達成率 <strong>${formatPct(ach, 1)}</strong></span>
      <span class="goal-summary-item">差異（目標−実績） <strong class="${diff > 0 ? 'metric--alert' : ''}">${formatYen(diff)}</strong></span>
    `;
  }

  const h1Pct = achievementPct(h1a, h1t);
  const h2Pct = achievementPct(h2a, h2t);

  const setTxt = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

  setTxt('progH1Label', `上期目標 ${formatYen(h1t)}`);
  setTxt('progH1Val', `${formatPct(h1Pct, 1)}（${formatYen(h1a)}）`);
  setTxt('progH2Label', `下期目標 ${formatYen(h2t)}`);
  setTxt('progH2Val', `${formatPct(h2Pct, 1)}（${formatYen(h2a)}）`);

  const fill1 = document.getElementById('progH1Fill');
  const fill2 = document.getElementById('progH2Fill');
  if (fill1) {
    fill1.style.width = `${Math.min(100, h1Pct)}%`;
    fill1.classList.toggle('goal-bar__fill--warn', h1Pct < 100);
  }
  if (fill2) {
    fill2.style.width = `${Math.min(100, h2Pct)}%`;
    fill2.classList.toggle('goal-bar__fill--warn', h2Pct < 100);
  }
}

function genSeriesRow(rowSpec) {
  const months = Array.from({ length: 12 }, (_, i) => {
    const wave = 0.75 + 0.08 * Math.sin(i / 2) + (rowSpec.base % 200) / 800;
    const sales = Math.round(rowSpec.base * 100_000 * wave);
    const margin = 0.26 + (i % 4) * 0.01;
    const profit = Math.round(sales * margin);
    return { sales, profit };
  });

  let h1s = 0;
  let h1p = 0;
  FIRST_HALF_IDX.forEach(i => {
    h1s += months[i].sales;
    h1p += months[i].profit;
  });
  let h2s = 0;
  let h2p = 0;
  SECOND_HALF_IDX.forEach(i => {
    h2s += months[i].sales;
    h2p += months[i].profit;
  });
  const ys = h1s + h2s;
  const yp = h1p + h2p;

  return { name: rowSpec.name, months, h1: { sales: h1s, profit: h1p }, h2: { sales: h2s, profit: h2p }, year: { sales: ys, profit: yp } };
}

function renderMatrixTable(tbodyId, rowsSpec) {
  const body = document.getElementById(tbodyId);
  if (!body) return;

  const rows = rowsSpec.map(genSeriesRow);
  body.innerHTML = rows
    .map(row => {
      const monthCells = row.months.map(m => matrixCellHtml(m.sales, m.profit));
      const c1 = matrixCellHtml(row.h1.sales, row.h1.profit, 'matrix-total');
      const c2 = matrixCellHtml(row.h2.sales, row.h2.profit, 'matrix-total');
      const cy = matrixCellHtml(row.year.sales, row.year.profit, 'matrix-year');
      const cells =
        FIRST_HALF_IDX.map(i => monthCells[i]).join('') +
        c1 +
        SECOND_HALF_IDX.map(i => monthCells[i]).join('') +
        c2 +
        cy;
      return `<tr><th>${row.name}</th>${cells}</tr>`;
    })
    .join('');
}

function matrixCellHtml(sales, profit, extraClass = '') {
  return `<td class="${extraClass}"><div class="matrix-cell-stack">
    <span class="lbl">売上</span><span>${formatYen(sales)}</span>
    <span class="lbl">粗利</span><span>${formatYen(profit)}</span>
  </div></td>`;
}

function renderSegmentMatrices() {
  renderMatrixTable('matrixCategoryBody', CATEGORY_ROWS);
  renderMatrixTable('matrixClientBody', CLIENT_ROWS);
}

function highlightMatrixMonth(monthIdx) {
  document.querySelectorAll('.js-mcol').forEach(el => {
    el.classList.remove('dash-highlight-col', 'dash-muted-col');
    if (monthIdx === null) return;
    const idx = parseInt(el.dataset.monthIdx ?? '-1', 10);
    if (idx === monthIdx) el.classList.add('dash-highlight-col');
    else el.classList.add('dash-muted-col');
  });
}

function renderPurchaseSection() {
  const body = document.getElementById('purchaseMatrixBody');
  if (!body) return;

  body.innerHTML = Array.from({ length: 12 }, (_, ri) => {
    const cells = Array.from({ length: 12 }, (_, ci) => {
      const v = purchaseMatrixCache[ri][ci];
      return `<td class="num">${formatYen(v)}</td>`;
    }).join('');
    const rowLab = window.TocFiscal
      ? `${TocFiscal.fiscalMonthIndexToCalendarMonth(ri + 1)}月（仕入請求・会計月）`
      : `${ri + 1}月（仕入請求・会計月）`;
    return `<tr><th>${rowLab}</th>${cells}</tr>`;
  }).join('');
}

function renderWipTable() {
  const body = document.getElementById('wipMatrixBody');
  if (!body) return;
  body.innerHTML = Array.from({ length: 12 }, (_, i) => {
    const v = WIP_BY_ROW[i];
    const alert = v >= 95_000_000 ? ' metric--alert' : '';
    const rowLab = window.TocFiscal
      ? `${TocFiscal.fiscalMonthIndexToCalendarMonth(i + 1)}月（仕入請求）`
      : `${i + 1}月（仕入請求）`;
    return `<tr><th>${rowLab}</th><td class="num${alert}">${formatYen(v)}</td></tr>`;
  }).join('');
}

function setSegmentTab(which) {
  const catBtn = document.getElementById('segmentTabCategory');
  const cliBtn = document.getElementById('segmentTabClient');
  const catPanel = document.getElementById('segmentPanelCategory');
  const cliPanel = document.getElementById('segmentPanelClient');

  const isCat = which === 'category';
  catBtn?.classList.toggle('is-active', isCat);
  cliBtn?.classList.toggle('is-active', !isCat);
  catBtn?.setAttribute('aria-selected', isCat ? 'true' : 'false');
  cliBtn?.setAttribute('aria-selected', !isCat ? 'true' : 'false');
  if (catPanel) catPanel.hidden = !isCat;
  if (cliPanel) cliPanel.hidden = isCat;
}
