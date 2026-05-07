function parseMoneyInput(str) {
  const t = String(str ?? '').replace(/[¥,\s]/g, '');
  if (t === '' || t === '-') return 0;
  const n = parseFloat(t);
  return Number.isNaN(n) ? 0 : n;
}
let currentEditingRecord = null;

function toDate(s) {
  if (!s) return null;
  const d = new Date(s + 'T00:00:00');
  return Number.isNaN(d.getTime()) ? null : d;
}
function fromDate(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function addYears(ymd, years) {
  const d = toDate(ymd);
  if (!d) return '';
  d.setFullYear(d.getFullYear() + (Number(years) || 0));
  return fromDate(d);
}
function addDays(ymd, days) {
  const d = toDate(ymd);
  if (!d) return '';
  d.setDate(d.getDate() + (parseInt(days, 10) || 0));
  return fromDate(d);
}
function addMonths(ymd, months) {
  const d = toDate(ymd);
  if (!d) return '';
  d.setMonth(d.getMonth() + (parseInt(months, 10) || 0));
  return fromDate(d);
}
function computeRenewalDates(baseDate, firstYears, windowMonths, leadMonths, status, prevContractDate) {
  const nextRenewalDate = status === '新規' ? addYears(baseDate, firstYears) : addYears(prevContractDate || baseDate, 1);
  const renewalDueDate = addMonths(nextRenewalDate, -(parseInt(windowMonths, 10) || 0));
  const renewalCheckDate = addMonths(renewalDueDate, -(parseInt(leadMonths, 10) || 0));
  return { renewalDueDate, renewalCheckDate };
}
function getCaseById(caseId) {
  return TocDataStore.getState().cases.find(c => c.caseId === caseId) || null;
}
function getMediaCaseList() {
  return (TocDataStore.getState().cases || []).filter(c => String(c.kubun || '').trim() === '媒体');
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

function renderCaseOptions(selected) {
  const sel = document.getElementById('m_caseId');
  if (!sel) return;
  const rows = getMediaCaseList();
  sel.innerHTML = `<option value="">案件を選択</option>${rows
    .map(
      c =>
        `<option value="${c.caseId}">${c.estimateNo || '（未採番）'} / ${c.client || '—'} / ${c.building || '—'}</option>`
    )
    .join('')}`;
  if (selected) sel.value = selected;
}
function syncCaseLinkedFields() {
  const c = getCaseById(document.getElementById('m_caseId')?.value || '');
  document.getElementById('m_caseEstimateNo').value = c?.estimateNo || '';
  document.getElementById('m_caseSponsor').value = c?.client || '';
}

function latestLogPrevDate(logs) {
  if (!Array.isArray(logs) || !logs.length) return '';
  const sorted = [...logs].sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
  return String(sorted[0]?.prevContractDate || '').trim();
}

function normalizeCmpValue(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  return String(v).trim();
}

function buildMediaAutoChangeLog(prev, next) {
  if (!prev) return '新規登録';
  const labels = {
    caseId: '案件',
    estimateNo: '見積No.',
    sponsor: 'スポンサー',
    contractStatus: '契約ステータス',
    sponsorContractCompany: 'スポンサー契約会社',
    landlordContractCompany: '地主契約会社',
    sponsorTel: 'スポンサーTEL',
    designFace: '意匠面',
    sponsorFirstContractDate: 'スポンサー初回契約日',
    sponsorFirstContractYears: 'スポンサー初回契約年数',
    sponsorRenewalWindowDays: 'スポンサー継続確認期間',
    sponsorLeadTimeDays: 'スポンサー契約確認リードタイム',
    sponsorPrevContractDate: 'スポンサー前回契約日',
    sponsorRenewalDueDate: 'スポンサー継続確認期日',
    sponsorRenewalCheckDate: 'スポンサー継続確認日',
    mediaFeeEx: '媒体料（税別）',
    mediaFeeIncludeFirstInvoice: '媒体料: 初回請求に初回契約年数分を含む',
    landlordName: '地主名',
    landlordTel: '地主TEL',
    landlordAddress: '地主住所',
    landlordFirstContractDate: '地主初回契約日',
    landlordFirstContractYears: '地主初回契約年数',
    landlordRenewalWindowDays: '地主継続確認期間',
    landlordLeadTimeDays: '地主契約確認リードタイム',
    landlordPrevContractDate: '地主前回契約日',
    landlordRenewalDueDate: '地主継続確認期日',
    landlordRenewalCheckDate: '地主継続確認日',
    landlordRentEx: '地主への支払賃料（税別）',
    landlordRentIncludeFirstInvoice: '地主賃料: 初回請求に含む',
    propertyLocation: '物件所在地',
    size: 'サイズ',
    remarks: '備考',
    outdoorAdApplied: '屋外広告申請済み',
    outdoorAdCompany: '屋外広告申請会社',
    outdoorAdApplication: '屋外広告申請',
    removalCostEx: '撤去費（税別）',
    cancellationRecruitable: '解約時募集可能',
  };

  const keys = Object.keys(labels);
  const changes = [];
  keys.forEach(k => {
    const a = normalizeCmpValue(prev[k]);
    const b = normalizeCmpValue(next[k]);
    if (a === b) return;
    changes.push(`${labels[k]}: ${a || '—'} → ${b || '—'}`);
  });
  if (!changes.length) return '';
  return `自動記録: ${changes.join(' / ')}`;
}

function readForm() {
  const g = id => document.getElementById(id);
  const caseId = (g('m_caseId').value || '').trim();
  const c = getCaseById(caseId);
  const contractStatus = (g('media_contract_status')?.value || '新規').trim() || '新規';
  const sponsorPrevContractDate =
    (g('media_sponsor_prev_contract_date')?.value || '').trim() || (currentEditingRecord?.sponsorPrevContractDate || '');
  const sponsorCalc = computeRenewalDates(
    g('m_sponsorFirstContractDate').value,
    g('m_sponsorFirstContractYears').value,
    g('m_sponsorRenewalWindowDays').value,
    g('m_sponsorLeadTimeDays').value,
    contractStatus,
    sponsorPrevContractDate
  );
  const landlordPrevContractDate =
    (g('media_landlord_prev_contract_date')?.value || '').trim() || (currentEditingRecord?.landlordPrevContractDate || '');
  const landlordCalc = computeRenewalDates(
    g('m_landlordFirstContractDate').value,
    g('m_landlordFirstContractYears').value,
    g('m_landlordRenewalWindowDays').value,
    g('m_landlordLeadTimeDays').value,
    contractStatus,
    landlordPrevContractDate
  );
  const outdoorAdApplied = !!g('m_outdoorAdApplied').checked;
  const outdoorAdCompany = (g('m_outdoorAdCompany').value || '').trim();
  return {
    id: (g('media_edit_id').value || '').trim(),
    caseId,
    estimateNo: c?.estimateNo || '',
    sponsor: c?.client || '',
    contractStatus,
    sponsorContractCompany: g('m_sponsorContractCompany').value || 'TOC',
    landlordContractCompany: g('m_landlordContractCompany').value || 'TOC',
    sponsorTel: (g('m_sponsorTel').value || '').trim(),
    designFace: (g('m_designFace').value || '').trim(),
    sponsorFirstContractDate: (g('m_sponsorFirstContractDate').value || '').trim(),
    sponsorFirstContractYears: Number(g('m_sponsorFirstContractYears').value) || 2,
    sponsorRenewalWindowDays: parseInt(g('m_sponsorRenewalWindowDays').value, 10) || 0,
    sponsorLeadTimeDays: parseInt(g('m_sponsorLeadTimeDays').value, 10) || 0,
    sponsorPrevContractDate,
    sponsorRenewalDueDate: sponsorCalc.renewalDueDate,
    sponsorRenewalCheckDate: sponsorCalc.renewalCheckDate,
    mediaFeeEx: parseMoneyInput(g('m_mediaFeeEx').value),
    mediaFeeIncludeFirstInvoice: !!g('m_mediaFeeIncludeFirstInvoice').checked,
    landlordName: (g('m_landlordName').value || '').trim(),
    landlordTel: (g('m_landlordTel').value || '').trim(),
    landlordAddress: (g('m_landlordAddress').value || '').trim(),
    landlordFirstContractDate: (g('m_landlordFirstContractDate').value || '').trim(),
    landlordFirstContractYears: Number(g('m_landlordFirstContractYears').value) || 2,
    landlordRenewalWindowDays: parseInt(g('m_landlordRenewalWindowDays').value, 10) || 0,
    landlordLeadTimeDays: parseInt(g('m_landlordLeadTimeDays').value, 10) || 0,
    landlordPrevContractDate,
    landlordRenewalDueDate: landlordCalc.renewalDueDate,
    landlordRenewalCheckDate: landlordCalc.renewalCheckDate,
    landlordRentEx: parseMoneyInput(g('m_landlordRentEx').value),
    landlordRentIncludeFirstInvoice: !!g('m_landlordRentIncludeFirstInvoice').checked,
    propertyLocation: (g('m_propertyLocation').value || '').trim(),
    size: (g('m_size').value || '').trim(),
    remarks: (g('m_remarks').value || '').trim(),
    outdoorAdApplied,
    outdoorAdCompany,
    outdoorAdApplication: outdoorAdCompany ? `${outdoorAdApplied ? '◯' : '×'}\n${outdoorAdCompany}` : outdoorAdApplied ? '◯' : '×',
    removalCostEx: parseMoneyInput(g('m_removalCostEx').value),
    cancellationRecruitable: g('m_cancellationRecruitable').value || '要協議',
  };
}

function writeForm(m) {
  const z = {
    sponsorFirstContractYears: 2,
    sponsorRenewalWindowDays: 2,
    sponsorLeadTimeDays: 1,
    landlordFirstContractYears: 2,
    landlordRenewalWindowDays: 1,
    landlordLeadTimeDays: 1,
    sponsorContractCompany: 'TOC',
    landlordContractCompany: 'TOC',
    cancellationRecruitable: '要協議',
    mediaFeeIncludeFirstInvoice: true,
    landlordRentIncludeFirstInvoice: true,
  };
  const d = { ...z, ...(m || {}) };
  const set = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.value = v ?? '';
  };
  set('media_edit_id', d.id || '');
  set('media_sponsor_prev_contract_date', d.sponsorPrevContractDate || '');
  set('media_landlord_prev_contract_date', d.landlordPrevContractDate || '');
  renderCaseOptions(d.caseId || '');
  syncCaseLinkedFields();
  set('media_contract_status', d.contractStatus || '新規');
  set('m_sponsorContractCompany', d.sponsorContractCompany || 'TOC');
  set('m_landlordContractCompany', d.landlordContractCompany || 'TOC');
  set('m_sponsorTel', d.sponsorTel || '');
  set('m_designFace', d.designFace || '');
  set('m_sponsorFirstContractDate', d.sponsorFirstContractDate || '');
  set('m_sponsorFirstContractYears', d.sponsorFirstContractYears);
  set('m_sponsorRenewalWindowDays', d.sponsorRenewalWindowDays);
  set('m_sponsorLeadTimeDays', d.sponsorLeadTimeDays);
  set('m_mediaFeeEx', d.mediaFeeEx || '');
  document.getElementById('m_mediaFeeIncludeFirstInvoice').checked = !!d.mediaFeeIncludeFirstInvoice;
  set('m_landlordName', d.landlordName || '');
  set('m_landlordTel', d.landlordTel || '');
  set('m_landlordAddress', d.landlordAddress || '');
  set('m_landlordFirstContractDate', d.landlordFirstContractDate || '');
  set('m_landlordFirstContractYears', d.landlordFirstContractYears);
  set('m_landlordRenewalWindowDays', d.landlordRenewalWindowDays);
  set('m_landlordLeadTimeDays', d.landlordLeadTimeDays);
  set('m_landlordRentEx', d.landlordRentEx || '');
  document.getElementById('m_landlordRentIncludeFirstInvoice').checked = !!d.landlordRentIncludeFirstInvoice;
  set('m_propertyLocation', d.propertyLocation || '');
  set('m_size', d.size || '');
  set('m_remarks', d.remarks || '');
  document.getElementById('m_outdoorAdApplied').checked = !!d.outdoorAdApplied;
  set('m_outdoorAdCompany', d.outdoorAdCompany || '');
  set('m_removalCostEx', d.removalCostEx || '');
  set('m_cancellationRecruitable', d.cancellationRecruitable || '要協議');
  set('media_changeNote', '');
  document.getElementById('mediaFormDelete').hidden = !d.id;
  updatePreview();
}

function updatePreview() {
  const r = readForm();
  document.getElementById('m_sponsorRenewalDueDatePreview').textContent = r.sponsorRenewalDueDate || '—';
  document.getElementById('m_sponsorRenewalCheckDatePreview').textContent = r.sponsorRenewalCheckDate || '—';
  document.getElementById('m_landlordRenewalDueDatePreview').textContent = r.landlordRenewalDueDate || '—';
  document.getElementById('m_landlordRenewalCheckDatePreview').textContent = r.landlordRenewalCheckDate || '—';
}

document.addEventListener('DOMContentLoaded', () => {
  TocDataStore.ensureInit();
  const params = new URLSearchParams(location.search);
  const id = params.get('id') || '';
  const initialCaseId = (params.get('caseId') || '').trim();
  const cur = id ? TocDataStore.getMediaRecords().find(x => x.id === id) : null;
  if (cur && !cur.sponsorPrevContractDate) cur.sponsorPrevContractDate = latestLogPrevDate(cur.sponsorRenewalLogs);
  if (cur && !cur.landlordPrevContractDate) cur.landlordPrevContractDate = latestLogPrevDate(cur.landlordRenewalLogs);
  currentEditingRecord = cur || null;
  if (cur) document.getElementById('mediaFormPageTitle').textContent = '媒体編集';
  writeForm(cur || (initialCaseId ? { caseId: initialCaseId } : {}));
  enhanceSearchableSelect(document.getElementById('m_caseId'), '見積No.・取引先・物件名で検索');

  document.getElementById('m_caseId')?.addEventListener('change', () => {
    syncCaseLinkedFields();
    updatePreview();
  });
  [
    'm_sponsorFirstContractDate', 'm_sponsorFirstContractYears', 'm_sponsorRenewalWindowDays',
    'm_sponsorLeadTimeDays', 'm_landlordFirstContractDate', 'm_landlordFirstContractYears',
    'm_landlordRenewalWindowDays', 'm_landlordLeadTimeDays',
  ].forEach(id2 => {
    document.getElementById(id2)?.addEventListener('input', updatePreview);
    document.getElementById(id2)?.addEventListener('change', updatePreview);
  });

  document.getElementById('mediaEditForm')?.addEventListener('submit', e => {
    e.preventDefault();
    const raw = readForm();
    if (!raw.caseId) {
      alert('案件（区分: 媒体）を選択してください。');
      return;
    }
    const prev = raw.id ? TocDataStore.getMediaRecords().find(x => x.id === raw.id) : null;
    const sponsorRenewalLogs = Array.isArray(prev?.sponsorRenewalLogs) ? [...prev.sponsorRenewalLogs] : [];
    const landlordRenewalLogs = Array.isArray(prev?.landlordRenewalLogs) ? [...prev.landlordRenewalLogs] : [];
    if (raw.contractStatus === '更新') {
      sponsorRenewalLogs.push({ at: new Date().toISOString(), prevContractDate: raw.sponsorPrevContractDate || '', dueDate: raw.sponsorRenewalDueDate || '' });
      landlordRenewalLogs.push({ at: new Date().toISOString(), prevContractDate: raw.landlordPrevContractDate || '', dueDate: raw.landlordRenewalDueDate || '' });
    }
    const merged = { ...(prev || {}), ...raw, sponsorRenewalLogs, landlordRenewalLogs, changeHistory: prev?.changeHistory || [] };
    const note = (document.getElementById('media_changeNote').value || '').trim();
    const autoLog = buildMediaAutoChangeLog(prev, merged);
    const savedId = TocDataStore.upsertMediaRecord(merged);
    if (autoLog) TocDataStore.appendMediaHistory(savedId, autoLog);
    if (note) TocDataStore.appendMediaHistory(savedId, note);
    location.href = 'media-mgmt.html';
  });

  document.getElementById('mediaFormDelete')?.addEventListener('click', () => {
    const id2 = document.getElementById('media_edit_id').value.trim();
    if (!id2 || !confirm('この行を削除しますか？')) return;
    TocDataStore.deleteMediaRecord(id2);
    location.href = 'media-mgmt.html';
  });
});
