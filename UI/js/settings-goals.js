document.addEventListener('DOMContentLoaded', () => {
  if (!window.TocDataStore) return;
  TocDataStore.ensureInit();

  const g = TocDataStore.getGoals();
  const tH1 = document.getElementById('tH1');
  const tH2 = document.getElementById('tH2');
  const tYr = document.getElementById('tYr');
  const gNote = document.getElementById('gNote');
  const fy = document.getElementById('fy');

  function parseGoalNum(el) {
    return parseInt(String(el?.value).replace(/[^\d]/g, ''), 10) || 0;
  }

  function populateFiscalYearSelect(select) {
    if (!select) return;
    select.innerHTML = '';
    if (window.TocFiscal) {
      const cur = TocFiscal.currentFiscal().ki;
      const maxKi = Math.max(cur + 1, 15);
      for (let k = 1; k <= maxKi; k++) {
        const opt = document.createElement('option');
        opt.textContent = `${k}期（${TocFiscal.fiscalYearRangeJa(k)}）`;
        select.appendChild(opt);
      }
    } else {
      ['13期（2025年9月〜2026年8月）', '12期（2024年9月〜2025年8月）'].forEach(text => {
        const opt = document.createElement('option');
        opt.textContent = text;
        select.appendChild(opt);
      });
    }
  }

  function selectMatchingFy(select, saved) {
    if (!select || !saved) return;
    for (let i = 0; i < select.options.length; i++) {
      if (select.options[i].textContent === saved) {
        select.selectedIndex = i;
        return;
      }
    }
    if (window.TocFiscal) {
      const cur = TocFiscal.currentFiscal().ki;
      for (let i = 0; i < select.options.length; i++) {
        if (select.options[i].textContent.startsWith(`${cur}期（`)) {
          select.selectedIndex = i;
          return;
        }
      }
    }
    if (select.options.length) select.selectedIndex = 0;
  }

  populateFiscalYearSelect(fy);
  selectMatchingFy(fy, g.fiscalYear);

  if (tH1) tH1.value = (Number(g.targetH1) || 0).toLocaleString('ja-JP');
  if (tH2) tH2.value = (Number(g.targetH2) || 0).toLocaleString('ja-JP');
  if (gNote) gNote.value = g.note || '';

  function refreshTotal() {
    const a = parseGoalNum(tH1);
    const b = parseGoalNum(tH2);
    if (tYr) tYr.value = (a + b).toLocaleString('ja-JP');
  }

  if (tH1) tH1.addEventListener('input', refreshTotal);
  if (tH2) tH2.addEventListener('input', refreshTotal);
  refreshTotal();

  document.getElementById('btnSaveGoals')?.addEventListener('click', () => {
    TocDataStore.setGoals({
      fiscalYear: fy?.selectedOptions[0]?.textContent || g.fiscalYear,
      targetH1: parseGoalNum(tH1),
      targetH2: parseGoalNum(tH2),
      note: gNote?.value || '',
    });
    alert('保存しました。ダッシュボードの目標値に反映されます。');
  });
});
