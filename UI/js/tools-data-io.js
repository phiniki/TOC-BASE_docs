/** データ入出力ページ: 現状メニュー・ヘッダから未リンク。復活時は tools-data-io.html へ導線を追加。 */
document.addEventListener('DOMContentLoaded', () => {
  if (!window.TocDataStore) return;
  TocDataStore.ensureInit();

  const dl = document.getElementById('btnExportJson');
  const imp = document.getElementById('importJsonFile');
  const btnImp = document.getElementById('btnImportJson');

  if (dl) {
    dl.addEventListener('click', () => {
      const blob = new Blob([TocDataStore.exportFullJson()], { type: 'application/json;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'toc-base-export.json';
      a.click();
      URL.revokeObjectURL(a.href);
    });
  }
  if (btnImp && imp) {
    btnImp.addEventListener('click', () => imp.click());
  }
  if (imp) {
    imp.addEventListener('change', () => {
      const f = imp.files && imp.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        try {
          TocDataStore.importFullJson(String(r.result));
          alert('インポートが完了しました。');
        } catch (e) {
          alert('インポートに失敗しました。JSONの形式を確認してください。');
        }
        imp.value = '';
      };
      r.readAsText(f, 'UTF-8');
    });
  }
});
