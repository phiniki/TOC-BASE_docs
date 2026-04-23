(function () {
  const MODE_STORAGE_KEY = 'toc-purchase-reg-mode';

  function parseMoneyInput(str) {
    return parseInt(String(str ?? '').replace(/[^\d]/g, ''), 10) || 0;
  }

  function formatMoneyInput(n) {
    return Math.round(Number(n) || 0).toLocaleString('ja-JP');
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

  /** マスタ外の仕入先も1行に含められるよう、選択値付きで option HTML を組み立てる */
  function vendorOptionsHtml(selectedName) {
    const vendors = vendorOptions();
    const sel = (selectedName || '').trim();
    let list = vendors.slice();
    if (sel && !list.some(v => v === sel)) list = [...list, sel];
    list.sort((a, b) => a.localeCompare(b, 'ja'));
    const head = '<option value="">選択してください</option>';
    const body = list
      .map(v => `<option value="${escapeHtml(v)}"${v === sel ? ' selected' : ''}>${escapeHtml(v)}</option>`)
      .join('');
    return head + body;
  }

  function fillVendorSelect(selectEl, current) {
    if (!selectEl) return;
    selectEl.innerHTML = vendorOptionsHtml(current);
  }

  function readKeyRowVendorDate(tr) {
    if (!tr) return { vendor: '', date: '' };
    const vendor = (tr.getAttribute('data-vendor') || '').trim();
    const date = normInvoiceDateStr(tr.getAttribute('data-inv-date') || '');
    return { vendor, date };
  }

  function caseOptionsHtml(selectedCaseId) {
    const cases = TocDataStore.getState().cases;
    return cases
      .map(c => {
        const sel = c.caseId === selectedCaseId ? ' selected' : '';
        const lab = (c.estimateNo || '（未採番）') + ' — ' + (c.client || '').slice(0, 16);
        return `<option value="${escapeHtml(c.caseId)}"${sel}>${escapeHtml(lab)}</option>`;
      })
      .join('');
  }

  function renumber(tbody) {
    tbody.querySelectorAll('tr').forEach((tr, i) => {
      const c = tr.querySelector('td.num');
      if (c) c.textContent = String(i + 1);
    });
  }

  function bindDelAndTotals(tbody, onChange) {
    tbody.querySelectorAll('.js-purchase-del').forEach(btn => {
      btn.addEventListener('click', () => {
        const tr = btn.closest('tr');
        tr?.remove();
        renumber(tbody);
        onChange();
      });
    });
    tbody.querySelectorAll('.js-purchase-ex, .js-purchase-inc, .js-purchase-vendor, .js-purchase-invdate, .js-inv-case, .js-bulk-case').forEach(el => {
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
        amountEx: parseMoneyInput(tr.querySelector('.js-purchase-ex')?.value),
        amountInc: parseMoneyInput(tr.querySelector('.js-purchase-inc')?.value),
      });
    });
    return out;
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
    const btnNewInvoice = document.getElementById('btnNewInvoice');
    const invoiceKeyTableBody = document.getElementById('invoiceKeyTableBody');
    const invoiceDetailBody = document.getElementById('invoiceDetailBody');
    const btnAddInvoiceRow = document.getElementById('btnAddInvoiceRow');
    const totalsInvoice = document.getElementById('purchaseTotalsInvoice');

    function applyInvoiceToolbarVendorDate(vendor, dateNorm) {
      const v = (vendor || '').trim();
      const d = normInvoiceDateStr(dateNorm || '');
      if (invVendor) fillVendorSelect(invVendor, v);
      if (invDate) invDate.value = d;
      lastInvoiceKeyContext = v || d ? { vendor: v, date: d } : null;
    }

    /** 仕入先・請求日が揃ったら DB から明細を表示（旧「明細を表示」ボタンの代替） */
    function syncInvoiceDetailFromToolbar() {
      const v = (invVendor?.value || '').trim();
      const d = normInvoiceDateStr(invDate?.value || '');
      if (!v || !d) return;
      lastInvoiceKeyContext = { vendor: v, date: d };
      invoiceKeyTableBody?.querySelectorAll('.invoice-key-row').forEach(x => {
        const k = readKeyRowVendorDate(x);
        x.classList.toggle('is-selected', k.vendor === v && k.date === d);
      });
      loadInvoiceDetail(v, d);
    }

    const bulkTableBody = document.getElementById('bulkTableBody');
    const btnAddBulk = document.getElementById('btnAddBulkRow');
    const totalsBulk = document.getElementById('purchaseTotalsBulk');

    let activeMode = 'case';
    /** 請求書ベース: 一覧の選択が外れても、確定した仕入先×請求日を行追加・保存に使う */
    let lastInvoiceKeyContext = null;

    const p = new URLSearchParams(location.search);
    let urlCaseId = p.get('id');
    const legacyNo = p.get('no');
    if (!urlCaseId && legacyNo) {
      const hit = TocDataStore.getCase(legacyNo);
      if (hit) urlCaseId = hit.caseId;
    }

    function setMode(mode) {
      activeMode = mode;
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
        fillVendorSelect(invVendor);
        refreshInvoiceKeyTable();
        updateInvoiceTotals();
      }
      if (mode === 'bulk') {
        loadBulkTable();
        updateBulkTotals();
      }
    }

    function populateCaseDropdown() {
      if (!caseBaseSelect) return;
      const cases = TocDataStore.getState().cases;
      caseBaseSelect.innerHTML =
        '<option value="">選択してください</option>' +
        cases
          .map(c => {
            const lab = (c.estimateNo || '—') + ' / ' + (c.client || '').slice(0, 14);
            return `<option value="${escapeHtml(c.caseId)}">${escapeHtml(lab)}</option>`;
          })
          .join('');
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
        const vOpts = vendorOptionsHtml(line.vendorName);
        const inv = line.invoiceDate ? escapeHtml(String(line.invoiceDate).slice(0, 10)) : '';
        tr.innerHTML = `
          <td class="num">${i + 1}</td>
          <td><select class="toolbar__select js-purchase-vendor" style="min-width:200px">${vOpts}</select></td>
          <td><input type="date" class="toolbar__search-input js-purchase-invdate" value="${inv}" /></td>
          <td class="num"><input type="text" class="toolbar__search-input js-purchase-ex" style="text-align:right;width:120px" value="${formatMoneyInput(line.amountEx)}" /></td>
          <td class="num"><input type="text" class="toolbar__search-input js-purchase-inc" style="text-align:right;width:120px" value="${formatMoneyInput(line.amountInc)}" /></td>
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
          amountEx: 0,
          amountInc: 0,
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
      TocDataStore.setPurchases(cid, collectCaseLines(tbodyCase));
      alert('保存しました。');
      loadCaseTable();
    }

    function gatherInvoiceSummaries() {
      const state = TocDataStore.getState();
      const map = new Map();
      Object.values(state.purchases).forEach(lines => {
        if (!Array.isArray(lines)) return;
        lines.forEach(l => {
          const k = normInvKey(l.vendorName, l.invoiceDate);
          if (!map.has(k)) {
            map.set(k, {
              vendorName: l.vendorName || '',
              invoiceDate: normInvoiceDateStr(l.invoiceDate),
              count: 0,
              sumEx: 0,
            });
          }
          const r = map.get(k);
          r.count += 1;
          r.sumEx += Number(l.amountEx) || 0;
        });
      });
      return Array.from(map.values()).sort((a, b) => {
        const d = (a.invoiceDate || '').localeCompare(b.invoiceDate || '');
        if (d !== 0) return d;
        return (a.vendorName || '').localeCompare(b.vendorName || '', 'ja');
      });
    }

    function refreshInvoiceKeyTable() {
      if (!invoiceKeyTableBody) return;
      const rows = gatherInvoiceSummaries();
      invoiceKeyTableBody.innerHTML = rows
        .map(r => {
          const dAttr = r.invoiceDate || '';
          return `<tr class="invoice-key-row" data-vendor="${escapeHtml(r.vendorName)}" data-inv-date="${escapeHtml(dAttr)}">
            <td>${escapeHtml(r.vendorName)}</td>
            <td>${escapeHtml(dAttr ? dAttr : '—')}</td>
            <td class="num">${r.count}</td>
            <td class="num">¥${r.sumEx.toLocaleString('ja-JP')}</td>
          </tr>`;
        })
        .join('');

      invoiceKeyTableBody.querySelectorAll('.invoice-key-row').forEach(tr => {
        tr.addEventListener('click', () => {
          invoiceKeyTableBody.querySelectorAll('.invoice-key-row').forEach(x => x.classList.remove('is-selected'));
          tr.classList.add('is-selected');
          const { vendor: v, date: d } = readKeyRowVendorDate(tr);
          applyInvoiceToolbarVendorDate(v, d);
          loadInvoiceDetail(v, d);
        });
      });
    }

    function loadInvoiceDetail(vendorName, invoiceDate) {
      if (!invoiceDetailBody) return;
      const key = normInvKey(vendorName, invoiceDate);
      const state = TocDataStore.getState();
      const lines = [];
      Object.entries(state.purchases).forEach(([caseId, arr]) => {
        if (!Array.isArray(arr)) return;
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
        tr.innerHTML = `
          <td class="num">${i + 1}</td>
          <td><select class="toolbar__select js-inv-case" style="min-width:260px">${caseOptionsHtml(line.caseId)}</select></td>
          <td class="num"><input type="text" class="toolbar__search-input js-purchase-ex" style="text-align:right;width:120px" value="${formatMoneyInput(line.amountEx)}" /></td>
          <td class="num"><input type="text" class="toolbar__search-input js-purchase-inc" style="text-align:right;width:120px" value="${formatMoneyInput(line.amountInc)}" /></td>
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
        alert('請求日を入力してください。');
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
      invoiceDetailBody.querySelectorAll('tr').forEach(tr => {
        const caseId = tr.querySelector('.js-inv-case')?.value;
        if (!caseId) return;
        const line = {
          id: tr.dataset.purchaseId || newPurchaseId(),
          vendorName: vendor,
          invoiceDate: idate,
          amountEx: parseMoneyInput(tr.querySelector('.js-purchase-ex')?.value),
          amountInc: parseMoneyInput(tr.querySelector('.js-purchase-inc')?.value),
        };
        updates[caseId].push(line);
      });
      TocDataStore.replacePurchasesForCases(updates);
      alert('保存しました。');
      lastInvoiceKeyContext = { vendor, date: idate };
      refreshInvoiceKeyTable();
      loadInvoiceDetail(vendor, idate);
    }

    function loadBulkTable() {
      if (!bulkTableBody) return;
      const state = TocDataStore.getState();
      const flat = [];
      Object.entries(state.purchases).forEach(([caseId, lines]) => {
        const c = state.cases.find(x => x.caseId === caseId);
        const est = c?.estimateNo || '';
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
        const vOpts = vendorOptionsHtml(line.vendorName);
        const inv = line.invoiceDate ? escapeHtml(String(line.invoiceDate).slice(0, 10)) : '';
        tr.innerHTML = `
          <td class="num">${i + 1}</td>
          <td><select class="toolbar__select js-bulk-case" style="min-width:240px">${caseOptionsHtml(line.caseId)}</select></td>
          <td><select class="toolbar__select js-purchase-vendor" style="min-width:200px">${vOpts}</select></td>
          <td><input type="date" class="toolbar__search-input js-purchase-invdate" value="${inv}" /></td>
          <td class="num"><input type="text" class="toolbar__search-input js-purchase-ex" style="text-align:right;width:120px" value="${formatMoneyInput(line.amountEx)}" /></td>
          <td class="num"><input type="text" class="toolbar__search-input js-purchase-inc" style="text-align:right;width:120px" value="${formatMoneyInput(line.amountInc)}" /></td>
          <td class="actions"><button type="button" class="link-action js-purchase-del">削除</button></td>`;
        bulkTableBody.appendChild(tr);
      });
      bindDelAndTotals(bulkTableBody, updateBulkTotals);
      updateBulkTotals();
    }

    function updateBulkTotals() {
      if (!totalsBulk) return;
      const sumEx = Array.from(bulkTableBody?.querySelectorAll('tr') || []).reduce((s, tr) => {
        return s + parseMoneyInput(tr.querySelector('.js-purchase-ex')?.value);
      }, 0);
      const sumInc = Array.from(bulkTableBody?.querySelectorAll('tr') || []).reduce((s, tr) => {
        return s + parseMoneyInput(tr.querySelector('.js-purchase-inc')?.value);
      }, 0);
      totalsBulk.textContent = `税抜計 ¥${sumEx.toLocaleString('ja-JP')} ／ 税込計 ¥${sumInc.toLocaleString('ja-JP')}`;
    }

    function collectBulkLines() {
      const out = [];
      bulkTableBody.querySelectorAll('tr').forEach(tr => {
        const caseId = tr.querySelector('.js-bulk-case')?.value;
        if (!caseId) return;
        out.push({
          caseId,
          id: tr.dataset.purchaseId || newPurchaseId(),
          vendorName: tr.querySelector('.js-purchase-vendor')?.value || '',
          invoiceDate: tr.querySelector('.js-purchase-invdate')?.value || '',
          amountEx: parseMoneyInput(tr.querySelector('.js-purchase-ex')?.value),
          amountInc: parseMoneyInput(tr.querySelector('.js-purchase-inc')?.value),
        });
      });
      return out;
    }

    function saveBulkMode() {
      const state = TocDataStore.getState();
      const updates = {};
      state.cases.forEach(c => {
        updates[c.caseId] = [];
      });
      collectBulkLines().forEach(line => {
        updates[line.caseId].push({
          id: line.id,
          vendorName: line.vendorName,
          invoiceDate: line.invoiceDate,
          amountEx: line.amountEx,
          amountInc: line.amountInc,
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
      const opts = vendorOptionsHtml('');
      tr.innerHTML = `
        <td class="num">0</td>
        <td><select class="toolbar__select js-purchase-vendor" style="min-width:200px">${opts}</select></td>
        <td><input type="date" class="toolbar__search-input js-purchase-invdate" value="" /></td>
        <td class="num"><input type="text" class="toolbar__search-input js-purchase-ex" style="text-align:right;width:120px" value="0" /></td>
        <td class="num"><input type="text" class="toolbar__search-input js-purchase-inc" style="text-align:right;width:120px" value="0" /></td>
        <td class="actions"><button type="button" class="link-action js-purchase-del">削除</button></td>`;
      tbodyCase.appendChild(tr);
      renumber(tbodyCase);
      bindDelAndTotals(tbodyCase, updateCaseTotals);
      updateCaseTotals();
    });

    fillVendorSelect(invVendor);
    invVendor?.addEventListener('change', syncInvoiceDetailFromToolbar);
    invDate?.addEventListener('change', syncInvoiceDetailFromToolbar);
    btnNewInvoice?.addEventListener('click', () => {
      invoiceKeyTableBody?.querySelectorAll('.invoice-key-row').forEach(x => x.classList.remove('is-selected'));
      clearInvoiceDetail();
      applyInvoiceToolbarVendorDate('', '');
    });

    btnAddInvoiceRow?.addEventListener('click', () => {
      const selectedTr = invoiceKeyTableBody?.querySelector('.invoice-key-row.is-selected');
      let vendor = '';
      let idate = '';
      if (selectedTr) {
        const k = readKeyRowVendorDate(selectedTr);
        vendor = k.vendor;
        idate = k.date;
      } else {
        const hasDetailRows = (invoiceDetailBody?.querySelectorAll('tr').length || 0) > 0;
        if (hasDetailRows && lastInvoiceKeyContext) {
          vendor = (lastInvoiceKeyContext.vendor || '').trim();
          idate = normInvoiceDateStr(lastInvoiceKeyContext.date || '');
        }
        if (!vendor) vendor = (invVendor?.value || '').trim();
        if (!idate) idate = normInvoiceDateStr(invDate?.value || '');
      }

      if (!vendor || !idate) {
        alert(
          '仕入先と請求日（請求書の日付）の両方が必要です。\n' +
            '・上の「請求書一覧」で行をクリックするか、下で仕入先と請求日を指定してから追加してください。'
        );
        return;
      }
      applyInvoiceToolbarVendorDate(vendor, idate);
      const tr = document.createElement('tr');
      tr.dataset.purchaseId = newPurchaseId();
      const firstCase = TocDataStore.getState().cases[0]?.caseId || '';
      tr.innerHTML = `
        <td class="num">0</td>
        <td><select class="toolbar__select js-inv-case" style="min-width:260px">${caseOptionsHtml(firstCase)}</select></td>
        <td class="num"><input type="text" class="toolbar__search-input js-purchase-ex" style="text-align:right;width:120px" value="0" /></td>
        <td class="num"><input type="text" class="toolbar__search-input js-purchase-inc" style="text-align:right;width:120px" value="0" /></td>
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
      const opts = vendorOptionsHtml('');
      const cid = TocDataStore.getState().cases[0]?.caseId || '';
      tr.innerHTML = `
        <td class="num">0</td>
        <td><select class="toolbar__select js-bulk-case" style="min-width:240px">${caseOptionsHtml(cid)}</select></td>
        <td><select class="toolbar__select js-purchase-vendor" style="min-width:200px">${opts}</select></td>
        <td><input type="date" class="toolbar__search-input js-purchase-invdate" value="" /></td>
        <td class="num"><input type="text" class="toolbar__search-input js-purchase-ex" style="text-align:right;width:120px" value="0" /></td>
        <td class="num"><input type="text" class="toolbar__search-input js-purchase-inc" style="text-align:right;width:120px" value="0" /></td>
        <td class="actions"><button type="button" class="link-action js-purchase-del">削除</button></td>`;
      bulkTableBody.appendChild(tr);
      renumber(bulkTableBody);
      bindDelAndTotals(bulkTableBody, updateBulkTotals);
      updateBulkTotals();
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
