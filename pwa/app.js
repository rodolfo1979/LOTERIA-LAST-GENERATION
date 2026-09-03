const API = '/api';

let activeField = 'numero';
let clients = [];
let cashFallback = false;
let ticketItems = [];

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
  cargarClientes();
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
  updateSubmitLabels();
  renderTicketItems();
}

async function cargarClientes() {
  const res = await fetch(`${API}/clients`, { headers: authHeaders() });
  if (await handleAuthFailure(res)) return;
  if (!res.ok) return;

  clients = await res.json();
  const select = document.getElementById('client-select');
  select.innerHTML = '<option value="">Cliente normal</option>' + clients.map(client =>
    `<option value="${client.id}">${client.name} - ₡${money(client.balance)}</option>`
  ).join('');
  onClientChange();
}

function selectedClient() {
  const id = document.getElementById('client-select')?.value;
  return clients.find(client => Number(client.id) === Number(id)) || null;
}

function onClientChange() {
  cashFallback = false;
  document.getElementById('cash-fallback-btn').style.display = 'none';
  document.getElementById('client-warning').style.display = 'none';
  updateSummary();
}

function venderComoNormal() {
  cashFallback = true;
  ticketItems = ticketItems.map(item => item.payment_mode === 'prepaid'
    ? { ...item, payment_mode: 'cash', allow_cash_fallback: true }
    : item
  );
  document.getElementById('client-warning').textContent = 'Esta venta se registrara como cliente normal. No se descontara saldo prepago.';
  document.getElementById('client-warning').style.display = 'block';
  document.getElementById('cash-fallback-btn').style.display = 'none';
  renderTicketItems();
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
  document.querySelectorAll('.active-field-label').forEach(el => {
    el.textContent = labels[field] || 'Campo';
  });
}

function pressDigit(digit) {
  const input = document.getElementById(activeField);
  const max = activeField === 'numero' ? 3 : 7;
  const current = input.value.replace(/\D/g, '');
  if (current.length >= max) return;
  input.value = current + digit;
  if (activeField === 'numero' && input.value.length >= 2) consultarCupo();
  updateSummary();
  previewListaNumeros();
}

function backspaceActiveField() {
  const input = document.getElementById(activeField);
  input.value = input.value.slice(0, -1);
  if (activeField === 'numero') consultarCupo();
  updateSummary();
  previewListaNumeros();
}

function clearActiveField() {
  document.getElementById(activeField).value = '';
  if (activeField === 'numero') document.getElementById('cupo-info').textContent = '';
  updateSummary();
  previewListaNumeros();
}

function addQuickAmount(amount) {
  if (activeField === 'numero') setActiveField('monto');
  const input = document.getElementById(activeField);
  input.value = String(numberValue(activeField) + amount);
  updateSummary();
  previewListaNumeros();
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
  previewListaNumeros();
}

function updateSummary() {
  const monto = numberValue('monto');
  const addon = document.getElementById('con-reventado').checked ? numberValue('monto-reventado') : 0;
  const client = selectedClient();
  const total = monto + addon;
  document.getElementById('summary-main').textContent = money(monto);
  document.getElementById('summary-addon').textContent = money(addon);
  document.getElementById('summary-total').textContent = money(total);

  const balanceLabel = document.getElementById('client-balance-label');
  if (!client) {
    balanceLabel.textContent = 'Sin cliente prepago';
    return;
  }

  balanceLabel.textContent = `Saldo ${money(client.balance)}${cashFallback ? ' - venta normal' : ''}`;
  if (!cashFallback && total > 0 && Number(client.balance) < total) {
    document.getElementById('client-warning').textContent = `Saldo insuficiente: tiene ${money(client.balance)} y la venta suma ${money(total)}.`;
    document.getElementById('client-warning').style.display = 'block';
    document.getElementById('cash-fallback-btn').style.display = 'inline-flex';
  } else if (!cashFallback) {
    document.getElementById('client-warning').style.display = 'none';
    document.getElementById('cash-fallback-btn').style.display = 'none';
  }
}

function ventaPayload() {
  const rawNumero = document.getElementById('numero').value.replace(/\D/g, '');
  const conReventado = document.getElementById('con-reventado').checked;
  const client = selectedClient();

  return {
    draw_id: getDrawId(),
    draw_name: localStorage.getItem('draw_nombre') || 'Sorteo',
    draw_time: localStorage.getItem('draw_hora') || '',
    number_played: rawNumero.padStart(2, '0'),
    amount: numberValue('monto'),
    with_addon: conReventado,
    addon_amount: conReventado ? numberValue('monto-reventado') : 0,
    client_id: client?.id || null,
    client,
    payment_mode: client && !cashFallback ? 'prepaid' : 'cash',
    allow_cash_fallback: cashFallback,
  };
}

function parseListaNumeros(value) {
  const raw = String(value || '').trim();
  if (!raw) return [];

  const toEntry = (number, amount = null) => ({
    number: String(number || '').padStart(2, '0'),
    amount,
  });

  if (/^\d+$/.test(raw)) {
    if (raw.length % 2 !== 0) return null;
    const entries = [];
    for (let i = 0; i < raw.length; i += 2) {
      entries.push(toEntry(raw.slice(i, i + 2)));
    }
    return entries;
  }

  const segments = raw.split(/[,;\n/]+/).map(item => item.trim()).filter(Boolean);
  if (segments.length > 1) {
    const singleParts = segments.map(segment => segment.match(/\d+/g) || []);
    if (singleParts.every(parts => parts.length === 1)) {
      const values = singleParts.map(parts => parts[0]);
      if (values.every(part => part.length <= 2)) {
        return values.map(part => toEntry(part));
      }
      if (values.length % 2 === 0 && values.every((part, index) => index % 2 !== 0 || part.length <= 2)) {
        const entries = [];
        for (let i = 0; i < values.length; i += 2) {
          entries.push(toEntry(values[i], Number(values[i + 1])));
        }
        return entries;
      }
    }

    return segments.map(segment => {
      const parts = segment.match(/\d+/g) || [];
      if (!parts.length) return toEntry('');
      if (parts.length === 1) return toEntry(parts[0]);
      return toEntry(parts[0], Number(parts.slice(1).join('')));
    });
  }

  const parts = raw.match(/\d+/g) || [];
  if (parts.length > 0 && parts.every(part => part.length <= 2)) {
    return parts.map(part => toEntry(part));
  }

  if (parts.length > 0 && parts.length % 2 === 0 && parts.every((part, index) => index % 2 !== 0 || part.length <= 2)) {
    const entries = [];
    for (let i = 0; i < parts.length; i += 2) {
      entries.push(toEntry(parts[i], Number(parts[i + 1])));
    }
    return entries;
  }

  return null;
}

function updateSubmitLabels() {
  const batchValue = document.getElementById('batch-numbers')?.value.trim() || '';
  const addon = document.getElementById('con-reventado')?.checked ? numberValue('monto-reventado') : 0;
  const batchLabel = addon ? 'Agregar lista con reventado' : 'Agregar lista';
  const saleLabel = batchValue ? batchLabel : 'Agregar a tiquete';

  document.querySelectorAll('.key.submit').forEach(button => {
    button.textContent = saleLabel;
  });

  const batchButton = document.getElementById('batch-submit-btn');
  if (batchButton) batchButton.textContent = batchLabel;
}

function previewListaNumeros() {
  const input = document.getElementById('batch-numbers');
  const preview = document.getElementById('batch-preview');
  const addon = document.getElementById('con-reventado')?.checked ? numberValue('monto-reventado') : 0;

  updateSubmitLabels();

  if (!input || !preview) return;

  const entries = parseListaNumeros(input.value);
  if (entries === null) {
    preview.textContent = 'Formato no reconocido';
    preview.style.color = 'var(--danger)';
    return;
  }

  const invalid = entries.filter(entry => !/^\d{2}$/.test(entry.number) || (entry.amount !== null && (!Number.isFinite(entry.amount) || entry.amount <= 0)));
  if (invalid.length) {
    preview.textContent = 'Revisa numeros o montos de la lista';
    preview.style.color = 'var(--danger)';
    return;
  }

  const previewItems = entries.slice(0, 8).map(entry => entry.amount ? `${entry.number} ${money(entry.amount)}` : entry.number);
  preview.style.color = '';
  preview.textContent = entries.length
    ? `${entries.length} numeros: ${previewItems.join(', ')}${entries.length > 8 ? '...' : ''}${addon ? ` · Rev ${money(addon)} c/u` : ''}`
    : '0 numeros detectados';
}

async function registrarVenta() {
  const batchInput = document.getElementById('batch-numbers');
  const batchValue = batchInput?.value.trim() || '';
  const rawNumero = document.getElementById('numero').value.replace(/\D/g, '');

  if (batchValue) {
    await registrarListaNumeros();
    return;
  }

  if (!rawNumero && document.activeElement === batchInput) {
    await registrarListaNumeros();
    return;
  }

  await registrarVentaIndividual();
}

async function registrarVentaIndividual() {
  const venta = ventaPayload();
  const rawNumero = document.getElementById('numero').value.replace(/\D/g, '');

  if (!venta.draw_id) { alert('Elegi un sorteo primero'); return; }
  if (!rawNumero) { alert('Falta el numero. Si vas a cargar una lista, pega la lista en el campo de WhatsApp o usa el boton Agregar lista.'); return; }
  if (!venta.amount) { alert('Falta el monto del numero'); return; }
  if (venta.with_addon && !venta.addon_amount) { alert('Falta el monto del Reventado'); return; }

  agregarItemTiquete(venta);
  limpiarFormulario();
}

async function registrarListaNumeros() {
  const batchInput = document.getElementById('batch-numbers');
  const entries = parseListaNumeros(batchInput?.value || '');
  const base = ventaPayload();

  if (!base.draw_id) { alert('Elegi un sorteo primero'); return; }
  if (entries === null) { alert('No pude reconocer la lista. Usa 45,12,08 o 45 1000, 12 1000.'); return; }
  if (!entries.length) { alert('Pega una lista de numeros primero.'); return; }
  if (entries.some(entry => !/^\d{2}$/.test(entry.number))) { alert('Todos los numeros deben ser de 2 digitos.'); return; }
  if (entries.some(entry => entry.amount !== null && (!Number.isFinite(entry.amount) || entry.amount <= 0))) { alert('Revisa los montos de la lista.'); return; }
  if (entries.some(entry => entry.amount === null) && !base.amount) { alert('Falta el monto del numero. Ese monto se aplica a los numeros que no traen monto en la lista.'); return; }
  if (base.with_addon && !base.addon_amount) { alert('Falta el monto del Reventado.'); return; }

  entries.forEach(entry => {
    agregarItemTiquete({ ...base, number_played: entry.number, amount: Number(entry.amount ?? base.amount) });
  });

  if (batchInput) batchInput.value = '';
  previewListaNumeros();
  limpiarFormulario();
}

function agregarItemTiquete(venta) {
  ticketItems.push({
    ...venta,
    temp_id: Date.now() + '-' + Math.random().toString(16).slice(2),
  });
  renderTicketItems();
}

function eliminarItemTiquete(tempId) {
  ticketItems = ticketItems.filter(item => item.temp_id !== tempId);
  renderTicketItems();
}

async function limpiarTiqueteEnPreparacion() {
  if (!ticketItems.length) return;
  const confirmar = window.showAppConfirm
    ? await showAppConfirm('Esto elimina los numeros cargados antes de generar el tiquete.', 'Limpiar tiquete')
    : window.confirm('Eliminar los numeros cargados antes de generar el tiquete?');
  if (!confirmar) return;
  ticketItems = [];
  renderTicketItems();
}

function renderTicketItems() {
  const list = document.getElementById('ticket-items-list');
  const count = document.getElementById('ticket-items-count');
  const total = document.getElementById('ticket-items-total');
  const generateButton = document.getElementById('generate-ticket-btn');
  if (!list || !count || !total || !generateButton) return;

  const totalTicket = ticketItems.reduce((sum, item) => sum + Number(item.amount || 0) + Number(item.addon_amount || 0), 0);
  count.textContent = String(ticketItems.length);
  total.textContent = money(totalTicket);
  generateButton.disabled = ticketItems.length === 0;

  if (!ticketItems.length) {
    list.innerHTML = '<div class="empty-state">No hay numeros cargados para el tiquete.</div>';
    return;
  }

  list.innerHTML = ticketItems.map(item => {
    const addon = Number(item.addon_amount || 0);
    const totalItem = Number(item.amount || 0) + addon;
    const detail = `${item.draw_name || 'Sorteo'} · Numero ${money(item.amount)}${addon > 0 ? ` + Reventado ${money(addon)}` : ''}${item.client?.name ? ` · ${item.client.name}` : ''}`;
    return `
      <div class="sale-row pending-row">
        <div class="sale-num">${String(item.number_played || '').padStart(2, '0')}</div>
        <div>
          <div><strong>${money(totalItem)}</strong></div>
          <div class="sale-detail">${detail}</div>
        </div>
        <button class="btn danger small" onclick="eliminarItemTiquete('${item.temp_id}')" type="button">Eliminar</button>
      </div>
    `;
  }).join('');
}

async function generarTiquete() {
  if (!ticketItems.length) {
    alert('Primero agrega numeros al tiquete.');
    return;
  }

  const prepaidClientIds = [...new Set(ticketItems.filter(item => item.payment_mode === 'prepaid' && item.client_id).map(item => item.client_id))];
  if (prepaidClientIds.length > 1) {
    alert('Un tiquete no puede mezclar varios clientes prepago.');
    return;
  }

  const prepaidClient = ticketItems.find(item => item.payment_mode === 'prepaid' && item.client_id)?.client || null;
  const totalTicket = ticketItems.reduce((sum, item) => sum + Number(item.amount || 0) + Number(item.addon_amount || 0), 0);
  if (prepaidClient && Number(prepaidClient.balance) < totalTicket) {
    document.getElementById('client-warning').textContent = `Saldo insuficiente: tiene ${money(prepaidClient.balance)} y el tiquete suma ${money(totalTicket)}.`;
    document.getElementById('client-warning').style.display = 'block';
    document.getElementById('cash-fallback-btn').style.display = 'inline-flex';
    return;
  }

  const confirmar = window.showAppConfirm
    ? await showAppConfirm(`Generar tiquete con ${ticketItems.length} numeros?\nTotal: ${money(totalTicket)}`, 'Generar tiquete')
    : window.confirm(`Generar tiquete con ${ticketItems.length} numeros? Total: ${money(totalTicket)}`);
  if (!confirmar) return;

  const pendientes = [...ticketItems];
  const ventasTicket = [];
  const errores = [];
  let tienePendientesOffline = false;

  for (const item of pendientes) {
    const venta = { ...item };
    delete venta.temp_id;
    delete venta.draw_name;
    delete venta.draw_time;
    delete venta.client;

    if (!navigator.onLine) {
      guardarVentaPendiente(venta);
      agregarVentaALista(item);
      sumarVentaEnResumen(item);
      ventasTicket.push({ ...item, id: 'PEND-' + Date.now() + '-' + item.number_played, sincronizada: false });
      tienePendientesOffline = true;
      continue;
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
        errores.push(`${item.number_played}: ${err.message || 'no se pudo registrar'}`);
        continue;
      }

      const creada = await res.json();
      const itemCreado = { ...item, ...creada, draw_name: item.draw_name, client: creada.client || item.client, sincronizada: true };
      agregarVentaALista(itemCreado);
      sumarVentaEnResumen(itemCreado);
      ventasTicket.push(itemCreado);
    } catch {
      guardarVentaPendiente(venta);
      agregarVentaALista(item);
      sumarVentaEnResumen(item);
      ventasTicket.push({ ...item, id: 'PEND-' + Date.now() + '-' + item.number_played, sincronizada: false });
      tienePendientesOffline = true;
    }
  }

  ticketItems = ticketItems.filter(item => !ventasTicket.some(done => done.temp_id === item.temp_id));
  renderTicketItems();
  await cargarClientes();
  await cargarComisionesDashboard();

  if (ventasTicket.length) {
    mostrarTicketLista(ventasTicket, !tienePendientesOffline, prepaidClient);
    limpiarVentasVisibles();
  }

  if (errores.length) {
    alert(`Se registraron ${ventasTicket.length} de ${pendientes.length}.\nLos no registrados quedan en el tiquete en preparacion para eliminarlos o corregirlos.\n\nNo registrados:\n${errores.slice(0, 8).join('\n')}${errores.length > 8 ? '\n...' : ''}`);
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
  const clientText = venta.client?.name
    ? ` · ${venta.client.name} (${venta.prepaid_applied ? 'prepago' : 'normal'})`
    : '';
  const row = document.createElement('div');
  row.className = 'sale-row';
  row.innerHTML = `
    <div class="sale-num">${String(venta.number_played || '').padStart(2, '0')}</div>
    <div>
      <div><strong>${venta.draw_name || venta.draw?.name || localStorage.getItem('draw_nombre') || 'Sorteo'}</strong></div>
      <div class="sale-detail">Numero ${money(amount)}${addon > 0 ? ` + Reventado ${money(addon)}` : ''}${clientText}</div>
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

function limpiarVentasVisibles() {
  document.getElementById('sales-list').innerHTML = '<div class="empty-state">Todavia no hay ventas cargadas.</div>';
  document.getElementById('total').textContent = '0';
  document.getElementById('tickets-count').textContent = '0';
  document.getElementById('addon-total').textContent = '0';
}

function limpiarFormulario() {
  document.getElementById('numero').value = '';
  document.getElementById('monto').value = '';
  document.getElementById('monto-reventado').value = '';
  document.getElementById('con-reventado').checked = false;
  document.getElementById('reventado-field').style.display = 'none';
  document.getElementById('cupo-info').textContent = '';
  document.getElementById('client-select').value = '';
  cashFallback = false;
  document.getElementById('client-warning').style.display = 'none';
  document.getElementById('cash-fallback-btn').style.display = 'none';
  setActiveField('numero');
  updateSummary();
  updateSubmitLabels();
}

async function limpiarPantallaVendedor() {
  const confirmar = window.showAppConfirm
    ? await showAppConfirm('Esto limpia la pantalla de trabajo. Las ventas registradas y las comisiones no se borran del sistema.', 'Limpiar pantalla')
    : window.confirm('Limpiar la pantalla de trabajo? Las ventas registradas y las comisiones no se borran.');

  if (!confirmar) return;

  limpiarFormulario();
  ticketItems = [];

  const batchInput = document.getElementById('batch-numbers');
  if (batchInput) batchInput.value = '';
  previewListaNumeros();
  renderTicketItems();

  limpiarVentasVisibles();
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
    if (data.blocked) {
      info.textContent = 'Numero bloqueado';
      info.style.color = '#FF5C6C';
      return;
    }

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

async function cargarComisionesDashboard() {
  const res = await fetch(`${API}/me/dashboard`, {
    headers: authHeaders(),
  });
  if (await handleAuthFailure(res)) return;
  if (!res.ok) return;

  const data = await res.json();
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

function mostrarTicketLista(ventas, sincronizada, client) {
  ticketActual = {
    tipo: 'lista',
    items: ventas,
    id: 'LIST-' + Date.now(),
    sincronizada,
    client,
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
  const client = t.client?.name || selectedClient()?.name || '';

  if (t.tipo === 'lista') {
    const items = t.items || [];
    const totalNumero = items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const totalReventado = items.reduce((sum, item) => sum + Number(item.addon_amount || 0), 0);
    const lineas = items.map(item => {
      const itemAmount = Number(item.amount || 0);
      const itemAddon = Number(item.addon_amount || 0);
      return `${String(item.number_played).padStart(2, '0')}  Numero ${money(itemAmount)}${itemAddon > 0 ? ` + Rev ${money(itemAddon)}` : ''}`;
    });

    return [
      `*${tenant}*`,
      `Vendedor: ${vendedor}`,
      `Sorteo: ${sorteo}`,
      `Fecha: ${hora}`,
      '--------------------------',
      `Lista: ${items.length} numeros`,
      ...lineas,
      client ? `Cliente: ${client}` : '',
      '--------------------------',
      `Total numeros:   ${money(totalNumero)}`,
      totalReventado > 0 ? `Total reventado: ${money(totalReventado)}` : '',
      `Total: ${money(totalNumero + totalReventado)}`,
      `Tiquete: ${t.id}`,
      t.sincronizada ? 'Estado: registrado' : 'Estado: pendiente de sincronizar',
    ].filter(Boolean).join('\n');
  }

  return [
    `*${tenant}*`,
    `Vendedor: ${vendedor}`,
    `Sorteo: ${sorteo}`,
    `Fecha: ${hora}`,
    '--------------------------',
    `Numero: ${String(t.number_played).padStart(2, '0')}`,
    `Monto numero:  ${money(amount)}`,
    addon > 0 ? `Reventado:     ${money(addon)}` : '',
    client ? `Cliente: ${client}${t.prepaid_applied ? ' (prepago)' : ' (normal)'}` : '',
    '--------------------------',
    `Total: ${money(amount + addon)}`,
    `Tiquete: ${t.id}`,
    t.sincronizada ? 'Estado: registrado' : 'Estado: pendiente de sincronizar',
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

async function copiarTicket() {
  if (!ticketActual) return;

  const texto = generarTextoTicket(ticketActual);
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texto);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = texto;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
    alert('Tiquete copiado. Ya podes pegarlo en WhatsApp.');
  } catch {
    alert('No se pudo copiar automaticamente. Mantene presionado el tiquete para copiarlo manualmente.');
  }
}
