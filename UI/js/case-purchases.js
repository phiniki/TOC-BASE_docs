/**
 * 仕入管理 — 案件単位 / 請求書単位 / 個別追加（画面は case-purchases.html）
 */
(function () {
  const MODE_STORAGE_KEY = 'toc-purchase-reg-mode';
  const PURCHASE_TAX_RATE = 0.1;

  function parseMoneyInput(str) {
    return parseInt(String(str ?? '').replace(/[^\d]/g, ''), 10) || 0;
  }

  function formatMoneyInput(n) {
    return Math.round(Number(n) || 0).toLocaleString('ja-JP');
  }

  function normalizeTaxType(v) {
    return v === 'nonTaxable' ? 'nonTaxable' : 'taxable';
  }

  function calcAmountInc(amountEx, taxType) {
    const ex = Math.max(0, Math.round(Number(amountEx) || 0));
    if (normalizeTaxType(taxType) === 'nonTaxable') return ex;
    return Math.round(ex * (1 + PURCHASE_TAX_RATE));
  }

  function taxTypeOptionsHtml(selectedTaxType) {
    const t = normalizeTaxType(selectedTaxType);
    return (
      `<option value="taxable"${t === 'taxable' ? ' selected' : ''}>課税</option>` +
      `<option value="nonTaxable"${t === 'nonTaxable' ? ' selected' : ''}>非課税</option>`
    );
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function newPurchaseId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
  }

  function vendorOptions() {
    if (!window.TocDataStore) return [];
    return TocDataStore.getState().vendors.map(v => v.name);
  }


  /** 請求日: type=date 用（—・空・不正値は ''）／キー突合もこれで統一 */
  function normInvoiceDateStr(raw) {
    const s = String(raw ?? '').trim();
    if (s === '' || s === '—' || s === '-' || s === 'ー') return '';
    const head = s.slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(head) ? head : '';
  }

  function normInvKey(vendorName, invoiceDate) {
    return (vendorName || '').trim() + '\t' + normInvoiceDateStr(invoiceDate);
  }

  /**
   * 仕入先プルダウン用の名前集合
   * - case: マスタ＋「案件に紐づく」明細のみ（未紐づけバケット除外）
   * - invoice: マスタ＋案件紐づけかつ請求書キー（仕入先・請求日）そろった明細のみ
   * - bulk: マスタ＋全明細
   */
  function buildVendorNameSet(scope) {
    if (!window.TocDataStore) return vendorOptions().slice().sort((a, b) => a.localeCompare(b, 'ja'));
    const UID = TocDataStore.UNLINKED_PURCHASE_CASE_ID;
    const state = TocDataStore.getState();
    const set = new Set(vendorOptions());
    const excludeCaseUnlinked = scope === 'case' || scope === 'invoice';
    const requireInvoiceKey = scope === 'invoice';
    Object.entries(state.purchases).forEach(([caseId, lines]) => {
      if (!Array.isArray(lines)) return;
      if (excludeCaseUnlinked && caseId === UID) return;
      lines.forEach(l => {
        if (requireInvoiceKey) {
          if (!(l.vendorName || '').trim() || !normInvoiceDateStr(l.invoiceDate)) return;
        }
        const n = (l.vendorName || '').trim();
        if (n) set.add(n);
      });
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ja'));
  }

  /** @param {'case'|'invoice'|'bulk'} scope */
  function vendorOptionsHtml(selectedName, scope) {
    const sc = scope || 'bulk';
    const sel = (selectedName || '').trim();
    let list = buildVendorNameSet(sc);
    if (sel && !list.some(v => v === sel)) list = [...list, sel];
    list.sort((a, b) => a.localeCompare(b, 'ja'));
    const head = '<option value="">選択してください</option>';
    const body = list
      .map(v => `<option value="${escapeHtml(v)}"${v === sel ? ' selected' : ''}>${escapeHtml(v)}</option>`)
      .join('');
    return head + body;
  }

  function fillVendorSelect(selectEl, current, scope) {
    if (!selectEl) return;
    selectEl.innerHTML = vendorOptionsHtml(current, scope || 'bulk');
  }

  /** 個別追加の並び：addedAt（ms）または id が p_<epoch>_ 形式のとき */
  function purchaseLineAddedAtMs(line) {
    const n = Number(line?.addedAt);
    if (Number.isFinite(n) && n > 0) return n;
    const m = String(line?.id || '').match(/^p_(\d+)_/);
    if (m) {
      const t = parseInt(m[1], 10);
      if (Number.isFinite(t) && t > 0) return t;
    }
    return 0;
  }

  /** 登録済み仕入から、仕入先が一致する行の請求日（案件に紐づく明細のみ・正規化済み・新しい順） */
  function invoiceDatesForVendor(vendorTrim) {
    if (!window.TocDataStore) return [];
    const UID = TocDataStore.UNLINKED_PURCHASE_CASE_ID;
    const v = (vendorTrim || '').trim();
    if (!v) return [];
    const set = new Set();
    Object.entries(TocDataStore.getState().purchases).forEach(([caseId, lines]) => {
      if (caseId === UID || !Array.isArray(lines)) return;
      lines.forEach(l => {
        if ((l.vendorName || '').trim() !== v) return;
        const d = normInvoiceDateStr(l.invoiceDate);
        if (d) set.add(d);
      });
    });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }

  /** 個別追加：未紐づけ案件を含む案件プルダウン */
  function caseOptionsHtmlBulk(selectedCaseId) {
    const UID = TocDataStore.UNLINKED_PURCHASE_CASE_ID;
    const noneSel = !selectedCaseId ? ' selected' : '';
    const head = `<option value=""${noneSel}>選択してください</option>`;
    const unSel = selectedCaseId === UID ? ' selected' : '';
    const unOpt = `<option value="${escapeHtml(UID)}"${unSel}>（案件なし）</option>`;
    const cases = TocDataStore.getState().cases;
    const rest = cases
      .map(c => {
        const sel = c.caseId === selectedCaseId ? ' selected' : '';
        const lab =
          (c.estimateNo || '（未採番）') +
          ' / ' +
          (c.client || '—') +
          ' / ' +
          (c.building || '—');
        return `<option value="${escapeHtml(c.caseId)}"${sel}>${escapeHtml(lab)}</option>`;
      })
      .join('');
    return head + unOpt + rest;
  }

  function caseBaseOptionsHtml(selectedCaseId) {
    const sel = (selectedCaseId || '').trim();
    const cases = TocDataStore.getState().cases;
    return (
      '<option value="">選択してください</option>' +
      cases
        .map(c => {
          const on = c.caseId === sel ? ' selected' : '';
          const lab =
            (c.estimateNo || '（未採番）') +
            ' / ' +
            (c.client || '—') +
            ' / ' +
            (c.building || '—');
          return `<option value="${escapeHtml(c.caseId)}"${on}>${escapeHtml(lab)}</option>`;
        })
        .join('')
    );
  }

  /** 請求書明細行：実案件のみ（未紐づけバケットは出さない） */
  function caseOptionsHtmlInvoiceDetail(selectedCaseId) {
    const cases = TocDataStore.getState().cases;
    const noneSel = !selectedCaseId ? ' selected' : '';
    const head = `<option value=""${noneSel}>選択してください</option>`;
    if (!cases.length) {
      return head;
    }
    const body = cases
      .map(c => {
        const sel = c.caseId === selectedCaseId ? ' selected' : '';
        const lab =
          (c.estimateNo || '（未採番）') +
          ' / ' +
          (c.client || '—') +
          ' / ' +
          (c.building || '—');
        return `<option value="${escapeHtml(c.caseId)}"${sel}>${escapeHtml(lab)}</option>`;
      })
      .join('');
    return head + body;
  }

  function purchaseHasInvoiceKey(line) {
    return !!(line && (line.vendorName || '').trim() && normInvoiceDateStr(line.invoiceDate));
  }

  function bulkRowMatchesViewFilter(caseId, line, filterKey, searchRaw) {
    const UID = TocDataStore.UNLINKED_PURCHASE_CASE_ID;
    const caseUnlinked = caseId === UID;
    const hasKey = purchaseHasInvoiceKey(line);
    if (filterKey === 'linkedBoth' && (caseUnlinked || !hasKey)) return false;
    if (filterKey === 'caseUnlinked' && !caseUnlinked) return false;
    if (filterKey === 'invoiceOrphan' && hasKey) return false;
    const q = (searchRaw || '').trim().toLowerCase();
    if (q) {
      const est = String(line.estimateNo || '').toLowerCase();
      const vn = String(line.vendorName || '').toLowerCase();
      const idt = String(line.invoiceDate || '').toLowerCase();
      if (!est.includes(q) && !vn.includes(q) && !idt.includes(q)) return false;
    }
    return true;
  }

  function renumber(tbody) {
    tbody.querySelectorAll('tr').forEach((tr, i) => {
      const c = tr.querySelector('td.num');
      if (c) c.textContent = String(i + 1);
    });
  }

  function bindDelAndTotals(tbody, onChange) {
    tbody.querySelectorAll('select.js-purchase-vendor').forEach(sel => {
      enhanceSearchableSelect(sel, '仕入先名で検索');
    });
    tbody.querySelectorAll('select.js-bulk-case, select.js-inv-case').forEach(sel => {
      enhanceSearchableSelect(sel, '見積No.・取引先・物件名で検索');
    });

    tbody.querySelectorAll('.js-purchase-del').forEach(btn => {
      btn.addEventListener('click', () => {
        const tr = btn.closest('tr');
        tr?.remove();
        renumber(tbody);
        onChange();
      });
    });
    tbody.querySelectorAll('tr').forEach(tr => {
      const exInput = tr.querySelector('.js-purchase-ex');
      const incInput = tr.querySelector('.js-purchase-inc');
      const taxSelect = tr.querySelector('.js-purchase-tax');
      const recalc = () => {
        if (!exInput || !incInput || !taxSelect) return;
        const ex = parseMoneyInput(exInput.value);
        incInput.value = formatMoneyInput(calcAmountInc(ex, taxSelect.value));
      };
      if (incInput) incInput.readOnly = true;
      recalc();
      exInput?.addEventListener('input', () => {
        recalc();
        onChange();
      });
      exInput?.addEventListener('change', () => {
        recalc();
        onChange();
      });
      taxSelect?.addEventListener('change', () => {
        recalc();
        onChange();
      });
    });
    tbody.querySelectorAll('.js-purchase-vendor, .js-purchase-invdate, .js-inv-case, .js-bulk-case').forEach(el => {
      el.addEventListener('change', onChange);
      el.addEventListener('input', onChange);
    });
  }

  function collectCaseLines(tbody) {
    const out = [];
    tbody.querySelectorAll('tr').forEach(tr => {
      out.push({
        id: tr.dataset.purchaseId || newPurchaseId(),
        vendorName: tr.querySelector('.js-purchase-vendor')?.value || '',
        invoiceDate: tr.querySelector('.js-purchase-invdate')?.value || '',
        taxType: normalizeTaxType(tr.querySelector('.js-purchase-tax')?.value),
        amountEx: parseMoneyInput(tr.querySelector('.js-purchase-ex')?.value),
        amountInc: parseMoneyInput(tr.querySelector('.js-purchase-inc')?.value),
      });
    });
    return out;
  }

  function enhanceSearchableSelect(selectEl, searchPlaceholder) {
    if (!selectEl || selectEl.dataset.searchableEnhanced === '1') return;
    selectEl.dataset.searchableEnhanced = '1';
    selectEl.style.display = 'none';
    const wrap = document.createElement('div');
    wrap.className = 'purchase-combobox';
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'btn btn--ghost btn--sm purchase-combobox__trigger';
    const menu = document.createElement('div');
    menu.className = 'purchase-combobox__menu';
    menu.hidden = true;
    const search = document.createElement('input');
    search.type = 'search';
    search.className = 'toolbar__search-input purchase-combobox__search';
    search.placeholder = searchPlaceholder || '検索';
    search.autocomplete = 'off';
    const list = document.createElement('div');
    list.className = 'purchase-combobox__list';
    menu.appendChild(search);
    menu.appendChild(list);
    wrap.appendChild(trigger);
    wrap.appendChild(menu);
    selectEl.parentNode.insertBefore(wrap, selectEl);
    wrap.appendChild(selectEl);

    const render = () => {
      const q = search.value.trim().toLowerCase();
      const opts = Array.from(selectEl.options);
      const selected = opts.find(o => o.value === selectEl.value);
      trigger.textContent = selected ? selected.textContent : '選択してください';
      list.innerHTML = '';
      opts.forEach(o => {
        if (String(o.value || '') === '') return;
        const txt = String(o.textContent || '');
        if (q && !txt.toLowerCase().includes(q)) return;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'purchase-combobox__opt';
        b.textContent = txt;
        b.addEventListener('click', () => {
          selectEl.value = o.value;
          selectEl.dispatchEvent(new Event('change', { bubbles: true }));
          menu.hidden = true;
          search.value = '';
          render();
        });
        list.appendChild(b);
      });
    };

    const close = () => {
      menu.hidden = true;
      search.value = '';
      render();
    };

    trigger.addEventListener('click', () => {
      menu.hidden = !menu.hidden;
      if (!menu.hidden) {
        search.focus();
        render();
      }
    });
    search.addEventListener('input', render);
    document.addEventListener('click', e => {
      if (!wrap.contains(e.target)) close();
    });
    selectEl.addEventListener('change', render);
    new MutationObserver(render).observe(selectEl, { childList: true, subtree: true, attributes: true });
    render();
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (!window.TocDataStore) return;
    TocDataStore.ensureInit();

    const tabCase = document.getElementById('tabCase');
    const tabInvoice = document.getElementById('tabInvoice');
    const tabBulk = document.getElementById('tabBulk');
    const panelCase = document.getElementById('panelCase');
    const panelInvoice = document.getElementById('panelInvoice');
    const panelBulk = document.getElementById('panelBulk');

    const caseBaseSelect = document.getElementById('caseBaseSelect');
    const hid = document.getElementById('purchaseCaseId');
    const caseBaseEstimate = document.getElementById('caseBaseEstimate');

    const tbodyCase = document.getElementById('purchaseTableBodyCase');
    const btnAddCase = document.getElementById('btnAddCaseRow');
    const totalsCase = document.getElementById('purchaseTotalsCase');

    const invVendor = document.getElementById('invVendor');
    const invDate = document.getElementById('invDate');
    const bulkListFilter = document.getElementById('bulkListFilter');
    const bulkListSearch = document.getElementById('bulkListSearch');
    const btnNewInvoice = document.getElementById('btnNewInvoice');
    const invoiceDetailBody = document.getElementById('invoiceDetailBody');
    const btnAddInvoiceRow = document.getElementById('btnAddInvoiceRow');
    const totalsInvoice = document.getElementById('purchaseTotalsInvoice');
    const newInvoiceDialog = document.getElementById('newInvoiceDialog');
    const newInvoiceVendor = document.getElementById('newInvoiceVendor');
    const newInvoiceDate = document.getElementById('newInvoiceDate');

    /** 請求書ベース: 一覧の選択が外れても、確定した仕入先×請求日を行追加・保存に使う */
    let lastInvoiceKeyContext = null;

    /** @param {string[]=} extraDates データにまだ無い日付を選択肢に含める（新規作成ダイアログ用） */
    function fillInvoiceDateSelect(preferredDate, extraDates) {
      const v = (invVendor?.value || '').trim();
      const pref =
        preferredDate !== undefined
          ? normInvoiceDateStr(preferredDate)
          : normInvoiceDateStr(invDate?.value || '');
      if (!invDate) return;
      const set = new Set(invoiceDatesForVendor(v));
      if (Array.isArray(extraDates)) {
        extraDates.forEach(x => {
          const n = normInvoiceDateStr(x);
          if (n) set.add(n);
        });
      }
      const dates = Array.from(set).sort((a, b) => b.localeCompare(a));
      invDate.innerHTML =
        '<option value="">選択してください</option>' +
        dates.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('');
      if (pref && dates.includes(pref)) invDate.value = pref;
      else invDate.value = '';
    }

    function applyInvoiceToolbarVendorDate(vendor, dateNorm) {
      const v = (vendor || '').trim();
      const d = normInvoiceDateStr(dateNorm || '');
      if (invVendor) fillVendorSelect(invVendor, v, 'invoice');
      fillInvoiceDateSelect(d, d ? [d] : []);
      const selD = normInvoiceDateStr(invDate?.value || '');
      lastInvoiceKeyContext = v || selD ? { vendor: v, date: selD } : null;
    }

    function syncInvoiceDetailFromToolbar() {
      const v = (invVendor?.value || '').trim();
      const d = normInvoiceDateStr(invDate?.value || '');
      if (!v || !d) return;
      lastInvoiceKeyContext = { vendor: v, date: d };
      loadInvoiceDetail(v, d);
    }

    const bulkTableBody = document.getElementById('bulkTableBody');
    const btnAddBulk = document.getElementById('btnAddBulkRow');
    const totalsBulk = document.getElementById('purchaseTotalsBulk');

    const p = new URLSearchParams(location.search);
    let urlCaseId = p.get('id');
    const legacyNo = p.get('no');
    if (!urlCaseId && legacyNo) {
      const hit = TocDataStore.getCase(legacyNo);
      if (hit) urlCaseId = hit.caseId;
    }
    const UID = TocDataStore.UNLINKED_PURCHASE_CASE_ID;
    if (urlCaseId === UID) urlCaseId = '';

    function setMode(mode) {
      try {
        localStorage.setItem(MODE_STORAGE_KEY, mode);
      } catch (_) {}
      [tabCase, tabInvoice, tabBulk].forEach(t => {
        if (!t) return;
        const on = t.dataset.mode === mode;
        t.classList.toggle('is-active', on);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      if (panelCase) panelCase.hidden = mode !== 'case';
      if (panelInvoice) panelInvoice.hidden = mode !== 'invoice';
      if (panelBulk) panelBulk.hidden = mode !== 'bulk';
      if (mode === 'case') {
        loadCaseTable();
        updateCaseTotals();
      }
      if (mode === 'invoice') {
        fillVendorSelect(invVendor, '', 'invoice');
        fillInvoiceDateSelect('');
        clearInvoiceDetail();
        updateInvoiceTotals();
      }
      if (mode === 'bulk') {
        loadBulkTable();
        updateBulkTotals();
      }
    }

    function populateCaseDropdown() {
      if (!caseBaseSelect) return;
      caseBaseSelect.innerHTML = caseBaseOptionsHtml(caseBaseSelect.value);
    }

    function getSelectedCaseId() {
      return (caseBaseSelect?.value || hid?.value || '').trim();
    }

    function refreshCaseHeader() {
      const cid = getSelectedCaseId();
      if (hid) hid.value = cid;
      const cn = document.getElementById('caseClientName');
      const bn = document.getElementById('caseBuildingName');
      if (!cid) {
        if (caseBaseEstimate) caseBaseEstimate.textContent = '—';
        if (cn) cn.textContent = '—';
        if (bn) bn.textContent = '—';
        return;
      }
      const c = TocDataStore.getCase(cid);
      if (caseBaseEstimate) caseBaseEstimate.textContent = c?.estimateNo || '—';
      if (cn) cn.textContent = c?.client || '—';
      if (bn) bn.textContent = c?.building || '—';
    }

    function renderCaseRows(lines) {
      if (!tbodyCase) return;
      tbodyCase.innerHTML = '';
      lines.forEach((line, i) => {
        const tr = document.createElement('tr');
        tr.dataset.purchaseId = line.id || newPurchaseId();
        const vOpts = vendorOptionsHtml(line.vendorName, 'case');
        const inv = line.invoiceDate ? escapeHtml(String(line.invoiceDate).slice(0, 10)) : '';
        const taxOpts = taxTypeOptionsHtml(line.taxType);
        tr.innerHTML = `
          <td class="num">${i + 1}</td>
          <td><select class="toolbar__select js-purchase-vendor" style="min-width:200px">${vOpts}</select></td>
          <td><input type="date" class="toolbar__search-input js-purchase-invdate" value="${inv}" /></td>
          <td><select class="toolbar__select js-purchase-tax" style="min-width:110px">${taxOpts}</select></td>
          <td class="num"><input type="text" class="toolbar__search-input js-purchase-ex" style="text-align:right;width:120px" value="${formatMoneyInput(line.amountEx)}" /></td>
          <td class="num"><input type="text" class="toolbar__search-input js-purchase-inc" style="text-align:right;width:120px" value="${formatMoneyInput(calcAmountInc(line.amountEx, line.taxType))}" /></td>
          <td class="actions"><button type="button" class="link-action js-purchase-del">削除</button></td>`;
        tbodyCase.appendChild(tr);
      });
      bindDelAndTotals(tbodyCase, updateCaseTotals);
    }

    function loadCaseTable() {
      const cid = getSelectedCaseId();
      if (!tbodyCase) return;
      if (!cid) {
        tbodyCase.innerHTML = '';
        updateCaseTotals();
        return;
      }
      let lines = TocDataStore.getPurchases(cid).map(l => ({ ...l, id: l.id || newPurchaseId() }));
      if (!lines.length) {
        lines.push({
          id: newPurchaseId(),
          vendorName: '',
          invoiceDate: '',
          taxType: 'taxable',
          amountEx: 0,
          amountInc: calcAmountInc(0, 'taxable'),
        });
      }
      renderCaseRows(lines);
      updateCaseTotals();
    }

    function updateCaseTotals() {
      if (!totalsCase) return;
      const cid = getSelectedCaseId();
      if (!cid) {
        totalsCase.textContent = '案件を選択してください';
        return;
      }
      const lines = tbodyCase ? collectCaseLines(tbodyCase) : [];
      const sumEx = lines.reduce((s, l) => s + l.amountEx, 0);
      const sumInc = lines.reduce((s, l) => s + l.amountInc, 0);
      totalsCase.textContent = `税抜計 ¥${sumEx.toLocaleString('ja-JP')} ／ 税込計 ¥${sumInc.toLocaleString('ja-JP')}`;
    }

    function saveCaseMode() {
      const cid = getSelectedCaseId();
      if (!cid) {
        alert('案件を選択してください。');
        return;
      }
      const prev = TocDataStore.getPurchases(cid);
      const prevById = new Map(prev.map(l => [l.id, l]));
      const merged = collectCaseLines(tbodyCase).map(l => {
        const p = prevById.get(l.id);
        const at = p && Number(p.addedAt) > 0 ? Number(p.addedAt) : null;
        return at ? { ...l, addedAt: at } : l;
      });
      TocDataStore.setPurchases(cid, merged);
      alert('保存しました。');
      loadCaseTable();
    }

    function loadInvoiceDetail(vendorName, invoiceDate) {
      if (!invoiceDetailBody) return;
      const key = normInvKey(vendorName, invoiceDate);
      const state = TocDataStore.getState();
      const lines = [];
      Object.entries(state.purchases).forEach(([caseId, arr]) => {
        if (caseId === UID || !Array.isArray(arr)) return;
        arr.forEach(l => {
          if (normInvKey(l.vendorName, l.invoiceDate) === key) {
            lines.push({ ...l, caseId });
          }
        });
      });
      invoiceDetailBody.innerHTML = '';
      if (!lines.length) {
        updateInvoiceTotals();
        return;
      }
      lines.forEach((line, i) => {
        const tr = document.createElement('tr');
        tr.dataset.purchaseId = line.id || newPurchaseId();
        const taxOpts = taxTypeOptionsHtml(line.taxType);
        tr.innerHTML = `
          <td class="num">${i + 1}</td>
          <td><select class="toolbar__select js-inv-case" style="min-width:260px">${caseOptionsHtmlInvoiceDetail(line.caseId)}</select></td>
          <td><select class="toolbar__select js-purchase-tax" style="min-width:110px">${taxOpts}</select></td>
          <td class="num"><input type="text" class="toolbar__search-input js-purchase-ex" style="text-align:right;width:120px" value="${formatMoneyInput(line.amountEx)}" /></td>
          <td class="num"><input type="text" class="toolbar__search-input js-purchase-inc" style="text-align:right;width:120px" value="${formatMoneyInput(calcAmountInc(line.amountEx, line.taxType))}" /></td>
          <td class="actions"><button type="button" class="link-action js-purchase-del">削除</button></td>`;
        invoiceDetailBody.appendChild(tr);
      });
      renumber(invoiceDetailBody);
      bindDelAndTotals(invoiceDetailBody, updateInvoiceTotals);
      updateInvoiceTotals();
    }

    function clearInvoiceDetail() {
      if (!invoiceDetailBody) return;
      invoiceDetailBody.innerHTML = '';
      updateInvoiceTotals();
    }

    function updateInvoiceTotals() {
      if (!totalsInvoice) return;
      const sumEx = Array.from(invoiceDetailBody?.querySelectorAll('tr') || []).reduce((s, tr) => {
        return s + parseMoneyInput(tr.querySelector('.js-purchase-ex')?.value);
      }, 0);
      const sumInc = Array.from(invoiceDetailBody?.querySelectorAll('tr') || []).reduce((s, tr) => {
        return s + parseMoneyInput(tr.querySelector('.js-purchase-inc')?.value);
      }, 0);
      totalsInvoice.textContent = `税抜計 ¥${sumEx.toLocaleString('ja-JP')} ／ 税込計 ¥${sumInc.toLocaleString('ja-JP')}`;
    }

    function saveInvoiceMode() {
      const vendor = invVendor?.value?.trim() || '';
      const idate = normInvoiceDateStr(invDate?.value || '');
      if (!vendor) {
        alert('仕入先を選択してください。');
        return;
      }
      if (!idate) {
        alert('請求日を選択してください。（案件単位・個別追加で、その仕入先の明細を登録すると選べます）');
        return;
      }
      const key = normInvKey(vendor, idate);
      const state = TocDataStore.getState();
      const updates = {};
      state.cases.forEach(c => {
        const cid = c.caseId;
        const existing = TocDataStore.getPurchases(cid);
        updates[cid] = existing.filter(l => normInvKey(l.vendorName, l.invoiceDate) !== key);
      });
      const prevAddedById = new Map();
      Object.values(state.purchases).forEach(arr => {
        (arr || []).forEach(l => {
          if (l.id && Number(l.addedAt) > 0) prevAddedById.set(l.id, Number(l.addedAt));
        });
      });
      invoiceDetailBody.querySelectorAll('tr').forEach(tr => {
        const caseId = tr.querySelector('.js-inv-case')?.value;
        if (!caseId) return;
        const pid = tr.dataset.purchaseId || newPurchaseId();
        const at = prevAddedById.get(pid) || 0;
        const line = {
          id: pid,
          vendorName: vendor,
          invoiceDate: idate,
          taxType: normalizeTaxType(tr.querySelector('.js-purchase-tax')?.value),
          amountEx: parseMoneyInput(tr.querySelector('.js-purchase-ex')?.value),
          amountInc: parseMoneyInput(tr.querySelector('.js-purchase-inc')?.value),
          ...(at > 0 ? { addedAt: at } : {}),
        };
        updates[caseId].push(line);
      });
      TocDataStore.replacePurchasesForCases(updates);
      alert('保存しました。');
      lastInvoiceKeyContext = { vendor, date: idate };
      fillInvoiceDateSelect(idate, idate ? [idate] : []);
      loadInvoiceDetail(vendor, idate);
    }

    function loadBulkTable() {
      if (!bulkTableBody) return;
      const state = TocDataStore.getState();
      const UID = TocDataStore.UNLINKED_PURCHASE_CASE_ID;
      const flat = [];
      Object.entries(state.purchases).forEach(([caseId, lines]) => {
        const c = state.cases.find(x => x.caseId === caseId);
        const est = caseId === UID ? '' : c?.estimateNo || '';
        if (!Array.isArray(lines)) return;
        lines.forEach(l => {
          flat.push({
            ...l,
            id: l.id || newPurchaseId(),
            caseId,
            estimateNo: est,
          });
        });
      });
      flat.sort((a, b) => {
        const ta = purchaseLineAddedAtMs(a);
        const tb = purchaseLineAddedAtMs(b);
        if (tb !== ta) return tb - ta;
        const ea = a.estimateNo || '';
        const eb = b.estimateNo || '';
        const c0 = ea.localeCompare(eb, 'ja', { numeric: true });
        if (c0 !== 0) return c0;
        const dk = normInvKey(a.vendorName, a.invoiceDate).localeCompare(normInvKey(b.vendorName, b.invoiceDate));
        if (dk !== 0) return dk;
        return (a.id || '').localeCompare(b.id || '');
      });
      bulkTableBody.innerHTML = '';
      flat.forEach((line, i) => {
        const tr = document.createElement('tr');
        tr.dataset.purchaseId = line.id;
        tr.dataset.addedAt = String(purchaseLineAddedAtMs(line));
        const vOpts = vendorOptionsHtml(line.vendorName, 'bulk');
        const inv = line.invoiceDate ? escapeHtml(String(line.invoiceDate).slice(0, 10)) : '';
        const taxOpts = taxTypeOptionsHtml(line.taxType);
        tr.innerHTML = `
          <td class="num">${i + 1}</td>
          <td><select class="toolbar__select js-bulk-case" style="min-width:240px">${caseOptionsHtmlBulk(line.caseId)}</select></td>
          <td><select class="toolbar__select js-purchase-vendor" style="min-width:200px">${vOpts}</select></td>
          <td><input type="date" class="toolbar__search-input js-purchase-invdate" value="${inv}" /></td>
          <td><select class="toolbar__select js-purchase-tax" style="min-width:110px">${taxOpts}</select></td>
          <td class="num"><input type="text" class="toolbar__search-input js-purchase-ex" style="text-align:right;width:120px" value="${formatMoneyInput(line.amountEx)}" /></td>
          <td class="num"><input type="text" class="toolbar__search-input js-purchase-inc" style="text-align:right;width:120px" value="${formatMoneyInput(calcAmountInc(line.amountEx, line.taxType))}" /></td>
          <td class="actions"><button type="button" class="link-action js-purchase-del">削除</button></td>`;
        bulkTableBody.appendChild(tr);
      });
      bindDelAndTotals(bulkTableBody, () => {
        applyBulkViewFilter();
        updateBulkTotals();
      });
      applyBulkViewFilter();
      updateBulkTotals();
    }

    function applyBulkViewFilter() {
      if (!bulkTableBody) return;
      const viewKey = bulkListFilter?.value || 'all';
      const searchRaw = bulkListSearch?.value || '';
      const state = TocDataStore.getState();
      bulkTableBody.querySelectorAll('tr').forEach(tr => {
        const caseId = tr.querySelector('.js-bulk-case')?.value || '';
        const vendorName = tr.querySelector('.js-purchase-vendor')?.value || '';
        const invoiceDate = tr.querySelector('.js-purchase-invdate')?.value || '';
        const c = state.cases.find(x => x.caseId === caseId);
        const estimateNo = caseId === UID ? '' : c?.estimateNo || '';
        const line = { vendorName, invoiceDate, estimateNo };
        const show = bulkRowMatchesViewFilter(caseId, line, viewKey, searchRaw);
        tr.hidden = !show;
      });
    }

    function updateBulkTotals() {
      if (!totalsBulk) return;
      const rows = Array.from(bulkTableBody?.querySelectorAll('tr') || []).filter(tr => !tr.hidden);
      const sumEx = rows.reduce((s, tr) => {
        return s + parseMoneyInput(tr.querySelector('.js-purchase-ex')?.value);
      }, 0);
      const sumInc = rows.reduce((s, tr) => {
        return s + parseMoneyInput(tr.querySelector('.js-purchase-inc')?.value);
      }, 0);
      totalsBulk.textContent = `税抜計 ¥${sumEx.toLocaleString('ja-JP')} ／ 税込計 ¥${sumInc.toLocaleString('ja-JP')}`;
    }

    function collectBulkLines() {
      const out = [];
      bulkTableBody.querySelectorAll('tr').forEach(tr => {
        const caseId = tr.querySelector('.js-bulk-case')?.value;
        if (!caseId) return;
        const rawAt = tr.dataset.addedAt;
        let addedAt = rawAt !== undefined && rawAt !== '' ? Number(rawAt) : NaN;
        if (!Number.isFinite(addedAt) || addedAt <= 0) {
          addedAt = purchaseLineAddedAtMs({ id: tr.dataset.purchaseId }) || 0;
        }
        out.push({
          caseId,
          id: tr.dataset.purchaseId || newPurchaseId(),
          vendorName: tr.querySelector('.js-purchase-vendor')?.value || '',
          invoiceDate: tr.querySelector('.js-purchase-invdate')?.value || '',
          taxType: normalizeTaxType(tr.querySelector('.js-purchase-tax')?.value),
          amountEx: parseMoneyInput(tr.querySelector('.js-purchase-ex')?.value),
          amountInc: parseMoneyInput(tr.querySelector('.js-purchase-inc')?.value),
          addedAt,
        });
      });
      return out;
    }

    function saveBulkMode() {
      const state = TocDataStore.getState();
      const UID = TocDataStore.UNLINKED_PURCHASE_CASE_ID;
      const updates = {};
      state.cases.forEach(c => {
        updates[c.caseId] = [];
      });
      updates[UID] = [];
      collectBulkLines().forEach(line => {
        updates[line.caseId].push({
          id: line.id,
          vendorName: line.vendorName,
          invoiceDate: line.invoiceDate,
          taxType: line.taxType,
          amountEx: line.amountEx,
          amountInc: line.amountInc,
          addedAt: line.addedAt || 0,
        });
      });
      TocDataStore.replacePurchasesForCases(updates);
      alert('保存しました。');
      loadBulkTable();
    }

    if (tabCase) tabCase.addEventListener('click', () => setMode('case'));
    if (tabInvoice) tabInvoice.addEventListener('click', () => setMode('invoice'));
    if (tabBulk) tabBulk.addEventListener('click', () => setMode('bulk'));

    populateCaseDropdown();
    enhanceSearchableSelect(caseBaseSelect, '見積No.・取引先・物件名で検索');
    enhanceSearchableSelect(invVendor, '仕入先名で検索');
    enhanceSearchableSelect(invDate, '請求日で検索');
    enhanceSearchableSelect(newInvoiceVendor, '仕入先名で検索');
    if (urlCaseId && caseBaseSelect) {
      caseBaseSelect.value = urlCaseId;
      if (hid) hid.value = urlCaseId;
    }
    refreshCaseHeader();

    caseBaseSelect?.addEventListener('change', () => {
      refreshCaseHeader();
      loadCaseTable();
    });

    btnAddCase?.addEventListener('click', () => {
      if (!tbodyCase) return;
      const tr = document.createElement('tr');
      tr.dataset.purchaseId = newPurchaseId();
      const opts = vendorOptionsHtml('', 'case');
      const taxOpts = taxTypeOptionsHtml('taxable');
      tr.innerHTML = `
        <td class="num">0</td>
        <td><select class="toolbar__select js-purchase-vendor" style="min-width:200px">${opts}</select></td>
        <td><input type="date" class="toolbar__search-input js-purchase-invdate" value="" /></td>
        <td><select class="toolbar__select js-purchase-tax" style="min-width:110px">${taxOpts}</select></td>
        <td class="num"><input type="text" class="toolbar__search-input js-purchase-ex" style="text-align:right;width:120px" value="0" /></td>
        <td class="num"><input type="text" class="toolbar__search-input js-purchase-inc" style="text-align:right;width:120px" value="${formatMoneyInput(calcAmountInc(0, 'taxable'))}" /></td>
        <td class="actions"><button type="button" class="link-action js-purchase-del">削除</button></td>`;
      tbodyCase.appendChild(tr);
      renumber(tbodyCase);
      bindDelAndTotals(tbodyCase, updateCaseTotals);
      updateCaseTotals();
    });

    fillVendorSelect(invVendor, '', 'invoice');

    invVendor?.addEventListener('change', () => {
      fillInvoiceDateSelect('');
      clearInvoiceDetail();
      lastInvoiceKeyContext = null;
    });
    invDate?.addEventListener('change', () => syncInvoiceDetailFromToolbar());

    btnNewInvoice?.addEventListener('click', () => {
      if (newInvoiceVendor) {
        newInvoiceVendor.innerHTML = vendorOptionsHtml((invVendor?.value || '').trim(), 'invoice');
      }
      if (newInvoiceDate) {
        newInvoiceDate.value = '';
      }
      newInvoiceDialog?.showModal();
    });

    document.getElementById('newInvoiceCancel')?.addEventListener('click', () => {
      newInvoiceDialog?.close();
    });

    document.getElementById('newInvoiceConfirm')?.addEventListener('click', () => {
      const v = (newInvoiceVendor?.value || '').trim();
      const d = normInvoiceDateStr(newInvoiceDate?.value || '');
      if (!v) {
        alert('仕入先を選択してください。');
        return;
      }
      if (!d) {
        alert('請求日を入力してください。');
        return;
      }
      newInvoiceDialog?.close();
      applyInvoiceToolbarVendorDate(v, d);
      syncInvoiceDetailFromToolbar();
    });

    btnAddInvoiceRow?.addEventListener('click', () => {
      let vendor = '';
      let idate = '';
      const hasDetailRows = (invoiceDetailBody?.querySelectorAll('tr').length || 0) > 0;
      if (hasDetailRows && lastInvoiceKeyContext) {
        vendor = (lastInvoiceKeyContext.vendor || '').trim();
        idate = normInvoiceDateStr(lastInvoiceKeyContext.date || '');
      }
      if (!vendor) vendor = (invVendor?.value || '').trim();
      if (!idate) idate = normInvoiceDateStr(invDate?.value || '');

      if (!vendor || !idate) {
        alert(
          '仕入先と請求日の両方が必要です。\n上で選ぶか、「新規作成」から指定してください。'
        );
        return;
      }
      applyInvoiceToolbarVendorDate(vendor, idate);
      const tr = document.createElement('tr');
      tr.dataset.purchaseId = newPurchaseId();
      const taxOpts = taxTypeOptionsHtml('taxable');
      tr.innerHTML = `
        <td class="num">0</td>
        <td><select class="toolbar__select js-inv-case" style="min-width:260px">${caseOptionsHtmlInvoiceDetail('')}</select></td>
        <td><select class="toolbar__select js-purchase-tax" style="min-width:110px">${taxOpts}</select></td>
        <td class="num"><input type="text" class="toolbar__search-input js-purchase-ex" style="text-align:right;width:120px" value="0" /></td>
        <td class="num"><input type="text" class="toolbar__search-input js-purchase-inc" style="text-align:right;width:120px" value="${formatMoneyInput(calcAmountInc(0, 'taxable'))}" /></td>
        <td class="actions"><button type="button" class="link-action js-purchase-del">削除</button></td>`;
      invoiceDetailBody.appendChild(tr);
      renumber(invoiceDetailBody);
      bindDelAndTotals(invoiceDetailBody, updateInvoiceTotals);
      updateInvoiceTotals();
    });

    btnAddBulk?.addEventListener('click', () => {
      if (!bulkTableBody) return;
      const tr = document.createElement('tr');
      tr.dataset.purchaseId = newPurchaseId();
      tr.dataset.addedAt = String(Date.now());
      const opts = vendorOptionsHtml('', 'bulk');
      const taxOpts = taxTypeOptionsHtml('taxable');
      tr.innerHTML = `
        <td class="num">0</td>
        <td><select class="toolbar__select js-bulk-case" style="min-width:240px">${caseOptionsHtmlBulk('')}</select></td>
        <td><select class="toolbar__select js-purchase-vendor" style="min-width:200px">${opts}</select></td>
        <td><input type="date" class="toolbar__search-input js-purchase-invdate" value="" /></td>
        <td><select class="toolbar__select js-purchase-tax" style="min-width:110px">${taxOpts}</select></td>
        <td class="num"><input type="text" class="toolbar__search-input js-purchase-ex" style="text-align:right;width:120px" value="0" /></td>
        <td class="num"><input type="text" class="toolbar__search-input js-purchase-inc" style="text-align:right;width:120px" value="${formatMoneyInput(calcAmountInc(0, 'taxable'))}" /></td>
        <td class="actions"><button type="button" class="link-action js-purchase-del">削除</button></td>`;
      bulkTableBody.insertBefore(tr, bulkTableBody.firstChild);
      renumber(bulkTableBody);
      bindDelAndTotals(bulkTableBody, () => {
        applyBulkViewFilter();
        updateBulkTotals();
      });
      applyBulkViewFilter();
      updateBulkTotals();
    });

    bulkListFilter?.addEventListener('change', () => {
      if (panelBulk && !panelBulk.hidden) {
        applyBulkViewFilter();
        updateBulkTotals();
      }
    });
    bulkListSearch?.addEventListener('input', () => {
      if (panelBulk && !panelBulk.hidden) {
        applyBulkViewFilter();
        updateBulkTotals();
      }
    });

    document.getElementById('btnSaveCaseToolbar')?.addEventListener('click', () => saveCaseMode());
    document.getElementById('btnSaveInvoiceToolbar')?.addEventListener('click', () => saveInvoiceMode());
    document.getElementById('btnSaveBulkToolbar')?.addEventListener('click', () => saveBulkMode());

    let initialMode = 'case';
    try {
      const s = localStorage.getItem(MODE_STORAGE_KEY);
      if (s === 'invoice' || s === 'bulk') initialMode = s;
    } catch (_) {}
    if (urlCaseId) initialMode = 'case';
    setMode(initialMode);
  });
})();
