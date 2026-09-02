const API = '/api';

let activeField = 'numero';

function getToken() { return localStorage.getItem('token'); }
function getDrawId() { return localStorage.getItem('draw_id'); }
function money(value) { return Number(value || 0).toLocaleString('es-CR'); }
function numberValue(id) { return parseInt(document.getElementById(id).value.replace(/\D/g, '') || '0', 10); }

function authHeaders(extra = {}) {
  return {
    Accept: 'application/json',
    Authorization: `Bearer ${getToken()}`,
    ...extra,
  };
}

function clearSession() {
  [
    'token',
    'vendedor_nombre',
    'tenant_nombre',
    'draw_id',
    'draw_nombre',
    'draw_hora',
  ].forEach(key => localStorage.removeItem(key));
}

async function logout() {
  try {
    if (getToken()) {
      await fetch(`${API}/logout`, {
        method: 'POST',
        headers: authHeaders(),
      });
    }
  } catch {
    //
  }

  clearSession();
  window.location.href = '/?v=6';
}

async function parseJsonResponse(res) {
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return res.json();
  return { message: await res.text() };
}

async function handleAuthFailure(res) {
  if (res.status !== 401 && res.status !== 419) return false;
  clearSession();
  alert('La sesion vencio. Inicia sesion de nuevo.');
  window.location.href = '/?v=6';
  return true;
}

async function login() {
  const phone = document.getElementById('phone').value;
  const pin = document.getElementById('pin').value;

  const res = await fetch(`${API}/login`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, pin }),
  });

  if (!res.ok) {
    alert('Telefono o PIN incorrecto');
    return;
  }

  const data = await res.json();
  localStorage.setItem('token', data.token);
  localStorage.setItem('vendedor_nombre', data.user.name);
  localStorage.setItem('tenant_nombre', data.user.tenant_name || 'Loteria');
  showApp();
  cargarSorteos();
  cargarDashboard();
}

function showApp() {
  window.scrollTo(0, 0);
  document.documentElement.scrollLeft = 0;
  document.body.scrollLeft = 0;
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-screen').style.display = 'grid';
  document.getElementById('tenant-label').textContent = localStorage.getItem('tenant_nombre') || 'Loteria';
  document.getElementById('seller-label').textContent = localStorage.getItem('vendedor_nombre') || '';
  setActiveField(activeField);
  updateSummary();
}

async function cargarSorteos() {
  const res = await fetch(`${API}/draws/open`, {
    headers: authHeaders(),
  });
  if (await handleAuthFailure(res)) return;
  const draws = await res.json();

  const list = document.getElementById('draws-list');
  document.getElementById('draw-count').textContent = `${draws.length} abiertos`;
  list.innerHTML = draws.map(d => {
    const name = d.name || d.game_type;
    const time = new Date(d.draw_datetime).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' });
    return `
      <button class="chip ${d.id == getDrawId() ? 'active' : ''}" onclick="seleccionarSorteo(${d.id}, '${name.replace(/'/g, '')}', '${time}')">
        ${name} ${time}
      </button>
    `;
  }).join('');

  if (draws.length === 0) {
    list.innerHTML = '<div class="empty-state">No hay sorteos abiertos para vender.</div>';
  }

  if (draws.length === 1 && !getDrawId()) {
    const name = draws[0].name || draws[0].game_type;
    const time = new Date(draws[0].draw_datetime).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' });
    seleccionarSorteo(draws[0].id, name, time);
  } else {
    updateDrawLabel();
  }
}

function seleccionarSorteo(id, nombre, hora = '') {
  localStorage.setItem('draw_id', id);
  localStorage.setItem('draw_nombre', nombre || '');
  localStorage.setItem('draw_hora', hora || '');
  cargarSorteos();
  updateDrawLabel();
}

function updateDrawLabel() {
  const nombre = localStorage.getItem('draw_nombre');
  const hora = localStorage.getItem('draw_hora');
  document.getElementById('active-draw-label').textContent = nombre ? `${nombre}${hora ? ` - ${hora}` : ''}` : 'Selecciona un sorteo';
}

function setActiveField(field) {
  activeField = field;
  document.querySelectorAll('[data-target]').forEach(el => {
    el.classList.toggle('active', el.dataset.target === field);
  });
  const labels = { numero: 'Numero', monto: 'Monto numero', 'monto-reventado': 'Monto reventado' };
  document.getElementById('active-field-label').textContent = labels[field] || 'Campo';
}

function pressDigit(digit) {
  const input = document.getElementById(activeField);
  const max = activeField === 'numero' ? 3 : 7;
  const current = input.value.replace(/\D/g, '');
  if (current.length >= max) return;
  input.value = current + digit;
  if (activeField === 'numero' && input.value.length >= 2) consultarCupo();
  updateSummary();
}

function backspaceActiveField() {
  const input = document.getElementById(activeField);
  input.value = input.value.slice(0, -1);
  if (activeField === 'numero') consultarCupo();
  updateSummary();
}

function clearActiveField() {
  document.getElementById(activeField).value = '';
  if (activeField === 'numero') document.getElementById('cupo-info').textContent = '';
  updateSummary();
}

function addQuickAmount(amount) {
  if (activeField === 'numero') setActiveField('monto');
  const input = document.getElementById(activeField);
  input.value = String(numberValue(activeField) + amount);
  updateSummary();
}

function toggleReventado() {
  const enabled = document.getElementById('con-reventado').checked;
  document.getElementById('reventado-field').style.display = enabled ? 'block' : 'none';
  if (enabled) {
    setActiveField('monto-reventado');
  } else {
    document.getElementById('monto-reventado').value = '';
    setActiveField('monto');
  }
  updateSummary();
}

function updateSummary() {
  const monto = numberValue('monto');
  const addon = document.getElementById('con-reventado').checked ? numberValue('monto-reventado') : 0;
  document.getElementById('summary-main').textContent = money(monto);
  document.getElementById('summary-addon').textContent = money(addon);
  document.getElementById('summary-total').textContent = money(monto + addon);
}

function ventaPayload() {
  const rawNumero = document.getElementById('numero').value.replace(/\D/g, '');
  const conReventado = document.getElementById('con-reventado').checked;

  return {
    draw_id: getDrawId(),
    number_played: rawNumero.padStart(2, '0'),
    amount: numberValue('monto'),
    with_addon: conReventado,
    addon_amount: conReventado ? numberValue('monto-reventado') : 0,
  };
}

async function registrarVenta() {
  const venta = ventaPayload();
  const rawNumero = document.getElementById('numero').value.replace(/\D/g, '');

  if (!venta.draw_id) { alert('Elegi un sorteo primero'); return; }
  if (!rawNumero) { alert('Falta el numero'); return; }
  if (!venta.amount) { alert('Falta el monto del numero'); return; }
  if (venta.with_addon && !venta.addon_amount) { alert('Falta el monto del Reventado'); return; }

  if (!navigator.onLine) {
    guardarVentaPendiente(venta);
    agregarVentaALista(venta);
    sumarVentaEnResumen(venta);
    limpiarFormulario();
    mostrarTicket(venta, false);
    return;
  }

  try {
    const res = await fetch(`${API}/sales`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(venta),
    });
    if (await handleAuthFailure(res)) return;

    if (!res.ok) {
      const err = await parseJsonResponse(res);
      alert(err.message || 'No se pudo registrar la venta');
      return;
    }

    const creada = await res.json();
    agregarVentaALista(creada);
    sumarVentaEnResumen(creada);
    limpiarFormulario();
    mostrarTicket({ ...venta, ...creada }, true, creada.id);
  } catch {
    guardarVentaPendiente(venta);
    agregarVentaALista(venta);
    sumarVentaEnResumen(venta);
    limpiarFormulario();
    mostrarTicket(venta, false);
  }
}

function guardarVentaPendiente(venta) {
  const pendientes = JSON.parse(localStorage.getItem('ventas_pendientes') || '[]');
  pendientes.push(venta);
  localStorage.setItem('ventas_pendientes', JSON.stringify(pendientes));
}

async function sincronizarPendientes() {
  const pendientes = JSON.parse(localStorage.getItem('ventas_pendientes') || '[]');
  if (pendientes.length === 0) return;

  const restantes = [];
  for (const venta of pendientes) {
    try {
      const res = await fetch(`${API}/sales`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(venta),
      });
      if (await handleAuthFailure(res)) return;
      if (!res.ok && res.status !== 422) restantes.push(venta);
    } catch {
      restantes.push(venta);
    }
  }

  localStorage.setItem('ventas_pendientes', JSON.stringify(restantes));
}

function agregarVentaALista(venta) {
  const list = document.getElementById('sales-list');
  const empty = list.querySelector('.empty-state');
  if (empty) empty.remove();

  const amount = Number(venta.amount || 0);
  const addon = Number(venta.addon_amount || 0);
  const total = amount + addon;
  const row = document.createElement('div');
  row.className = 'sale-row';
  row.innerHTML = `
    <div class="sale-num">${String(venta.number_played || '').padStart(2, '0')}</div>
    <div>
      <div><strong>${localStorage.getItem('draw_nombre') || 'Sorteo'}</strong></div>
      <div class="sale-detail">Numero ${money(amount)}${addon > 0 ? ` + Reventado ${money(addon)}` : ''}</div>
    </div>
    <div class="sale-total">${money(total)}</div>
  `;
  list.prepend(row);

  const totalEl = document.getElementById('total');
  const actual = parseInt(totalEl.textContent.replace(/\D/g, '') || '0', 10);
  totalEl.textContent = money(actual + total);
}

function sumarVentaEnResumen(venta) {
  const addon = Number(venta.addon_amount || 0);
  const currentTickets = parseInt(document.getElementById('tickets-count').textContent.replace(/\D/g, '') || '0', 10);
  const currentAddon = parseInt(document.getElementById('addon-total').textContent.replace(/\D/g, '') || '0', 10);

  document.getElementById('tickets-count').textContent = String(currentTickets + 1);
  document.getElementById('addon-total').textContent = money(currentAddon + addon);
}

function limpiarFormulario() {
  document.getElementById('numero').value = '';
  document.getElementById('monto').value = '';
  document.getElementById('monto-reventado').value = '';
  document.getElementById('con-reventado').checked = false;
  document.getElementById('reventado-field').style.display = 'none';
  document.getElementById('cupo-info').textContent = '';
  setActiveField('numero');
  updateSummary();
}

async function consultarCupo() {
  const numero = document.getElementById('numero').value.replace(/\D/g, '');
  const drawId = getDrawId();
  const info = document.getElementById('cupo-info');

  if (!numero || !drawId) { info.textContent = ''; return; }

  try {
    const res = await fetch(`${API}/draws/${drawId}/capacity/${numero.padStart(2, '0')}`, {
      headers: authHeaders(),
    });
    if (await handleAuthFailure(res)) return;
    if (!res.ok) { info.textContent = ''; return; }

    const data = await res.json();
    if (data.sin_limite) {
      info.textContent = '';
      return;
    }

    if (data.disponible <= 0) {
      info.textContent = 'Numero cerrado';
      info.style.color = '#b42318';
    } else {
      info.textContent = `Cupo ${money(data.disponible)}`;
      info.style.color = data.disponible < data.max * 0.2 ? '#b54708' : '#087f5b';
    }
  } catch {
    info.textContent = '';
  }
}

async function cargarDashboard() {
  const res = await fetch(`${API}/me/dashboard`, {
    headers: authHeaders(),
  });
  if (await handleAuthFailure(res)) return;
  if (!res.ok) return;

  const data = await res.json();
  const ventas = data.sales_today?.items || [];

  document.getElementById('sales-list').innerHTML = '';
  document.getElementById('total').textContent = '0';
  document.getElementById('tickets-count').textContent = String(data.sales_today?.count || 0);
  document.getElementById('addon-total').textContent = money(data.sales_today?.addon_total || 0);

  ventas.forEach(v => agregarVentaALista(v));
  document.getElementById('total').textContent = money(data.sales_today?.grand_total || 0);
  if (ventas.length === 0) {
    document.getElementById('sales-list').innerHTML = '<div class="empty-state">Todavia no hay ventas cargadas.</div>';
  }

  cargarComisiones(data.commissions);
}

function cargarComisiones(commissions) {
  const list = document.getElementById('commissions-list');
  const history = commissions?.history || [];

  document.getElementById('commission-week-total').textContent = money(commissions?.week_total || 0);
  list.innerHTML = history.length ? history.map(item => {
    const fecha = new Date(item.created_at).toLocaleString('es-CR', { dateStyle: 'short', timeStyle: 'short' });
    return `
      <div class="sale-row">
        <div class="sale-num">%</div>
        <div>
          <div><strong>${item.draw_name || 'Comision'}</strong></div>
          <div class="sale-detail">${fecha}</div>
        </div>
        <div class="sale-total">${money(item.amount)}</div>
      </div>
    `;
  }).join('') : '<div class="empty-state">Todavia no hay comisiones calculadas.</div>';
}

function actualizarEstadoConexion() {
  document.getElementById('offline-badge').style.display = navigator.onLine ? 'none' : 'block';
  if (navigator.onLine) sincronizarPendientes();
}
window.addEventListener('online', actualizarEstadoConexion);
window.addEventListener('offline', actualizarEstadoConexion);

if (getToken()) {
  showApp();
  cargarSorteos();
  cargarDashboard();
}
actualizarEstadoConexion();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
}

let ticketActual = null;

function mostrarTicket(venta, sincronizada, ticketId) {
  ticketActual = {
    ...venta,
    id: ticketId || venta.id || 'PEND-' + Date.now(),
    sincronizada,
    fecha: new Date(),
  };

  document.getElementById('ticket-preview').textContent = generarTextoTicket(ticketActual);
  document.getElementById('ticket-modal').style.display = 'flex';
}

function cerrarTicket() {
  document.getElementById('ticket-modal').style.display = 'none';
  ticketActual = null;
}

function generarTextoTicket(t) {
  const tenant = localStorage.getItem('tenant_nombre') || 'Loteria';
  const vendedor = localStorage.getItem('vendedor_nombre') || '';
  const sorteo = localStorage.getItem('draw_nombre') || '';
  const hora = t.fecha.toLocaleString('es-CR', { dateStyle: 'short', timeStyle: 'short' });
  const amount = Number(t.amount || 0);
  const addon = Number(t.addon_amount || 0);

  return [
    `*${tenant}*`,
    `Vendedor: ${vendedor}`,
    `Sorteo: ${sorteo}`,
    `Fecha: ${hora}`,
    '--------------------------',
    `Numero: ${String(t.number_played).padStart(2, '0')}`,
    `Monto numero:  ${money(amount)}`,
    addon > 0 ? `Reventado:     ${money(addon)}` : '',
    '--------------------------',
    `Total: ${money(amount + addon)}`,
    `Tiquete: ${t.id}`,
    t.sincronizada ? '' : '(pendiente de sincronizar)',
  ].filter(Boolean).join('\n');
}

const PRINTER_SERVICE_UUID = '000018f0-0000-1000-8000-00805f9b34fb';
const PRINTER_CHAR_UUID = '00002af1-0000-1000-8000-00805f9b34fb';

async function imprimirBluetooth() {
  if (!ticketActual) return;

  if (!navigator.bluetooth) {
    alert('Este navegador no soporta Bluetooth. Usa Chrome en Android.');
    return;
  }

  try {
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [PRINTER_SERVICE_UUID] }],
      optionalServices: [PRINTER_SERVICE_UUID],
    });

    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(PRINTER_SERVICE_UUID);
    const characteristic = await service.getCharacteristic(PRINTER_CHAR_UUID);
    const comandos = construirComandosEscPos(generarTextoTicket(ticketActual));

    const chunk = 100;
    for (let i = 0; i < comandos.length; i += chunk) {
      await characteristic.writeValue(comandos.slice(i, i + chunk));
    }

    device.gatt.disconnect();
  } catch (e) {
    alert('No se pudo conectar con la impresora: ' + e.message);
  }
}

function construirComandosEscPos(texto) {
  const encoder = new TextEncoder();
  const init = [0x1B, 0x40];
  const corte = [0x1D, 0x56, 0x00];
  const salto = [0x0A, 0x0A, 0x0A];
  const textoPlano = texto.replace(/\*/g, '');
  const bytesTexto = Array.from(encoder.encode(textoPlano));
  return new Uint8Array([...init, ...bytesTexto, ...salto, ...corte]);
}

async function compartirWhatsApp() {
  if (!ticketActual) return;

  const texto = generarTextoTicket(ticketActual);
  if (navigator.share) {
    try {
      await navigator.share({ text: texto });
      return;
    } catch {
      return;
    }
  }

  window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank');
}
