/**
 * サイドバーのアクティブ状態を body[data-nav] に同期
 * スマホ: ハンバーガーでドロワーメニュー
 */
document.addEventListener('DOMContentLoaded', () => {
  const key = document.body.dataset.nav;
  if (key) {
    document.querySelectorAll('.sidebar-nav__link[data-nav]').forEach(a => {
      a.classList.toggle('is-active', a.dataset.nav === key);
    });
  }
  if (window.TocDataStore) {
    try {
      TocDataStore.ensureInit();
    } catch {
      /* no-op */
    }
  }
  initMobileNav();
});

function initMobileNav() {
  const shell = document.querySelector('.app-shell');
  const sidebar = document.querySelector('.app-sidebar');
  const header = document.querySelector('.app-header');
  if (!shell || !sidebar || !header || header.querySelector('.app-header__menu-btn')) return;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'app-header__menu-btn';
  btn.setAttribute('aria-label', 'メニューを開く');
  btn.setAttribute('aria-expanded', 'false');
  btn.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>';

  header.insertBefore(btn, header.firstChild);

  const backdrop = document.createElement('div');
  backdrop.className = 'app-sidebar-backdrop';
  backdrop.setAttribute('aria-hidden', 'true');
  shell.appendChild(backdrop);

  const close = () => {
    shell.classList.remove('app-shell--nav-open');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-label', 'メニューを開く');
    backdrop.classList.remove('is-visible');
    document.body.style.overflow = '';
  };

  const open = () => {
    shell.classList.add('app-shell--nav-open');
    btn.setAttribute('aria-expanded', 'true');
    btn.setAttribute('aria-label', 'メニューを閉じる');
    backdrop.classList.add('is-visible');
    document.body.style.overflow = 'hidden';
  };

  btn.addEventListener('click', () => {
    if (shell.classList.contains('app-shell--nav-open')) close();
    else open();
  });

  backdrop.addEventListener('click', close);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && shell.classList.contains('app-shell--nav-open')) {
      e.preventDefault();
      close();
    }
  });

  sidebar.addEventListener('click', e => {
    if (window.matchMedia('(max-width: 768px)').matches && e.target.closest('.sidebar-nav__link')) {
      close();
    }
  });

  window.addEventListener('resize', () => {
    if (!window.matchMedia('(max-width: 768px)').matches) close();
  });
}
