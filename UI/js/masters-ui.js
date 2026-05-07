(function () {
  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function badgeClassClient(st) {
    if (st === '要注意') return 'yellow';
    if (st === '休止') return 'gray';
    return 'green';
  }

  function initClientsList() {
    const tbody = document.getElementById('masterClientsBody');
    if (!tbody) return;
    const countEl = document.getElementById('masterClientsCount');
    const search = document.querySelector('.page-search input[type="search"], .page-search input');
    const fType = document.getElementById('fClientType');
    const fStatus = document.getElementById('fClientStatus');

    function render() {
      TocDataStore.ensureInit();
      let rows = TocDataStore.getState().clients.slice();
      const q = (search?.value || '').trim().toLowerCase();
      const t = fType?.value || '';
      const st = fStatus?.value || '';
      rows = rows.filter(c => {
        if (q) {
          const hay = [c.code, c.name, c.kana, c.phone].join(' ').toLowerCase();
          if (!hay.includes(q)) return false;
        }
        if (t && t !== 'すべて' && c.type !== t) return false;
        if (st && st !== 'すべて' && c.status !== st) return false;
        return true;
      });
      tbody.innerHTML = rows
        .map(c => {
          const bc = badgeClassClient(c.status);
          return (
            '<tr>' +
            '<td class="num">' +
            escapeHtml(c.code) +
            '</td>' +
            '<td><strong>' +
            escapeHtml(c.name) +
            '</strong></td>' +
            '<td>' +
            escapeHtml(c.kana) +
            '</td>' +
            '<td>' +
            escapeHtml(c.type) +
            '</td>' +
            '<td>' +
            escapeHtml(c.salesLead) +
            '</td>' +
            '<td>' +
            escapeHtml(c.phone) +
            '</td>' +
            '<td><span class="badge badge--' +
            bc +
            '">' +
            escapeHtml(c.status) +
            '</span></td>' +
            '<td>' +
            escapeHtml(c.updated) +
            '</td>' +
            '<td class="actions"><a href="master-client-form.html?code=' +
            encodeURIComponent(c.code) +
            '" class="link-action">編集</a></td>' +
            '</tr>'
          );
        })
        .join('');
      if (countEl) countEl.textContent = '全 ' + rows.length + ' 件';
    }

    search?.addEventListener('input', render);
    fType?.addEventListener('change', render);
    fStatus?.addEventListener('change', render);
    render();
  }

  function initClientForm() {
    const mc = document.getElementById('mc');
    if (!mc) return;
    const p = new URLSearchParams(location.search);
    const code = p.get('code');
    let editingCode = code;
    const $ = id => document.getElementById(id);

    if (code) {
      const c = TocDataStore.getState().clients.find(x => x.code === code);
      if (c) {
        $('mc').value = c.code;
        $('mtype').value = c.type;
        $('mname').value = c.name;
        $('mkana').value = c.kana || '';
        $('mphone').value = c.phone || '';
        $('mfax').value = c.fax || '';
        $('memail').value = c.email || '';
        $('mzip').value = c.zip || '';
        $('maddr').value = c.address || '';
        $('mnote').value = c.note || '';
        if (c.salesLead && $('msales')) {
          const o = Array.from($('msales').options).find(op => op.value === c.salesLead);
          if (o) $('msales').value = c.salesLead;
        }
        if (c.status && $('mst')) $('mst').value = c.status;
      }
    } else {
      $('mc').value = TocDataStore.nextClientCode();
    }

    $('btnSaveMasterClient')?.addEventListener('click', () => {
      const row = {
        code: $('mc').value.trim(),
        type: $('mtype').value,
        name: $('mname').value.trim(),
        kana: $('mkana').value.trim(),
        phone: $('mphone').value.trim(),
        fax: $('mfax').value.trim(),
        email: $('memail').value.trim(),
        zip: $('mzip').value.trim(),
        address: $('maddr').value.trim(),
        salesLead: $('msales').value === '—' ? '' : $('msales').value,
        status: $('mst').value,
        note: $('mnote').value.trim(),
        updated: new Date().toISOString().slice(0, 10),
      };
      if (!row.name) {
        alert('取引先名は必須です。');
        return;
      }
      if (!row.code) row.code = TocDataStore.nextClientCode();
      if (editingCode && editingCode !== row.code) {
        alert('取引先コードの変更は非対応です。');
        return;
      }
      TocDataStore.upsertClient(row);
      location.href = 'master-clients.html';
    });
  }

  function roleDot(ok, cls) {
    return ok ? '<span class="badge badge--' + cls + '">●</span>' : '—';
  }

  function initStaffList() {
    const tbody = document.getElementById('masterStaffBody');
    if (!tbody) return;
    const countEl = document.getElementById('masterStaffCount');

    function render() {
      TocDataStore.ensureInit();
      const rows = TocDataStore.getState().staff.slice();
      tbody.innerHTML = rows
        .map(s => {
          return (
            '<tr>' +
            '<td><strong>' +
            escapeHtml(s.name) +
            '</strong></td>' +
            '<td>' +
            roleDot(s.salesOk, 'blue') +
            '</td>' +
            '<td>' +
            roleDot(s.designOk, 'purple') +
            '</td>' +
            '<td><span class="badge badge--green">' +
            escapeHtml(s.status) +
            '</span></td>' +
            '<td class="actions"><a href="master-staff-form.html?code=' +
            encodeURIComponent(s.code) +
            '" class="link-action">編集</a></td>' +
            '</tr>'
          );
        })
        .join('');
      if (countEl) countEl.textContent = '全 ' + rows.length + ' 件';
    }
    render();
  }

  function initStaffForm() {
    if (!document.getElementById('btnSaveMasterStaff')) return;
    const p = new URLSearchParams(location.search);
    const codeParam = p.get('code');
    const $ = id => document.getElementById(id);

    const existing =
      codeParam && TocDataStore.getState().staff.find(x => x.code === codeParam);
    const fixedCode = existing ? existing.code : null;

    if (existing) {
      $('sstat').value = existing.status;
      $('sname').value = existing.name;
      $('sphone').value = existing.phone || '';
      $('sjoin').value = existing.joined || '';
      if ($('chkSalesOk')) $('chkSalesOk').checked = !!existing.salesOk;
      if ($('chkDesignOk')) $('chkDesignOk').checked = !!existing.designOk;
    } else {
      if ($('chkSalesOk')) $('chkSalesOk').checked = true;
    }

    $('btnSaveMasterStaff')?.addEventListener('click', () => {
      const row = {
        code: fixedCode || TocDataStore.nextStaffCode(),
        status: $('sstat').value,
        name: $('sname').value.trim(),
        phone: $('sphone').value.trim(),
        joined: $('sjoin').value,
        salesOk: $('chkSalesOk') ? $('chkSalesOk').checked : false,
        designOk: $('chkDesignOk') ? $('chkDesignOk').checked : false,
      };
      if (!row.name) {
        alert('氏名は必須です。');
        return;
      }
      TocDataStore.upsertStaff(row);
      location.href = 'master-staff.html';
    });
  }

  function categoryCaseCount(catName) {
    return TocDataStore.getState().cases.filter(c => c.category === catName).length;
  }

  function initCategoriesList() {
    const tbody = document.getElementById('masterCategoriesBody');
    if (!tbody) return;
    const countEl = document.getElementById('masterCategoriesCount');

    function render() {
      TocDataStore.ensureInit();
      const rows = TocDataStore.getState().categories.slice().sort((a, b) => (a.sort || 0) - (b.sort || 0));
      tbody.innerHTML = rows
        .map(c => {
          const stClass = c.status === '無効' ? 'gray' : 'green';
          const cnt = categoryCaseCount(c.name);
          return (
            '<tr>' +
            '<td class="num">' +
            escapeHtml(String(c.sort)) +
            '</td>' +
            '<td class="num">' +
            escapeHtml(c.code) +
            '</td>' +
            '<td><strong>' +
            escapeHtml(c.name) +
            '</strong></td>' +
            '<td class="num">' +
            cnt +
            '</td>' +
            '<td>' +
            escapeHtml(c.desc || '') +
            '</td>' +
            '<td><span class="badge badge--' +
            stClass +
            '">' +
            escapeHtml(c.status) +
            '</span></td>' +
            '<td class="actions"><a href="master-category-form.html?code=' +
            encodeURIComponent(c.code) +
            '" class="link-action">編集</a></td>' +
            '</tr>'
          );
        })
        .join('');
      if (countEl) countEl.textContent = '全 ' + rows.length + ' 件';
    }
    render();
  }

  function initCategoryForm() {
    const ccode = document.getElementById('ccode');
    if (!ccode) return;
    const p = new URLSearchParams(location.search);
    const code = p.get('code');
    let editingCode = code;
    const $ = id => document.getElementById(id);

    if (code) {
      const c = TocDataStore.getState().categories.find(x => x.code === code);
      if (c) {
        $('csort').value = String(c.sort ?? '');
        $('ccode').value = c.code;
        $('cname').value = c.name;
        $('cst').value = c.status;
        $('ccolor').value = c.color || '#289B5C';
        $('cdesc').value = c.desc || '';
      }
    } else {
      $('ccode').value = TocDataStore.nextCategoryCode();
      $('csort').value = '80';
    }

    $('btnSaveMasterCategory')?.addEventListener('click', () => {
      const prev = editingCode ? TocDataStore.getState().categories.find(x => x.code === editingCode) : {};
      const row = {
        sort: parseInt($('csort').value, 10) || 0,
        code: $('ccode').value.trim(),
        name: $('cname').value.trim(),
        status: $('cst').value,
        color: $('ccolor').value,
        desc: $('cdesc').value.trim(),
        count: prev?.count ?? 0,
      };
      if (!row.name) {
        alert('カテゴリ名は必須です。');
        return;
      }
      if (!row.code) row.code = TocDataStore.nextCategoryCode();
      if (editingCode && editingCode !== row.code) {
        alert('コードの変更は非対応です。');
        return;
      }
      row.count = categoryCaseCount(row.name);
      TocDataStore.upsertCategory(row);
      location.href = 'master-categories.html';
    });
  }

  function badgeVendor(st) {
    return st === '休止' ? 'gray' : 'green';
  }

  function initVendorsList() {
    const tbody = document.getElementById('masterVendorsBody');
    if (!tbody) return;
    const countEl = document.getElementById('masterVendorsCount');

    function render() {
      TocDataStore.ensureInit();
      const rows = TocDataStore.getState().vendors.slice();
      tbody.innerHTML = rows
        .map(v => {
          const bc = badgeVendor(v.status);
          return (
            '<tr>' +
            '<td class="num">' +
            escapeHtml(v.code) +
            '</td>' +
            '<td><strong>' +
            escapeHtml(v.name) +
            '</strong></td>' +
            '<td>' +
            escapeHtml(v.kana) +
            '</td>' +
            '<td>' +
            escapeHtml(v.type) +
            '</td>' +
            '<td>' +
            escapeHtml(v.phone) +
            '</td>' +
            '<td><span class="badge badge--' +
            bc +
            '">' +
            escapeHtml(v.status) +
            '</span></td>' +
            '<td>' +
            escapeHtml(v.updated) +
            '</td>' +
            '<td class="actions"><a href="master-vendor-form.html?code=' +
            encodeURIComponent(v.code) +
            '" class="link-action">編集</a></td>' +
            '</tr>'
          );
        })
        .join('');
      if (countEl) countEl.textContent = '全 ' + rows.length + ' 件';
    }
    render();
  }

  function initVendorForm() {
    const vcode = document.getElementById('vcode');
    if (!vcode) return;
    const p = new URLSearchParams(location.search);
    const code = p.get('code');
    let editingCode = code;
    const $ = id => document.getElementById(id);

    if (code) {
      const v = TocDataStore.getState().vendors.find(x => x.code === code);
      if (v) {
        $('vcode').value = v.code;
        $('vtype').value = v.type;
        $('vname').value = v.name;
        $('vkana').value = v.kana || '';
        $('vphone').value = v.phone || '';
        $('vfax').value = v.fax || '';
        $('vaddr').value = v.address || '';
        $('vst').value = v.status;
        $('vbank').value = v.bankNote || '';
      }
    } else {
      $('vcode').value = TocDataStore.nextVendorCode();
    }

    $('btnSaveMasterVendor')?.addEventListener('click', () => {
      const row = {
        code: $('vcode').value.trim(),
        type: $('vtype').value,
        name: $('vname').value.trim(),
        kana: $('vkana').value.trim(),
        phone: $('vphone').value.trim(),
        fax: $('vfax').value.trim(),
        address: $('vaddr').value.trim(),
        status: $('vst').value,
        bankNote: $('vbank').value.trim(),
        updated: new Date().toISOString().slice(0, 10),
      };
      if (!row.name) {
        alert('仕入先名は必須です。');
        return;
      }
      if (!row.code) row.code = TocDataStore.nextVendorCode();
      if (editingCode && editingCode !== row.code) {
        alert('コードの変更は非対応です。');
        return;
      }
      TocDataStore.upsertVendor(row);
      location.href = 'master-vendors.html';
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (!window.TocDataStore) return;
    TocDataStore.ensureInit();
    initClientsList();
    initClientForm();
    initStaffList();
    initStaffForm();
    initCategoriesList();
    initCategoryForm();
    initVendorsList();
    initVendorForm();
  });
})();
