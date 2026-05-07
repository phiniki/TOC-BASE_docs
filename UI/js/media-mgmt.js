/**
 * 媒体管理 一覧
 */

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatMoneyYen(n) {
  const x = Number(n);
  if (!Number.isFinite(x) || x === 0) return '—';
  return '¥' + Math.round(x).toLocaleString('ja-JP');
}

function cellText(v) {
  const s = String(v ?? '').trim();
  return s ? escapeHtml(s) : '—';
}

function getCaseById(caseId) {
  if (!caseId) return null;
  return TocDataStore.getState().cases.find(c => c.caseId === caseId) || null;
}

function contractCompanyLabel(m) {
  const s = String(m.sponsorContractCompany || '').trim();
  const l = String(m.landlordContractCompany || '').trim();
  if (!s && !l) return '—';
  if (s && l) return s === l ? s : `${s} / ${l}`;
  return s || l;
}

function outdoorAdLabel(m) {
  const mark = m.outdoorAdApplied ? '◯' : '×';
  const company = String(m.outdoorAdCompany || '').trim();
  return company ? `${mark}<br>${escapeHtml(company)}` : mark;
}


function getCaseFilterFromUrl() {
  const caseId = new URLSearchParams(location.search).get('caseId') || '';
  return caseId.trim();
}

function isDueOrPastDateYmd(ymd) {
  const s = String(ymd || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const today = new Date();
  const localToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate()
  ).padStart(2, '0')}`;
  return s <= localToday;
}

function parseYmdToMs(v) {
  const s = String(v || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return Number.POSITIVE_INFINITY;
  const t = Date.parse(`${s}T00:00:00`);
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
}

function mediaDefaultSortKeyMs(m) {
  const sponsorCheck = parseYmdToMs(m.sponsorRenewalCheckDate);
  const landlordCheck = parseYmdToMs(m.landlordRenewalCheckDate);
  return Math.min(sponsorCheck, landlordCheck);
}

function buildMediaRow(m) {
  const c = getCaseById(m.caseId);
  const estimateNo = m.estimateNo || c?.estimateNo || '';
  const sponsorName = m.sponsor || c?.client || '';
  const checkOverdue =
    isDueOrPastDateYmd(m.sponsorRenewalCheckDate) || isDueOrPastDateYmd(m.landlordRenewalCheckDate);
  const dueOverdue =
    isDueOrPastDateYmd(m.sponsorRenewalDueDate) || isDueOrPastDateYmd(m.landlordRenewalDueDate);
  const tr = document.createElement('tr');
  tr.dataset.mediaId = m.id;
  tr.classList.toggle('media-row--alert-red', dueOverdue);
  tr.classList.toggle('media-row--alert-yellow', !dueOverdue && checkOverdue);
  const histCount = Array.isArray(m.changeHistory) ? m.changeHistory.length : 0;
  tr.innerHTML = `
    <td class="col-sticky-media media-cell--mono">${cellText(estimateNo)}</td>
    <td>${cellText(m.contractStatus)}</td>
    <td class="media-cell--clip">${contractCompanyLabel(m)}</td>
    <td class="media-cell--clip">${cellText(sponsorName)}</td>
    <td class="media-cell--mono">${cellText(m.sponsorTel)}</td>
    <td class="media-cell--clip">${cellText(m.designFace)}</td>
    <td class="media-cell--mono">${cellText(m.sponsorFirstContractDate)}</td>
    <td class="media-cell--mono">${cellText(m.sponsorRenewalCheckDate)}</td>
    <td class="media-cell--mono">${cellText(m.sponsorRenewalDueDate)}</td>
    <td class="num">${formatMoneyYen(m.mediaFeeEx)}</td>
    <td class="media-cell--clip">${cellText(m.landlordName)}</td>
    <td class="media-cell--mono">${cellText(m.landlordTel)}</td>
    <td class="media-cell--clip">${cellText(m.landlordAddress)}</td>
    <td class="media-cell--mono">${cellText(m.landlordFirstContractDate)}</td>
    <td class="media-cell--mono">${cellText(m.landlordRenewalCheckDate)}</td>
    <td class="media-cell--mono">${cellText(m.landlordRenewalDueDate)}</td>
    <td class="num">${formatMoneyYen(m.landlordRentEx)}</td>
    <td class="media-cell--clip">${cellText(m.propertyLocation)}</td>
    <td class="media-cell--clip">${cellText(m.size)}</td>
    <td class="media-cell--actions">
      <button type="button" class="link-action link-action--btn js-media-remarks">表示</button>
    </td>
    <td class="media-cell--clip">${outdoorAdLabel(m)}</td>
    <td class="num">${formatMoneyYen(m.removalCostEx)}</td>
    <td>${cellText(m.cancellationRecruitable)}</td>
    <td class="media-cell--actions">
      <button type="button" class="link-action link-action--btn js-media-history" data-count="${histCount}">
        履歴${histCount ? `（${histCount}）` : ''}
      </button>
    </td>
    <td class="media-cell--actions">
      <button type="button" class="link-action link-action--btn js-media-edit">編集</button>
    </td>
  `;
  return tr;
}

function hydrateMediaTable() {
  const tbody = document.getElementById('mediaTableBody');
  const countEl = document.getElementById('mediaRowCount');
  if (!tbody || !window.TocDataStore) return;
  TocDataStore.ensureInit();
  const q = (document.getElementById('mediaSearchInput')?.value || '').trim().toLowerCase();
  let rows = TocDataStore.getMediaRecords();
  const caseFilterId = getCaseFilterFromUrl();
  if (caseFilterId) rows = rows.filter(m => String(m.caseId || '').trim() === caseFilterId);
  if (q) {
    rows = rows.filter(m => JSON.stringify(m).toLowerCase().includes(q));
  }
  rows.sort((a, b) => {
    const ka = mediaDefaultSortKeyMs(a);
    const kb = mediaDefaultSortKeyMs(b);
    if (ka !== kb) return ka - kb;
    const ea = String(a.estimateNo || '');
    const eb = String(b.estimateNo || '');
    const c0 = ea.localeCompare(eb, 'ja', { numeric: true });
    if (c0 !== 0) return c0;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });
  tbody.innerHTML = '';
  rows.forEach(m => tbody.appendChild(buildMediaRow(m)));
  if (countEl) countEl.textContent = `${rows.length} 件`;
}

function openRemarksPanel(m) {
  const panel = document.getElementById('mediaRemarksDialog');
  const body = document.getElementById('mediaRemarksBody');
  const lead = document.getElementById('mediaRemarksLead');
  if (!panel || !body) return;
  const c = getCaseById(m.caseId);
  const est = (m.estimateNo && String(m.estimateNo).trim()) || c?.estimateNo || '—';
  if (lead) lead.textContent = `見積 ${est} / ${m.sponsor || c?.client || '—'}`;
  const text = String(m.remarks ?? '').trim();
  body.innerHTML = text
    ? `<p class="media-remarks-text">${escapeHtml(text)}</p>`
    : '<p class="media-history-empty">備考はありません。</p>';
  if (panel.showModal) panel.showModal();
}

function openHistoryPanel(m) {
  const panel = document.getElementById('mediaHistoryDialog');
  const body = document.getElementById('mediaHistoryBody');
  const lead = document.getElementById('mediaHistoryLead');
  if (!panel || !body) return;
  const c = getCaseById(m.caseId);
  const est = (m.estimateNo && String(m.estimateNo).trim()) || c?.estimateNo || '—';
  if (lead) lead.textContent = `見積 ${est} / ${m.sponsor || c?.client || '—'}`;
  const hist = Array.isArray(m.changeHistory) ? [...m.changeHistory] : [];
  const sponsorLogs = Array.isArray(m.sponsorRenewalLogs)
    ? m.sponsorRenewalLogs.map(x => ({ at: x.at, text: `スポンサー更新: 前回契約日 ${x.prevContractDate || '—'} / 期日 ${x.dueDate || '—'}` }))
    : [];
  const landlordLogs = Array.isArray(m.landlordRenewalLogs)
    ? m.landlordRenewalLogs.map(x => ({ at: x.at, text: `地主更新: 前回契約日 ${x.prevContractDate || '—'} / 期日 ${x.dueDate || '—'}` }))
    : [];
  hist.push(...sponsorLogs, ...landlordLogs);
  hist.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  body.innerHTML = hist.length
    ? hist
        .map(
          h =>
            `<div class="media-history-item"><time class="media-history-item__at">${escapeHtml(
              (h.at || '').replace('T', ' ').slice(0, 19)
            )}</time><p class="media-history-item__text">${escapeHtml(h.text || '')}</p></div>`
        )
        .join('')
    : '<p class="media-history-empty">履歴はまだありません。</p>';
  if (panel.showModal) panel.showModal();
}

document.addEventListener('DOMContentLoaded', () => {
  if (!window.TocDataStore || !document.getElementById('mediaTableBody')) return;
  TocDataStore.ensureInit();
  hydrateMediaTable();

  document.getElementById('mediaSearchInput')?.addEventListener('input', hydrateMediaTable);
  document.getElementById('btnMediaNew')?.addEventListener('click', () => {
    const caseFilterId = getCaseFilterFromUrl();
    location.href = caseFilterId ? `media-mgmt-form.html?caseId=${encodeURIComponent(caseFilterId)}` : 'media-mgmt-form.html';
  });

  document.getElementById('mediaTableBody')?.addEventListener('click', e => {
    const editBtn = e.target.closest('.js-media-edit');
    const histBtn = e.target.closest('.js-media-history');
    const remarksBtn = e.target.closest('.js-media-remarks');
    const tr = editBtn?.closest('tr') || histBtn?.closest('tr') || remarksBtn?.closest('tr');
    const id = tr?.dataset.mediaId;
    if (!id) return;
    const m = TocDataStore.getMediaRecords().find(x => x.id === id);
    if (!m) return;
    if (editBtn) location.href = `media-mgmt-form.html?id=${encodeURIComponent(id)}`;
    if (histBtn) openHistoryPanel(m);
    if (remarksBtn) openRemarksPanel(m);
  });

  document.getElementById('mediaHistoryClose')?.addEventListener('click', () => {
    const p = document.getElementById('mediaHistoryDialog');
    p?.close?.();
  });
  document.getElementById('mediaRemarksClose')?.addEventListener('click', () => {
    const p = document.getElementById('mediaRemarksDialog');
    p?.close?.();
  });
});
