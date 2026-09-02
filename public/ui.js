(function () {
  function ensureDialog() {
    if (document.getElementById('app-message-dialog')) return;

    const style = document.createElement('style');
    style.textContent = `
      .app-dialog-backdrop {
        position: fixed;
        inset: 0;
        display: none;
        align-items: center;
        justify-content: center;
        background: rgba(10, 10, 15, .68);
        padding: 18px;
        z-index: 9999;
      }
      .app-dialog-backdrop.open { display: flex; }
      .app-dialog {
        width: min(420px, 100%);
        background: #ffffff;
        color: #111827;
        border: 1px solid #d8dee8;
        border-radius: 12px;
        box-shadow: 0 24px 80px rgba(0, 0, 0, .28);
        overflow: hidden;
      }
      .app-dialog-head {
        padding: 16px 18px 10px;
        border-bottom: 1px solid #eef2f5;
      }
      .app-dialog-title {
        margin: 0;
        font-size: 16px;
        font-weight: 900;
      }
      .app-dialog-body {
        padding: 14px 18px 6px;
        color: #344054;
        font-size: 14px;
        line-height: 1.45;
        white-space: pre-wrap;
      }
      .app-dialog-actions {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        padding: 14px 18px 18px;
      }
      .app-dialog-button {
        border: 0;
        border-radius: 8px;
        background: #101820;
        color: #ffffff;
        min-height: 42px;
        padding: 0 18px;
        font-weight: 800;
        cursor: pointer;
      }
      .app-dialog-button:focus {
        outline: 3px solid rgba(217, 164, 65, .35);
        outline-offset: 2px;
      }
      @media (max-width: 480px) {
        .app-dialog-backdrop { align-items: flex-end; padding: 12px; }
        .app-dialog { border-radius: 12px; }
        .app-dialog-actions { display: grid; }
        .app-dialog-button { width: 100%; }
      }
    `;

    const dialog = document.createElement('div');
    dialog.id = 'app-message-dialog';
    dialog.className = 'app-dialog-backdrop';
    dialog.innerHTML = `
      <div class="app-dialog" role="dialog" aria-modal="true" aria-labelledby="app-dialog-title">
        <div class="app-dialog-head">
          <p class="app-dialog-title" id="app-dialog-title">Mensaje del sistema</p>
        </div>
        <div class="app-dialog-body" id="app-dialog-message"></div>
        <div class="app-dialog-actions">
          <button class="app-dialog-button" id="app-dialog-ok" type="button">Aceptar</button>
        </div>
      </div>
    `;

    document.head.appendChild(style);
    document.body.appendChild(dialog);

    const close = () => {
      dialog.classList.remove('open');
      document.removeEventListener('keydown', onKeyDown);
    };

    function onKeyDown(event) {
      if (event.key === 'Escape' || event.key === 'Enter') close();
    }

    dialog.querySelector('#app-dialog-ok').addEventListener('click', close);
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) close();
    });
  }

  window.showAppMessage = function (message, title = 'Mensaje del sistema') {
    ensureDialog();
    const dialog = document.getElementById('app-message-dialog');
    document.getElementById('app-dialog-title').textContent = title;
    document.getElementById('app-dialog-message').textContent = String(message || '');
    dialog.classList.add('open');
    document.getElementById('app-dialog-ok').focus();
  };

  window.alert = function (message) {
    window.showAppMessage(message);
  };
})();
