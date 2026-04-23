/**
 * TOC-BASE — ブラウザ永続化（localStorage）
 */
(function (global) {
  const STORAGE_KEY = 'toc-base-app-v1';

  function parseMoney(str) {
    const t = String(str ?? '')
      .replace(/[¥,\s]/g, '')
      .replace(/[−–—]/g, '-');
    if (t === '' || t === '-') return NaN;
    const n = parseFloat(t);
    return Number.isNaN(n) ? NaN : n;
  }

  function newCaseId() {
    if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.randomUUID) {
      return globalThis.crypto.randomUUID();
    }
    return 'cid-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
  }

  function emptyCaseTemplate() {
    return {
      estimateNo: '',
      client: '',
      building: '',
      kubun: 'システム',
      salesStaff: '',
      designStaff: '',
      forecastSales: 0,
      forecastCost: 0,
      actualCost: 0,
      jorei: '◯',
      billMonth: '',
      startDate: '',
      contentMemo: '',
      contentBadge: 'blue',
      status: '見積提出済',
      hatchu: '未提出',
      invoiceDone: '未',
      invoiceDate: '—',
      category: '全体',
      actualSales: null,
      payDate: '—',
      paidDone: '未',
      salesTaxIncluded: 0,
    };
  }

  function defaultCases() {
    return [
      {
        caseId: 'case-4056',
        estimateNo: '4056',
        client: '株式会社アクシスデザイン',
        building: 'TOC渋谷ビル 5F',
        kubun: '工事',
        salesStaff: '田中 健二、佐藤 裕子',
        designStaff: '山田 麻衣',
        forecastSales: 4800000,
        forecastCost: 3120000,
        actualCost: 3050000,
        jorei: '△',
        billMonth: '2026-06',
        startDate: '2026-05-10',
        contentMemo: '仕様確定中',
        contentBadge: 'blue',
        status: '見積提出済',
        hatchu: '未提出',
        invoiceDone: '未',
        invoiceDate: '—',
        category: 'コラボ',
        actualSales: 4800000,
        payDate: '—',
        paidDone: '未',
        salesTaxIncluded: 5280000,
      },
      {
        caseId: 'case-3997',
        estimateNo: '3997',
        client: '有限会社ブライトホーム',
        building: 'ブライトホーム本店（世田谷店）',
        kubun: 'ネット',
        salesStaff: '佐藤 裕子',
        designStaff: '木村 拓也',
        forecastSales: 12500000,
        forecastCost: 8750000,
        actualCost: 8620000,
        jorei: '◯',
        billMonth: '2026-07',
        startDate: '2026-06-01',
        contentMemo: '施工図承認済',
        contentBadge: 'green',
        status: '受注',
        hatchu: '提出済',
        invoiceDone: '未',
        invoiceDate: '—',
        category: '全体',
        actualSales: 12500000,
        payDate: '—',
        paidDone: '未',
        salesTaxIncluded: 13750000,
      },
      {
        caseId: 'case-3889',
        estimateNo: '3889',
        client: '東京リアルティ株式会社',
        building: '湾岸タワーレジデンス（共用部）',
        kubun: '媒体',
        salesStaff: '田中 健二',
        designStaff: '鈴木 奈緒',
        forecastSales: 7200000,
        forecastCost: 4680000,
        actualCost: 4750000,
        jorei: '△',
        billMonth: '2026-03',
        startDate: '2026-02-15',
        contentMemo: '完成検査済',
        contentBadge: 'green',
        status: '施工完了',
        hatchu: '印刷済',
        invoiceDone: '済',
        invoiceDate: '2026-03-31',
        category: 'Joshin',
        actualSales: 7200000,
        payDate: '2026-04-15',
        paidDone: '済',
        salesTaxIncluded: 7920000,
      },
      {
        caseId: 'case-4012',
        estimateNo: '4012',
        client: '合同会社グリーンスペース',
        building: 'ルミネ新宿北口 別館B1',
        kubun: '申請',
        salesStaff: '渡辺 誠',
        designStaff: '山田 麻衣',
        forecastSales: 3200000,
        forecastCost: 2240000,
        actualCost: 0,
        jorei: '×',
        billMonth: '2026-08',
        startDate: '2026-07-20',
        contentMemo: 'コンセプト提案中',
        contentBadge: 'yellow',
        status: '見積提出済',
        hatchu: '未提出',
        invoiceDone: '未',
        invoiceDate: '—',
        category: '媒体',
        actualSales: null,
        payDate: '—',
        paidDone: '未',
        salesTaxIncluded: 3520000,
      },
      {
        caseId: 'case-3944',
        estimateNo: '3944',
        client: '株式会社フジワラ建設',
        building: '有明物流センター C棟',
        kubun: 'システム',
        salesStaff: '佐藤 裕子',
        designStaff: '木村 拓也',
        forecastSales: 2100000,
        forecastCost: 1470000,
        actualCost: 1530000,
        jorei: '△',
        billMonth: '2026-01',
        startDate: '2025-12-10',
        contentMemo: '追加変更協議中',
        contentBadge: 'red',
        status: '施行中',
        hatchu: '提出済',
        invoiceDone: '未',
        invoiceDate: '—',
        category: 'その他材料',
        actualSales: 2100000,
        payDate: '—',
        paidDone: '未',
        salesTaxIncluded: 2310000,
      },
    ];
  }

  function defaultPurchases() {
    return {
      'case-4056': [
        {
          id: 'p1',
          vendorName: '株式会社ネクストサプライ',
          invoiceDate: '2026-04-10',
          amountEx: 1850000,
          amountInc: 2035000,
        },
        {
          id: 'p2',
          vendorName: '東都電材商事株式会社',
          invoiceDate: '2026-04-12',
          amountEx: 1200000,
          amountInc: 1320000,
        },
      ],
      'case-3997': [
        {
          id: 'p3',
          vendorName: '合同会社クリエイトワークス',
          invoiceDate: '2026-05-01',
          amountEx: 8620000,
          amountInc: 9482000,
        },
      ],
    };
  }

  function defaultGoals() {
    return {
      fiscalYear: '13期（2025年9月〜2026年8月）',
      targetH1: 210000000,
      targetH2: 240000000,
      note: '',
    };
  }

  function defaultClients() {
    return [
      { code: 'C-10001', name: '株式会社アクシスデザイン', kana: 'カブシキガイシャアクシスデザイン', type: '法人', salesLead: '田中 健二', phone: '03-1234-5001', status: '取引中', updated: '2026-04-18' },
      { code: 'C-10002', name: '有限会社ブライトホーム', kana: 'ユウゲンガイシャブライトホーム', type: '法人', salesLead: '佐藤 裕子', phone: '03-9876-2100', status: '取引中', updated: '2026-04-12' },
      { code: 'C-10003', name: '東京リアルティ株式会社', kana: 'トウキョウリアルティカブシキガイシャ', type: '法人', salesLead: '田中 健二', phone: '03-5555-8800', status: '取引中', updated: '2026-03-28' },
      { code: 'C-10004', name: '合同会社グリーンスペース', kana: 'ゴウドウガイシャグリーンスペース', type: '法人', salesLead: '渡辺 誠', phone: '03-2222-3300', status: '取引中', updated: '2026-04-02' },
      { code: 'C-10005', name: '株式会社フジワラ建設', kana: 'カブシキガイシャフジワラケンセツ', type: '法人', salesLead: '佐藤 裕子', phone: '03-4444-1200', status: '要注意', updated: '2026-04-20' },
      { code: 'C-20001', name: '山田 工務店（個人）', kana: 'ヤマダコウムテン', type: '個人', salesLead: '高橋 美咲', phone: '090-8888-4411', status: '休止', updated: '2025-11-10' },
    ];
  }

  function defaultStaff() {
    return [
      { code: 'E-001', name: '田中 健二', email: 'tanaka@toc.example.jp', salesOk: true, designOk: false, status: '在籍' },
      { code: 'E-002', name: '佐藤 裕子', email: 'sato@toc.example.jp', salesOk: true, designOk: false, status: '在籍' },
      { code: 'E-003', name: '渡辺 誠', email: 'watanabe@toc.example.jp', salesOk: true, designOk: false, status: '在籍' },
      { code: 'E-004', name: '高橋 美咲', email: 'takahashi@toc.example.jp', salesOk: true, designOk: false, status: '在籍' },
      { code: 'E-101', name: '山田 麻衣', email: 'yamada@toc.example.jp', salesOk: false, designOk: true, status: '在籍' },
      { code: 'E-102', name: '木村 拓也', email: 'kimura@toc.example.jp', salesOk: false, designOk: true, status: '在籍' },
      { code: 'E-103', name: '鈴木 奈緒', email: 'suzuki@toc.example.jp', salesOk: false, designOk: true, status: '在籍' },
      { code: 'E-201', name: '谷口 太郎', email: 'taniguchi@toc.example.jp', salesOk: false, designOk: false, status: '在籍' },
    ];
  }

  function defaultCategories() {
    return [
      { sort: 10, code: 'CAT-01', name: '全体', desc: '横断・複合案件向け', status: '有効', color: '#64748b', count: 4 },
      { sort: 20, code: 'CAT-02', name: 'Joshin', desc: 'Joshin系ライン', status: '有効', color: '#2563eb', count: 12 },
      { sort: 30, code: 'CAT-03', name: 'コラボ', desc: 'コラボレーション案件', status: '有効', color: '#7c3aed', count: 8 },
      { sort: 40, code: 'CAT-04', name: '媒体', desc: '広告・媒体買付', status: '有効', color: '#db2777', count: 15 },
      { sort: 50, code: 'CAT-05', name: 'ネット', desc: 'Web・デジタル関連', status: '有効', color: '#0891b2', count: 21 },
      { sort: 60, code: 'CAT-06', name: 'その他材料', desc: '資材・雑材料', status: '有効', color: '#ca8a04', count: 6 },
      { sort: 70, code: 'CAT-07', name: '立替', desc: '立替金・精算', status: '無効', color: '#94a3b8', count: 3 },
    ];
  }

  function defaultVendors() {
    return [
      { code: 'V-20001', name: '株式会社ネクストサプライ', kana: 'カブシキガイシャネクストサプライ', type: '法人', phone: '03-6000-1100', status: '取引中', updated: '2026-04-18' },
      { code: 'V-20002', name: '東都電材商事株式会社', kana: 'トウトデンザイショウジカブシキガイシャ', type: '法人', phone: '03-7000-2200', status: '取引中', updated: '2026-04-12' },
      { code: 'V-20003', name: '合同会社クリエイトワークス', kana: 'ゴウドウガイシャクリエイトワークス', type: '法人', phone: '042-333-9000', status: '取引中', updated: '2026-03-28' },
      { code: 'V-20004', name: '大阪ロジスティクス株式会社', kana: 'オオサカロジスティクスカブシキガイシャ', type: '法人', phone: '06-8000-4400', status: '取引中', updated: '2026-04-02' },
      { code: 'V-30001', name: '鈴木設備（個人）', kana: 'スズキセツビ', type: '個人', phone: '090-2000-5511', status: '休止', updated: '2025-11-10' },
    ];
  }

  function defaultState() {
    return {
      version: 1,
      caseSchemaVersion: 2,
      cases: defaultCases(),
      purchases: defaultPurchases(),
      goals: defaultGoals(),
      clients: defaultClients(),
      staff: defaultStaff(),
      categories: defaultCategories(),
      vendors: defaultVendors(),
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function save(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function migrateToCaseIds(state) {
    if (!state || !Array.isArray(state.cases)) return;
    const ver = state.caseSchemaVersion || 0;
    if (ver >= 2) return;

    state.cases.forEach((c, i) => {
      if (!c.caseId) {
        const est = (c.estimateNo && String(c.estimateNo).trim()) || '';
        c.caseId = est ? 'mig-' + est : 'mig-empty-' + i + '-' + Date.now();
      }
    });

    const oldPur = state.purchases || {};
    const newPur = {};
    Object.keys(oldPur).forEach(k => {
      const byEst = state.cases.find(cc => (cc.estimateNo || '') === k);
      if (byEst) {
        newPur[byEst.caseId] = oldPur[k];
        return;
      }
      const byId = state.cases.find(cc => cc.caseId === k);
      if (byId) {
        newPur[byId.caseId] = oldPur[k];
      }
    });
    state.purchases = newPur;
    state.caseSchemaVersion = 2;
    save(state);
  }

  function ensureInit() {
    let state = load();
    if (!state || !Array.isArray(state.cases)) {
      state = defaultState();
      save(state);
    } else {
      if (!state.purchases) state.purchases = {};
      if (!state.goals) state.goals = defaultGoals();
      if (!state.clients) state.clients = defaultClients();
      if (!state.staff) state.staff = defaultStaff();
      if (!state.categories) state.categories = defaultCategories();
      if (!state.vendors) state.vendors = defaultVendors();
      save(state);
    }
    migrateToCaseIds(state);
    migratePurchaseInvoiceDate(state);
    migrateStripDept(state);
    migrateStripTransferPeriod(state);
    migrateGoalsFiscalYearLabel(state);
    migrateStripStaffTitle(state);
    return state;
  }

  function migrateStripStaffTitle(state) {
    if (!state || !Array.isArray(state.staff)) return;
    let changed = false;
    state.staff.forEach(s => {
      if (s && Object.prototype.hasOwnProperty.call(s, 'title')) {
        delete s.title;
        changed = true;
      }
    });
    if (changed) save(state);
  }

  /** 旧「FY…（…/…〜…/…）」表記を「◯期（…年…月〜…年…月）」へ */
  function migrateGoalsFiscalYearLabel(state) {
    if (!state || !state.goals) return;
    const fy = state.goals.fiscalYear;
    if (typeof fy !== 'string') return;
    const legacy = {
      'FY2025（2025/9〜2026/8）': '13期（2025年9月〜2026年8月）',
      'FY2024（2024/9〜2025/8）': '12期（2024年9月〜2025年8月）',
    };
    const next = legacy[fy];
    if (next && next !== fy) {
      state.goals.fiscalYear = next;
      save(state);
    }
  }

  function migrateStripTransferPeriod(state) {
    if (!state || !Array.isArray(state.cases)) return;
    let changed = false;
    state.cases.forEach(c => {
      if (c && Object.prototype.hasOwnProperty.call(c, 'transferPeriod')) {
        delete c.transferPeriod;
        changed = true;
      }
    });
    if (changed) save(state);
  }

  function migrateStripDept(state) {
    if (!state) return;
    let changed = false;
    if (state.goals && Object.prototype.hasOwnProperty.call(state.goals, 'dept')) {
      delete state.goals.dept;
      changed = true;
    }
    if (Array.isArray(state.staff)) {
      state.staff.forEach(s => {
        if (s && Object.prototype.hasOwnProperty.call(s, 'dept')) {
          delete s.dept;
          changed = true;
        }
      });
    }
    if (changed) save(state);
  }

  function migratePurchaseInvoiceDate(state) {
    if (!state || !state.purchases) return;
    let changed = false;
    Object.keys(state.purchases).forEach(cid => {
      const arr = state.purchases[cid];
      if (!Array.isArray(arr)) return;
      arr.forEach(line => {
        if (line.invoiceDate === undefined || line.invoiceDate === null) {
          line.invoiceDate = '';
          changed = true;
        }
      });
    });
    if (changed) save(state);
  }

  function getState() {
    return ensureInit();
  }

  function setCases(cases) {
    const state = getState();
    state.cases = cases;
    save(state);
  }

  function upsertCase(c) {
    const state = getState();
    let i = -1;
    if (c.caseId) i = state.cases.findIndex(x => x.caseId === c.caseId);
    const est = (c.estimateNo && String(c.estimateNo).trim()) || '';
    if (i < 0 && est) {
      i = state.cases.findIndex(x => (x.estimateNo && String(x.estimateNo).trim()) === est);
    }
    if (i >= 0) {
      const prev = state.cases[i];
      const merged = { ...prev, ...c, caseId: prev.caseId };
      delete merged.transferPeriod;
      state.cases[i] = merged;
    } else {
      const caseId = c.caseId || newCaseId();
      const merged = { ...emptyCaseTemplate(), ...c, caseId };
      delete merged.transferPeriod;
      state.cases.push(merged);
    }
    save(state);
  }

  function renameEstimateNo(caseId, newEstimateNo) {
    const state = getState();
    const newNo = (newEstimateNo || '').trim();
    const c = state.cases.find(x => x.caseId === caseId);
    if (!c) return false;
    const oldNo = (c.estimateNo || '').trim();
    if (newNo === oldNo) return true;
    if (newNo && state.cases.some(x => x.caseId !== caseId && (x.estimateNo || '').trim() === newNo)) {
      return false;
    }
    c.estimateNo = newNo;
    save(state);
    return true;
  }

  function deleteCase(caseId) {
    const state = getState();
    state.cases = state.cases.filter(x => x.caseId !== caseId);
    delete state.purchases[caseId];
    save(state);
  }

  /** estimateNo または caseId のどちらでも検索 */
  function getCase(idOrEstimateNo) {
    const state = getState();
    let c = state.cases.find(x => x.caseId === idOrEstimateNo);
    if (c) return c;
    return state.cases.find(x => (x.estimateNo || '').trim() === (idOrEstimateNo || '').trim()) || null;
  }

  function nextEstimateNo() {
    const state = getState();
    let max = 4000;
    state.cases.forEach(c => {
      const n = parseInt(c.estimateNo, 10);
      if (!Number.isNaN(n) && n > max) max = n;
    });
    return String(max + 1);
  }

  function sumPurchaseEx(caseId) {
    const lines = getPurchases(caseId);
    return lines.reduce((s, l) => s + (Number(l.amountEx) || 0), 0);
  }

  function getPurchases(caseId) {
    const state = getState();
    return state.purchases[caseId] || [];
  }

  function setPurchases(caseId, lines) {
    const state = getState();
    state.purchases[caseId] = lines;
    const sum = lines.reduce((s, l) => s + (Number(l.amountEx) || 0), 0);
    const c = state.cases.find(x => x.caseId === caseId);
    if (c) {
      c.actualCost = sum;
    }
    save(state);
  }

  /** 複数案件の仕入をまとめて置換し、各案件の実際原価を再計算 */
  function replacePurchasesForCases(caseIdToLines) {
    const state = getState();
    Object.entries(caseIdToLines).forEach(([caseId, lines]) => {
      state.purchases[caseId] = Array.isArray(lines) ? lines : [];
      const sum = state.purchases[caseId].reduce((s, l) => s + (Number(l.amountEx) || 0), 0);
      const c = state.cases.find(x => x.caseId === caseId);
      if (c) c.actualCost = sum;
    });
    save(state);
  }

  function setGoals(g) {
    const state = getState();
    const next = { ...state.goals, ...g };
    delete next.dept;
    state.goals = next;
    save(state);
  }

  function getGoals() {
    return getState().goals;
  }

  function importFullJson(jsonStr) {
    const data = JSON.parse(jsonStr);
    if (!data || !Array.isArray(data.cases)) throw new Error('invalid');
    const state = {
      version: 1,
      caseSchemaVersion: data.caseSchemaVersion || 0,
      cases: data.cases,
      purchases: data.purchases || {},
      goals: data.goals || defaultGoals(),
      clients: data.clients || defaultClients(),
      staff: data.staff || defaultStaff(),
      categories: data.categories || defaultCategories(),
      vendors: data.vendors || defaultVendors(),
    };
    save(state);
    migrateToCaseIds(load());
  }

  function exportFullJson() {
    return JSON.stringify(getState(), null, 2);
  }

  function resetAll() {
    const fresh = defaultState();
    save(fresh);
    return fresh;
  }

  function upsertClient(row) {
    const state = getState();
    const i = state.clients.findIndex(x => x.code === row.code);
    if (i >= 0) state.clients[i] = { ...state.clients[i], ...row, updated: row.updated || new Date().toISOString().slice(0, 10) };
    else state.clients.push({ ...row, updated: row.updated || new Date().toISOString().slice(0, 10) });
    save(state);
  }

  function deleteClient(code) {
    const state = getState();
    state.clients = state.clients.filter(x => x.code !== code);
    save(state);
  }

  function nextClientCode() {
    const state = getState();
    let max = 0;
    state.clients.forEach(c => {
      const m = String(c.code || '').match(/C-(\d+)/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    return 'C-' + String(max + 1).padStart(5, '0');
  }

  function upsertStaff(row) {
    const state = getState();
    const merged = { ...row };
    delete merged.dept;
    delete merged.title;
    const i = state.staff.findIndex(x => x.code === merged.code);
    if (i >= 0) {
      state.staff[i] = { ...state.staff[i], ...merged };
      delete state.staff[i].dept;
      delete state.staff[i].title;
    } else {
      state.staff.push(merged);
    }
    save(state);
  }

  function deleteStaff(code) {
    const state = getState();
    state.staff = state.staff.filter(x => x.code !== code);
    save(state);
  }

  function nextStaffCode() {
    const state = getState();
    let max = 0;
    state.staff.forEach(s => {
      const m = String(s.code || '').match(/E-(\d+)/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    return 'E-' + String(max + 1).padStart(3, '0');
  }

  function upsertCategory(row) {
    const state = getState();
    const i = state.categories.findIndex(x => x.code === row.code);
    if (i >= 0) state.categories[i] = { ...state.categories[i], ...row };
    else state.categories.push(row);
    save(state);
  }

  function deleteCategory(code) {
    const state = getState();
    state.categories = state.categories.filter(x => x.code !== code);
    save(state);
  }

  function nextCategoryCode() {
    const state = getState();
    let max = 0;
    state.categories.forEach(c => {
      const m = String(c.code || '').match(/CAT-(\d+)/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    return 'CAT-' + String(max + 1).padStart(2, '0');
  }

  function upsertVendor(row) {
    const state = getState();
    const i = state.vendors.findIndex(x => x.code === row.code);
    if (i >= 0) state.vendors[i] = { ...state.vendors[i], ...row, updated: row.updated || new Date().toISOString().slice(0, 10) };
    else state.vendors.push({ ...row, updated: row.updated || new Date().toISOString().slice(0, 10) });
    save(state);
  }

  function deleteVendor(code) {
    const state = getState();
    state.vendors = state.vendors.filter(x => x.code !== code);
    save(state);
  }

  function nextVendorCode() {
    const state = getState();
    let max = 0;
    state.vendors.forEach(v => {
      const m = String(v.code || '').match(/V-(\d+)/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    return 'V-' + String(max + 1).padStart(5, '0');
  }

  global.TocDataStore = {
    STORAGE_KEY,
    parseMoney,
    ensureInit,
    getState,
    setCases,
    upsertCase,
    renameEstimateNo,
    deleteCase,
    getCase,
    newCaseId,
    nextEstimateNo,
    getPurchases,
    setPurchases,
    replacePurchasesForCases,
    sumPurchaseEx,
    setGoals,
    getGoals,
    importFullJson,
    exportFullJson,
    resetAll,
    defaultState,
    upsertClient,
    deleteClient,
    nextClientCode,
    upsertStaff,
    deleteStaff,
    nextStaffCode,
    upsertCategory,
    deleteCategory,
    nextCategoryCode,
    upsertVendor,
    deleteVendor,
    nextVendorCode,
  };
})(typeof window !== 'undefined' ? window : globalThis);
