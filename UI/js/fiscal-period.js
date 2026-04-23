/**
 * 会計期（1期＝2013年度＝2013年9月〜2014年8月、9月始まり12ヶ月）
 * UIの「◯期目 ◯月」の◯月は暦月（例: 1期目9月＝2013年9月、1期目3月＝2014年3月）。
 * 内部インデックス mi=1..12 は期首からの並び（1＝9月…12＝翌8月）で保持。
 */
(function (global) {
  /** 第1期の期首が属する暦年（2013年9月が1期目の開始） */
  const FIRST_FISCAL_YEAR_START = 2013;

  function calendarToFiscal(year, calMonth) {
    let ki;
    let mi;
    if (calMonth >= 9) {
      ki = year - (FIRST_FISCAL_YEAR_START - 1);
      mi = calMonth - 8;
    } else {
      ki = year - FIRST_FISCAL_YEAR_START;
      mi = calMonth + 4;
    }
    return { ki, mi };
  }

  function fiscalToCalendarYearMonth(ki, fiscalMonthInPeriod) {
    let y;
    let m;
    if (fiscalMonthInPeriod >= 1 && fiscalMonthInPeriod <= 4) {
      y = FIRST_FISCAL_YEAR_START - 1 + ki;
      m = fiscalMonthInPeriod + 8;
    } else if (fiscalMonthInPeriod >= 5 && fiscalMonthInPeriod <= 12) {
      y = FIRST_FISCAL_YEAR_START + ki;
      m = fiscalMonthInPeriod - 4;
    } else {
      throw new RangeError('fiscal month must be 1-12');
    }
    return { y, m };
  }

  function fiscalToYyyyMm(ki, fiscalMonthInPeriod) {
    const { y, m } = fiscalToCalendarYearMonth(ki, fiscalMonthInPeriod);
    return `${y}-${String(m).padStart(2, '0')}`;
  }

  function calendarYmToFiscal(ym) {
    const p = String(ym || '')
      .trim()
      .match(/^(\d{4})-(\d{2})/);
    if (!p) return null;
    return calendarToFiscal(parseInt(p[1], 10), parseInt(p[2], 10));
  }

  /** mi（1=期内先頭の9月 … 12=翌8月）に対応する暦月 1–12 */
  function fiscalMonthIndexToCalendarMonth(fiscalMonthInPeriod) {
    if (fiscalMonthInPeriod < 1 || fiscalMonthInPeriod > 12) {
      throw new RangeError('fiscal month must be 1-12');
    }
    if (fiscalMonthInPeriod <= 4) return fiscalMonthInPeriod + 8;
    return fiscalMonthInPeriod - 4;
  }

  function formatKiGetsu(ki, mi) {
    const calM = fiscalMonthIndexToCalendarMonth(mi);
    return `${ki}期目 ${calM}月`;
  }

  function fiscalYearRangeJa(ki) {
    const a = fiscalToCalendarYearMonth(ki, 1);
    const b = fiscalToCalendarYearMonth(ki, 12);
    return `${a.y}年${a.m}月〜${b.y}年${b.m}月`;
  }

  function currentFiscal() {
    const d = new Date();
    return calendarToFiscal(d.getFullYear(), d.getMonth() + 1);
  }

  global.TocFiscal = {
    FIRST_FISCAL_YEAR_START,
    calendarToFiscal,
    fiscalToCalendarYearMonth,
    fiscalToYyyyMm,
    calendarYmToFiscal,
    fiscalMonthIndexToCalendarMonth,
    formatKiGetsu,
    fiscalYearRangeJa,
    currentFiscal,
  };
})(typeof window !== 'undefined' ? window : globalThis);
