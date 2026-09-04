const API = '/api';
let adminDraws = [];
let numbersRefreshTimer = null;
let loadingNumbers = false;
let sellerListRefreshTimer = null;
let activeSellerList = null;
let clientsRefreshTimer = null;
let activeClientHistoryId = null;

function getToken() { return localStorage.getItem('admin_token'); }

function money(value) {
  return `₡${Number(value || 0).toLocaleString('es-CR')}`;
}

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function jsArg(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function textArg(value) {
  return encodeURIComponent(String(value || ''));
}

function authHeaders(extra = {}) {
  return {
    Accept: 'application/json',
    Authorization: `Bearer ${getToken()}`,
    ...extra,
  };
}

function clearAdminSession() {
  localStorage.removeItem('admin_token');
  localStorage.removeItem('tenant_name');
}

function logoutAdmin() {
  clearAdminSession();
  window.location.href = '/admin';
}

async function handleAuthFailure(res) {
  if (res.status !== 401 && res.status !== 419) return false;
  clearAdminSession();
  alert('La sesion de administrador vencio. Inicia sesion de nuevo.');
  window.location.href = '/admin';
  return true;
}

async function readError(res) {
  try {
    const data = await res.json();
    if (data.errors) {
      const first = Object.values(data.errors).flat().find(Boolean);
      if (first) return { ...data, message: first };
    }
    return data;
  } catch {
    return { message: 'No se pudo completar la accion.' };
  }
}

async function login() {
  const phone = document.getElementById('phone').value;
  const pin = document.getElementById('pin').value;

  const res = await fetch(`${API}/login`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, pin }),
  });

  if (!res.ok) { alert('Teléfono o PIN incorrecto'); return; }

  const data = await res.json();
  if (!['admin', 'dueno'].includes(data.user.role)) {
    alert('Este usuario no tiene permisos de administrador');
    return;
  }

  localStorage.setItem('admin_token', data.token);
  localStorage.setItem('tenant_name', data.user.tenant_name);
  mostrarApp();
}

function mostrarApp() {
  window.scrollTo(0, 0);
  document.documentElement.scrollLeft = 0;
  document.body.scrollLeft = 0;
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-screen').style.display = 'block';
  document.getElementById('tenant-name').textContent = localStorage.getItem('tenant_name') || '—';
  const today = isoToday();
  document.getElementById('report-from').value = document.getElementById('report-from').value || today;
  document.getElementById('report-to').value = document.getElementById('report-to').value || today;
  document.getElementById('generate-draw-date').value = document.getElementById('generate-draw-date').value || today;
  const ticketSearchInput = document.getElementById('ticket-search-number');
  if (ticketSearchInput && !ticketSearchInput.dataset.ready) {
    ticketSearchInput.dataset.ready = '1';
    ticketSearchInput.addEventListener('keydown', event => {
      if (event.key === 'Enter') buscarTiquetesPorNumero();
    });
  }
  cargarSorteos();
  cargarComisiones();
  cargarVendedores();
  cargarReglas();
  cargarLoterias();
  cargarClientes();
  startNumbersRealtime();
  startClientsRealtime();
}

function startClientsRealtime() {
  if (clientsRefreshTimer) clearInterval(clientsRefreshTimer);
  clientsRefreshTimer = setInterval(() => {
    const panel = document.getElementById('panel-clientes');
    if (!panel?.classList.contains('active')) return;

    cargarClientes();
    if (activeClientHistoryId) cargarMovimientosCliente(activeClientHistoryId, { quiet: true, noScroll: true, skipClientRefresh: true });
  }, 10000);
}

// ---------- SORTEOS ----------

async function cargarSorteos() {
  const res = await fetch(`${API}/draws`, { headers: authHeaders() });
  if (await handleAuthFailure(res)) return;
  if (!res.ok) return;
  const draws = await res.json();
  adminDraws = draws;
  const abiertos = draws.filter(d => d.status === 'abierto' && d.is_active);

  const list = document.getElementById('draws-list');
  list.innerHTML = draws.length ? draws.map(d => `
    <div class="draw-item">
      <div class="draw-head">
        <div>
          <div class="draw-name">${d.name || d.game_type} · ${formatDrawDateTime(d.draw_datetime)}</div>
          <div class="draw-meta">ID #${d.id} · reglas: ${d.game_type}${drawVisibilityNote(d)}</div>
        </div>
        <span class="pill ${drawPillClass(d)}">${drawStatusText(d)}</span>
      </div>
      <div class="draw-actions">
        ${d.status === 'abierto' ? `<button class="inline-btn" onclick="editarSorteo(${d.id})">Editar</button>` : ''}
        ${d.status === 'abierto' ? `<button class="inline-btn neutral" onclick="toggleSorteoActivo(${d.id}, ${d.is_active ? 'false' : 'true'})">${d.is_active ? 'Desactivar' : 'Activar'}</button>` : ''}
        <button class="inline-btn danger" onclick="eliminarSorteo(${d.id})">Eliminar</button>
      </div>
    </div>
  `).join('') : '<span class="sub">No hay sorteos creados.</span>';

  const closeSelect = document.getElementById('close-draw-select');
  closeSelect.innerHTML = abiertos.map(d =>
    `<option value="${d.id}">${d.name || d.game_type} · ${formatDrawTime(d.draw_datetime)} (#${d.id})</option>`
  ).join('') || '<option value="">No hay sorteos abiertos</option>';

  const numbersSelect = document.getElementById('numbers-draw-select');
  numbersSelect.innerHTML = draws.map(d =>
    `<option value="${d.id}">${d.name || d.game_type} · ${formatDrawTime(d.draw_datetime)} (#${d.id})</option>`
  ).join('') || '<option value="">No hay sorteos creados</option>';

  const ticketSearchSelect = document.getElementById('ticket-search-draw-select');
  if (ticketSearchSelect) {
    const selected = ticketSearchSelect.value;
    ticketSearchSelect.innerHTML = '<option value="">Todos los sorteos</option>' + draws.map(d =>
      `<option value="${d.id}">${d.name || d.game_type} · ${formatDrawDateTime(d.draw_datetime)} (#${d.id})</option>`
    ).join('');
    ticketSearchSelect.value = selected;
  }

  const limitDrawSelect = document.getElementById('limit-draw-select');
  if (limitDrawSelect) {
    const selected = limitDrawSelect.value;
    limitDrawSelect.innerHTML = draws.map(d =>
      `<option value="${d.id}">${d.name || d.game_type} · ${formatDrawTime(d.draw_datetime)} (#${d.id})</option>`
    ).join('') || '<option value="">No hay sorteos creados</option>';
    if (selected && draws.some(d => Number(d.id) === Number(selected))) limitDrawSelect.value = selected;
    limitDrawSelect.onchange = cargarLimitesNumeros;
  }

  const reportDrawSelect = document.getElementById('report-draw-select');
  if (reportDrawSelect) {
    const selected = reportDrawSelect.value;
    reportDrawSelect.innerHTML = '<option value="">Todos los sorteos</option>' + draws.map(d =>
      `<option value="${d.id}">${d.name || d.game_type} · ${formatDrawDateTime(d.draw_datetime)}</option>`
    ).join('');
    reportDrawSelect.value = selected;
  }

  if (draws.length) {
    cargarNumeros();
    cargarLimitesNumeros();
    cargarMonitorNumeros();
  }
}

function drawDateParts(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/);
  if (!match) return null;
  return {
    year: match[1],
    month: match[2],
    day: match[3],
    hour: match[4],
    minute: match[5],
  };
}

function formatDrawDateTime(value) {
  const parts = drawDateParts(value);
  if (!parts) return '';
  return `${Number(parts.day)}/${Number(parts.month)}/${parts.year} ${formatHour(parts.hour, parts.minute)}`;
}

function formatDrawTime(value) {
  const parts = drawDateParts(value);
  if (!parts) return '';
  return formatHour(parts.hour, parts.minute);
}

function formatHour(hour, minute) {
  const h24 = Number(hour);
  const suffix = h24 >= 12 ? 'p. m.' : 'a. m.';
  const h12 = h24 % 12 || 12;
  return `${String(h12).padStart(2, '0')}:${minute} ${suffix}`;
}

function toDatetimeLocal(value) {
  const parts = drawDateParts(value);
  if (parts) return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;

  const date = new Date(value);
  const pad = number => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function llenarSelectLoterias(selectId, selectedId) {
  const select = document.getElementById(selectId);
  if (!select) return;
  select.innerHTML = (window.adminLoterias || []).map(loteria =>
    `<option value="${loteria.id}" ${Number(loteria.id) === Number(selectedId) ? 'selected' : ''}>${loteria.name} (${loteria.game_type})</option>`
  ).join('');
}

function drawPillClass(draw) {
  if (!draw.is_active) return 'off';
  if (draw.is_open_for_sales) return 'pending';
  if (draw.status === 'abierto') return 'risk';
  return 'paid';
}

function drawStatusText(draw) {
  if (!draw.is_active) return 'desactivado';
  if (draw.is_open_for_sales) return 'vendible';
  if (draw.status === 'abierto') return 'fuera de hora';
  return draw.status;
}

function drawVisibilityNote(draw) {
  if (!draw.is_active) return ' · desactivado para venta';
  if (draw.is_open_for_sales) return ' · visible al vendedor';
  if (draw.status === 'abierto') return ' · no aparece al vendedor: hora/corte vencido';
  return '';
}

async function generarSorteosDia() {
  const date = document.getElementById('generate-draw-date').value;
  if (!date) { alert('Selecciona una fecha.'); return; }

  const res = await fetch(`${API}/draws/generate-day`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ date }),
  });
  if (await handleAuthFailure(res)) return;
  const data = await readError(res);
  if (!res.ok) { alert(data.message || 'No se pudieron cargar los sorteos del dia'); return; }

  const missing = data.without_schedule?.length
    ? `\nSin hora base: ${data.without_schedule.join(', ')}. Crea esos sorteos manualmente una vez para que luego se repliquen.`
    : '';
  alert(`Sorteos preparados: ${data.created_count} nuevos, ${data.existing_count} ya existian.${missing}`);
  cargarSorteos();
}

async function toggleSorteoActivo(drawId, isActive) {
  const accion = isActive ? 'activar' : 'desactivar';
  if (!await showAppConfirm(`Vas a ${accion} este sorteo para ventas.`, 'Confirmar sorteo')) return;

  const res = await fetch(`${API}/draws/${drawId}/active`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ is_active: isActive }),
  });
  if (await handleAuthFailure(res)) return;
  const data = await readError(res);
  if (!res.ok) { alert(data.message || 'No se pudo cambiar el sorteo'); return; }

  alert(data.message || 'Sorteo actualizado.');
  cargarSorteos();
}

async function eliminarSorteo(drawId) {
  if (!await showAppConfirm('Si el sorteo no tiene ventas se elimina. Si ya tiene movimientos, se desactiva para proteger el historial.', 'Eliminar sorteo')) return;

  const res = await fetch(`${API}/draws/${drawId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (await handleAuthFailure(res)) return;
  const data = await readError(res);
  if (!res.ok) { alert(data.message || 'No se pudo eliminar el sorteo'); return; }

  alert(data.message || 'Sorteo actualizado.');
  cargarSorteos();
}

function editarSorteo(drawId) {
  const draw = adminDraws.find(item => Number(item.id) === Number(drawId));
  if (!draw) return;

  llenarSelectLoterias('edit-draw-loteria', draw.loteria_id);
  document.getElementById('edit-draw-id').value = draw.id;
  document.getElementById('edit-draw-datetime').value = toDatetimeLocal(draw.draw_datetime);
  document.getElementById('edit-draw-cutoff').value = draw.cutoff_minutes ?? 15;
  document.getElementById('edit-draw-active').checked = Boolean(draw.is_active);

  const loteriaSelect = document.getElementById('edit-draw-loteria');
  loteriaSelect.disabled = Number(draw.sales_count || 0) > 0;

  const card = document.getElementById('edit-draw-card');
  card.style.display = 'block';
  card.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function cancelarEditarSorteo() {
  document.getElementById('edit-draw-card').style.display = 'none';
  document.getElementById('edit-draw-id').value = '';
}

async function guardarSorteoEditado() {
  const drawId = document.getElementById('edit-draw-id').value;
  const loteria_id = document.getElementById('edit-draw-loteria').value;
  const draw_datetime = document.getElementById('edit-draw-datetime').value;
  const cutoff_minutes = document.getElementById('edit-draw-cutoff').value || 0;
  const is_active = document.getElementById('edit-draw-active').checked;

  if (!drawId || !loteria_id || !draw_datetime) { alert('Faltan datos para editar el sorteo.'); return; }

  const res = await fetch(`${API}/draws/${drawId}`, {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ loteria_id, draw_datetime, cutoff_minutes, is_active }),
  });
  if (await handleAuthFailure(res)) return;
  const data = await readError(res);
  if (!res.ok) { alert(data.message || 'No se pudo editar el sorteo'); return; }

  alert(data.message || 'Sorteo actualizado.');
  cancelarEditarSorteo();
  cargarSorteos();
}

async function crearSorteo() {
  const loteria_id = document.getElementById('new-draw-loteria').value;
  const fecha = document.getElementById('new-draw-datetime').value;

  if (!loteria_id || !fecha) { alert('Elegí una lotería y una fecha/hora'); return; }

  const res = await fetch(`${API}/draws`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ loteria_id, draw_datetime: fecha }),
  });
  if (await handleAuthFailure(res)) return;

  if (!res.ok) { const err = await readError(res); alert(err.message || 'No se pudo crear el sorteo'); return; }

  alert('Sorteo creado.');
  cargarSorteos();
}

async function cerrarSorteo() {
  const drawId = document.getElementById('close-draw-select').value;
  const winningNumber = document.getElementById('winning-number').value;
  const winningNumberAddon = document.getElementById('winning-number-addon').value;

  if (!drawId) { alert('No hay sorteo seleccionado'); return; }
  if (!winningNumber) { alert('Falta el número ganador'); return; }

  const res = await fetch(`${API}/draws/${drawId}/close`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ winning_number: winningNumber, winning_number_addon: winningNumberAddon || null }),
  });
  if (await handleAuthFailure(res)) return;

  if (!res.ok) { const err = await readError(res); alert(err.message || 'No se pudo cerrar el sorteo'); return; }

  alert('Sorteo cerrado. Premios y comisiones calculados.');
  document.getElementById('winning-number').value = '';
  document.getElementById('winning-number-addon').value = '';
  cargarSorteos();
  cargarComisiones();
  cargarVendedores();
}

// ---------- NUMEROS (cuadricula de riesgo) ----------

async function cargarNumeros() {
  if (loadingNumbers) return;
  const drawId = document.getElementById('numbers-draw-select').value;
  const grid = document.getElementById('numbers-grid');
  if (!drawId) {
    grid.innerHTML = '<span class="sub">No hay sorteos para mostrar.</span>';
    return;
  }

  loadingNumbers = true;
  let res;
  try {
    res = await fetch(`${API}/draws/${drawId}/numbers`, { headers: authHeaders() });
  } finally {
    loadingNumbers = false;
  }
  if (await handleAuthFailure(res)) return;
  if (!res.ok) return;

  const data = await res.json();
  const general = renderNumbersSummary(data.numeros);

  grid.innerHTML = `
    ${general}
    ${renderNumberGrid(data.numeros)}
  `;

  const updated = document.getElementById('numbers-last-updated');
  if (updated) {
    updated.textContent = `Actualizado ${new Date().toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
  }
}

function renderNumbersSummary(numeros) {
  const vendidos = numeros.filter(n => Number(n.grand_total ?? n.total) > 0);
  const totalVendido = vendidos.reduce((sum, n) => sum + Number(n.grand_total ?? n.total), 0);
  const totalReventado = vendidos.reduce((sum, n) => sum + Number(n.addon_total || 0), 0);
  const numerosRiesgo = numeros.filter(n => n.en_riesgo).length;

  return `
    <div class="numbers-summary">
      <div class="numbers-stat"><span>Numeros vendidos</span><strong>${vendidos.length}</strong></div>
      <div class="numbers-stat"><span>Total vendido</span><strong>${money(totalVendido)}</strong></div>
      <div class="numbers-stat"><span>Reventado</span><strong>${money(totalReventado)}</strong></div>
      <div class="numbers-stat"><span>En riesgo</span><strong>${numerosRiesgo}</strong></div>
    </div>
  `;
}

function renderNumberGrid(numeros) {
  if (Array.isArray(numeros) && numeros.length > 0 && numeros[0].numero?.length === 2) {
    return `<div class="grid-99">${numeros.map(n => {
      const grandTotal = Number(n.grand_total ?? n.total);
      const addonTotal = Number(n.addon_total || 0);
      const amountText = grandTotal > 0
        ? `${money(grandTotal)}${addonTotal > 0 ? `<br><span>Rev ${money(addonTotal)}</span>` : ''}`
        : (n.blocked ? 'Bloq.' : '—');
      const limitText = n.limit_amount ? `<br><span>Lim ${money(n.limit_amount)}</span>` : '';
      return `
      <div class="grid-cell ${n.blocked ? 'blocked' : (n.en_riesgo ? 'risk' : (n.total > 0 ? 'has-sales' : ''))}">
        <div class="num">${n.numero}</div>
        <div class="amt">${amountText}${limitText}</div>
      </div>
    `;
    }).join('')}</div>`;
  }

  return numeros.length ? numeros.map(n => `
      <div class="row">
        <span class="name">${n.numero}</span>
        <span>${money(n.grand_total ?? n.total)} <span class="sub">(${n.tickets} tiquetes)</span> ${n.en_riesgo ? '<span class="pill risk">riesgo</span>' : ''}</span>
      </div>
    `).join('') : '<span class="sub">Sin ventas todavía.</span>';
}

function renderSellerNumberSection(item) {
  return `
    <div class="seller-number-section">
      <div class="seller-number-head">
        <div>
          <div class="seller-number-title">${item.seller.name}</div>
          <div class="seller-number-meta">${item.seller.phone} · ${item.sales_count} tiquete(s) · ${item.numbers_sold} numero(s)</div>
        </div>
        <div class="seller-number-totals">
          <span>Normal ${money(item.main_total)}</span>
          <span>Reventado ${money(item.addon_total)}</span>
          <span>Total ${money(item.grand_total)}</span>
        </div>
      </div>
      ${renderNumberGrid(item.numeros || [])}
    </div>
  `;
}

function startNumbersRealtime() {
  if (numbersRefreshTimer) return;
  numbersRefreshTimer = setInterval(() => {
    const numbersPanel = document.getElementById('panel-numeros');
    if (numbersPanel?.classList.contains('active')) {
      cargarNumeros();
      cargarMonitorNumeros();
    }
  }, 5000);
}

function parseAdminNumbers(value) {
  return String(value || '')
    .split(/[^\d]+/)
    .map(item => item.trim())
    .filter(Boolean)
    .map(item => item.padStart(2, '0'));
}

async function cargarLimitesNumeros() {
  const drawId = document.getElementById('limit-draw-select')?.value;
  const list = document.getElementById('number-limits-list');
  if (!drawId || !list) return;

  const res = await fetch(`${API}/draws/${drawId}/number-limits`, { headers: authHeaders() });
  if (await handleAuthFailure(res)) return;
  if (!res.ok) { list.innerHTML = '<span class="sub">No se pudieron cargar los limites.</span>'; return; }

  const limits = await res.json();
  list.innerHTML = limits.length ? limits.map(limit => `
    <div class="row">
      <div>
        <div class="name">${limit.number_played} ${limit.blocked ? '<span class="pill off">bloqueado</span>' : ''}</div>
        <div class="sub">${limit.max_amount ? `Limite ${money(limit.max_amount)}` : 'Sin limite de monto'}${limit.note ? ` · ${limit.note}` : ''}</div>
      </div>
      <button class="inline-btn danger" onclick="eliminarLimiteNumero(${drawId}, '${limit.number_played}')">Quitar</button>
    </div>
  `).join('') : '<span class="sub">No hay numeros bloqueados o limitados en este sorteo.</span>';
}

async function guardarLimitesNumeros() {
  const drawId = document.getElementById('limit-draw-select')?.value;
  const numbers = parseAdminNumbers(document.getElementById('limit-numbers')?.value);
  const max_amount = document.getElementById('limit-amount')?.value || null;
  const blocked = document.getElementById('limit-blocked')?.checked || false;

  if (!drawId) { alert('Selecciona un sorteo.'); return; }
  if (!numbers.length) { alert('Escribe uno o varios numeros.'); return; }
  if (numbers.some(number => !/^\d{2}$/.test(number))) { alert('Todos los numeros deben ser de 2 digitos.'); return; }
  if (!blocked && !max_amount) { alert('Marca bloquear o escribe un limite de monto.'); return; }

  const res = await fetch(`${API}/draws/${drawId}/number-limits`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ numbers, max_amount, blocked }),
  });
  if (await handleAuthFailure(res)) return;
  const data = await readError(res);
  if (!res.ok) { alert(data.message || 'No se pudo guardar el limite'); return; }

  document.getElementById('limit-numbers').value = '';
  document.getElementById('limit-amount').value = '';
  document.getElementById('limit-blocked').checked = false;
  alert(data.message || 'Limites actualizados.');
  cargarLimitesNumeros();
  cargarNumeros();
  cargarMonitorNumeros();
}

async function eliminarLimiteNumero(drawId, number) {
  if (!await showAppConfirm(`Quitar limite o bloqueo del numero ${number}?`, 'Quitar limite')) return;

  const res = await fetch(`${API}/draws/${drawId}/number-limits/${number}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (await handleAuthFailure(res)) return;
  const data = await readError(res);
  if (!res.ok) { alert(data.message || 'No se pudo quitar el limite'); return; }

  cargarLimitesNumeros();
  cargarNumeros();
  cargarMonitorNumeros();
}

async function buscarTiquetesPorNumero() {
  const numberInput = document.getElementById('ticket-search-number');
  const drawSelect = document.getElementById('ticket-search-draw-select');
  const target = document.getElementById('ticket-search-results');
  const number = (numberInput?.value || '').replace(/\D/g, '').padStart(2, '0');

  if (!/^\d{2}$/.test(number)) {
    alert('Escribe un numero de 2 digitos.');
    return;
  }

  target.innerHTML = '<span class="sub">Buscando tiquetes...</span>';
  const params = new URLSearchParams({ number });
  if (drawSelect?.value) params.set('draw_id', drawSelect.value);

  const res = await fetch(`${API}/sales/search?${params.toString()}`, { headers: authHeaders() });
  if (await handleAuthFailure(res)) return;
  const data = await readError(res);
  if (!res.ok) {
    target.innerHTML = `<span class="sub">${data.message || 'No se pudo buscar el numero.'}</span>`;
    return;
  }

  if (!data.items?.length) {
    target.innerHTML = `<span class="sub">No hay tiquetes registrados para el numero ${data.number}.</span>`;
    return;
  }

  target.innerHTML = `
    <div class="numbers-summary">
      <div class="numbers-stat"><span>Tiquetes</span><strong>${data.count}</strong></div>
      <div class="numbers-stat"><span>Normal</span><strong>${money(data.main_total)}</strong></div>
      <div class="numbers-stat"><span>Reventado</span><strong>${money(data.addon_total)}</strong></div>
      <div class="numbers-stat"><span>Total</span><strong>${money(data.grand_total)}</strong></div>
    </div>
    ${data.items.map(item => {
      const fecha = new Date(item.created_at).toLocaleString('es-CR', { dateStyle: 'short', timeStyle: 'short' });
      const drawName = item.draw?.name || item.draw?.loteria_name || 'Sorteo';
      const client = item.client ? ` · Cliente: ${item.client.name}${item.prepaid_applied ? ' (prepago)' : ''}` : '';
      return `
        <div class="ticket-result">
          <div class="ticket-number">${item.number_played}</div>
          <div>
            <div><strong>Tiquete #${item.id}</strong> · ${drawName}</div>
            <div class="ticket-meta">${fecha} · Vendedor: ${item.seller?.name || 'Sin vendedor'}${client}</div>
            <div class="ticket-meta">Numero ${money(item.amount)}${item.addon_amount > 0 ? ` + Reventado ${money(item.addon_amount)}` : ''}</div>
          </div>
          <div class="ticket-total">${money(item.grand_total)}</div>
        </div>
      `;
    }).join('')}
  `;
}

async function cargarMonitorNumeros() {
  const target = document.getElementById('hot-numbers-dashboard');
  if (!target || !adminDraws.length) return;

  const activeDraws = adminDraws.filter(draw => draw.status === 'abierto').slice(0, 8);
  if (!activeDraws.length) {
    target.innerHTML = '<span class="sub">No hay sorteos abiertos para monitorear.</span>';
    return;
  }

  const results = await Promise.all(activeDraws.map(async draw => {
    try {
      const res = await fetch(`${API}/draws/${draw.id}/numbers`, { headers: authHeaders() });
      if (!res.ok) return { draw, numeros: [] };
      const data = await res.json();
      return { draw, numeros: data.numeros || [] };
    } catch {
      return { draw, numeros: [] };
    }
  }));

  target.innerHTML = `<div class="heat-dashboard">${results.map(({ draw, numeros }) => {
    const top = numeros
      .filter(item => Number(item.grand_total || item.total) > 0 || item.blocked || item.limit_amount)
      .sort((a, b) => Number(b.grand_total || b.total) - Number(a.grand_total || a.total))
      .slice(0, 6);
    const max = Math.max(...top.map(item => Number(item.grand_total || item.total)), 1);

    return `
      <div class="heat-card">
        <div class="heat-card-title">
          <span>${draw.name || draw.game_type}</span>
          <span class="sub">${formatDrawTime(draw.draw_datetime)}</span>
        </div>
        ${top.length ? top.map(item => {
          const total = Number(item.grand_total || item.total);
          const percent = Math.max(4, Math.round((total / max) * 100));
          return `
            <div class="heat-row">
              <span class="heat-num">${item.numero}</span>
              <div class="heat-bar"><div class="heat-fill" style="width:${percent}%;"></div></div>
              <span>${item.blocked ? 'Bloq.' : money(total)}</span>
            </div>
          `;
        }).join('') : '<span class="sub">Sin ventas todavia.</span>'}
      </div>
    `;
  }).join('')}</div>`;
}

function findLatestDrawForLoteria(loteriaId) {
  const draws = adminDraws.filter(d => Number(d.loteria_id) === Number(loteriaId));
  if (!draws.length) return null;

  const today = toDatetimeLocal(new Date()).slice(0, 10);
  const todaysDraws = draws.filter(d => toDatetimeLocal(d.draw_datetime).slice(0, 10) === today);

  return todaysDraws.find(d => d.is_open_for_sales)
    || todaysDraws.find(d => d.status === 'abierto' && d.is_active)
    || todaysDraws[0]
    || draws.find(d => d.is_open_for_sales)
    || draws[0];
}

// ---------- LOTERIAS ----------

async function cargarLoterias() {
  const res = await fetch(`${API}/loterias`, { headers: authHeaders() });
  if (await handleAuthFailure(res)) return;
  if (!res.ok) {
    document.getElementById('new-vendedor-loterias').innerHTML = '<span class="sub">No se pudieron cargar las loterias.</span>';
    return;
  }
  const loterias = await res.json();
  window.adminLoterias = loterias;

  const list = document.getElementById('loterias-list');
  list.innerHTML = loterias.length ? loterias.map(l => `
    <div class="row">
      <div><div class="name">${l.name}</div><div class="sub">reglas: ${l.game_type}</div></div>
      <span class="sub">${l.vendedores_count} vendedor(es)</span>
    </div>
  `).join('') : '<span class="sub">No hay loterías creadas todavía.</span>';

  // Poblar selects que dependen de la lista de loterias.
  document.getElementById('new-draw-loteria').innerHTML = loterias.map(l => `<option value="${l.id}">${l.name}</option>`).join('');
  llenarSelectLoterias('edit-draw-loteria', document.getElementById('edit-draw-loteria')?.value);

  const checklist = document.getElementById('new-vendedor-loterias');
  checklist.innerHTML = loterias.map(l => `
    <label><input type="checkbox" value="${l.id}" class="loteria-check" /> ${l.name} <span class="sub">(${l.game_type})</span></label>
  `).join('') || '<span class="sub">Creá una lotería primero.</span>';
}

async function crearLoteria() {
  const name = document.getElementById('new-loteria-name').value;
  const game_type = document.getElementById('new-loteria-type').value;

  if (!name) { alert('Falta el nombre de la lotería'); return; }

  const res = await fetch(`${API}/loterias`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ name, game_type }),
  });
  if (await handleAuthFailure(res)) return;

  if (!res.ok) { const err = await readError(res); alert(err.message || 'No se pudo crear la lotería'); return; }

  alert(`Lotería "${name}" creada.`);
  document.getElementById('new-loteria-name').value = '';
  cargarLoterias();
}

// ---------- VENDEDORES ----------

async function cargarVendedoresDetalle() {
  const res = await fetch(`${API}/users`, { headers: authHeaders() });
  if (await handleAuthFailure(res)) return;
  if (!res.ok) {
    document.getElementById('vendedores-list').innerHTML = '<span class="sub">No se pudieron cargar los vendedores.</span>';
    return;
  }
  const vendedores = await res.json();

  const list = document.getElementById('vendedores-list');
  list.innerHTML = vendedores.length ? vendedores.map(v => `
    <div class="row">
      <div>
        <div class="name">${v.name}</div>
        <div class="sub">${(v.loterias || []).map(l => l.name).join(', ') || 'sin loterías asignadas'} · ${v.active ? 'activo' : 'desactivado'}</div>
      </div>
      <div class="seller-row-actions">
        <span class="sub">${v.phone}</span>
        <span class="pill ${v.active ? 'paid' : 'off'}">${v.active ? 'activo' : 'desactivado'}</span>
        <button class="inline-btn neutral" onclick="verLoteriasVendedor(${v.id}, '${jsArg(v.name)}')">Ver loterías</button>
        <button class="inline-btn" onclick="resetearPinVendedor(${v.id}, '${jsArg(v.name)}')">Reset PIN</button>
        <button class="inline-btn ${v.active ? 'danger' : 'neutral'}" onclick="cambiarEstadoVendedor(${v.id}, '${jsArg(v.name)}', ${v.active ? 'false' : 'true'})">${v.active ? 'Desactivar' : 'Reactivar'}</button>
      </div>
    </div>
  `).join('') : '<span class="sub">No hay vendedores todavía.</span>';

  window.adminVendedoresDetalle = vendedores;
}

async function resetearPinVendedor(userId, name) {
  const pin = prompt(`Nuevo PIN de 4 digitos para ${name}`);
  if (pin === null) return;
  if (!/^\d{4}$/.test(pin)) {
    alert('El PIN debe tener exactamente 4 digitos.');
    return;
  }

  if (!await showAppConfirm(`Resetear PIN de ${name}?`, 'Reset PIN')) return;

  const res = await fetch(`${API}/users/${userId}/pin`, {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ pin }),
  });
  if (await handleAuthFailure(res)) return;
  const data = await readError(res);
  if (!res.ok) { alert(data.message || 'No se pudo resetear el PIN'); return; }

  alert(data.message || `PIN actualizado para ${name}.`);
}

async function cambiarEstadoVendedor(userId, name, active) {
  const accion = active ? 'reactivar' : 'desactivar';
  const texto = active
    ? `Reactivar al vendedor ${name}?`
    : `Desactivar al vendedor ${name}? No podra iniciar sesion ni vender, pero su historial se conserva.`;

  if (!await showAppConfirm(texto, `${accion.charAt(0).toUpperCase()}${accion.slice(1)} vendedor`)) return;

  const res = await fetch(`${API}/users/${userId}/active`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ active }),
  });
  if (await handleAuthFailure(res)) return;
  const data = await readError(res);
  if (!res.ok) { alert(data.message || 'No se pudo actualizar el vendedor'); return; }

  alert(data.message || 'Vendedor actualizado.');
  cargarVendedoresDetalle();
  cargarVendedores();
}

function verLoteriasVendedor(userId, name) {
  const vendedor = (window.adminVendedoresDetalle || []).find(v => Number(v.id) === Number(userId));
  const panel = document.getElementById('seller-loterias-panel');
  const list = document.getElementById('seller-loterias-list');
  document.getElementById('seller-loterias-title').textContent = `LOTERÍAS DE ${name.toUpperCase()}`;
  panel.classList.add('active');

  if (!vendedor || !vendedor.loterias?.length) {
    list.innerHTML = '<span class="sub">Este vendedor no tiene loterías asignadas.</span>';
    return;
  }

  list.innerHTML = `<div class="assigned-list">${vendedor.loterias.map(loteria => {
    const draw = findLatestDrawForLoteria(loteria.id);
    const drawLabel = draw
      ? formatDrawDateTime(draw.draw_datetime)
      : 'sin sorteo creado';
    const drawMeta = draw ? `${drawLabel}${drawVisibilityNote(draw)}` : drawLabel;
    const drawId = draw?.id || '';

    return `
      <div class="assigned-lottery">
        <div class="assigned-head">
          <div>
            <div class="assigned-title">${loteria.name}</div>
            <div class="assigned-meta">${drawMeta}</div>
          </div>
          <span class="pill ${draw ? drawPillClass(draw) : 'off'}">${draw ? drawStatusText(draw) : 'sin sorteo'}</span>
        </div>
        <div class="list-actions">
          <button class="inline-btn" ${drawId ? '' : 'disabled'} onclick="verListaVendedor(${userId}, ${loteria.id}, ${drawId || 0}, '${jsArg(name)}', '${jsArg(loteria.name)}')">Ver lista</button>
        </div>
      </div>
    `;
  }).join('')}</div>`;
}

async function verListaVendedor(userId, loteriaId, drawId, sellerName, loteriaName) {
  if (!drawId) {
    alert('Esta lotería todavía no tiene sorteo creado.');
    return;
  }

  activeSellerList = { userId, loteriaId, drawId, sellerName, loteriaName };
  document.getElementById('seller-number-list-panel').classList.add('active');
  await cargarListaVendedorActiva();
  startSellerListRealtime();
}

async function cargarListaVendedorActiva() {
  if (!activeSellerList) return;
  const { userId, drawId, sellerName, loteriaName } = activeSellerList;
  const res = await fetch(`${API}/draws/${drawId}/numbers`, { headers: authHeaders() });
  if (await handleAuthFailure(res)) return;
  if (!res.ok) return;

  const data = await res.json();
  const sellerData = (data.seller_breakdown || []).find(item => Number(item.seller.id) === Number(userId));
  const numeros = sellerData?.numeros || [];
  activeSellerList.data = sellerData || {
    seller: { id: userId, name: sellerName },
    sales_count: 0,
    main_total: 0,
    addon_total: 0,
    grand_total: 0,
    numbers_sold: 0,
    numeros,
  };

  document.getElementById('seller-number-list-title').textContent = `${sellerName} · ${loteriaName}`;
  document.getElementById('seller-number-list-meta').textContent =
    `${activeSellerList.data.sales_count} tiquete(s) · ${activeSellerList.data.numbers_sold} número(s) · actualizado ${new Date().toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;

  document.getElementById('seller-number-list-content').innerHTML = `
    <div class="numbers-summary">
      <div class="numbers-stat"><span>Normal</span><strong>${money(activeSellerList.data.main_total)}</strong></div>
      <div class="numbers-stat"><span>Reventado</span><strong>${money(activeSellerList.data.addon_total)}</strong></div>
      <div class="numbers-stat"><span>Total</span><strong>${money(activeSellerList.data.grand_total)}</strong></div>
      <div class="numbers-stat"><span>Números</span><strong>${activeSellerList.data.numbers_sold}</strong></div>
    </div>
    ${renderNumberGrid(numeros)}
  `;
}

function startSellerListRealtime() {
  if (sellerListRefreshTimer) return;
  sellerListRefreshTimer = setInterval(() => {
    const panel = document.getElementById('seller-number-list-panel');
    if (activeSellerList && panel?.classList.contains('active')) {
      cargarListaVendedorActiva();
    }
  }, 5000);
}

function cerrarListaVendedor() {
  activeSellerList = null;
  document.getElementById('seller-number-list-panel').classList.remove('active');
  document.getElementById('seller-number-list-content').innerHTML = '<span class="sub">Abre una lotería para ver su lista.</span>';
}

function listaVendedorTexto() {
  if (!activeSellerList?.data) return '';
  const data = activeSellerList.data;
  const vendidos = (data.numeros || []).filter(n => Number(n.grand_total ?? n.total) > 0);
  const lines = [
    `Lista ${activeSellerList.loteriaName}`,
    `Vendedor: ${activeSellerList.sellerName}`,
    `Normal: ${money(data.main_total)}`,
    `Reventado: ${money(data.addon_total)}`,
    `Total: ${money(data.grand_total)}`,
    '',
    'Números vendidos:',
    ...vendidos.map(n => `${n.numero}: ${money(n.grand_total ?? n.total)}${Number(n.addon_total || 0) > 0 ? ` (Rev ${money(n.addon_total)})` : ''}`),
  ];

  return lines.join('\n');
}

function exportarListaVendedor() {
  if (!activeSellerList?.data) { alert('Primero abre una lista.'); return; }
  const data = activeSellerList.data;
  const rows = (data.numeros || [])
    .filter(n => Number(n.grand_total ?? n.total) > 0)
    .map(n => `
      <tr>
        <td>${n.numero}</td>
        <td>${Number(n.total || 0)}</td>
        <td>${Number(n.addon_total || 0)}</td>
        <td>${Number(n.grand_total ?? n.total)}</td>
        <td>${Number(n.tickets || 0)}</td>
      </tr>
    `).join('');
  const html = `
    <html><head><meta charset="UTF-8"></head><body>
      <h2>Lista ${activeSellerList.loteriaName}</h2>
      <p>Vendedor: ${activeSellerList.sellerName}</p>
      <p>Normal: ${money(data.main_total)} | Reventado: ${money(data.addon_total)} | Total: ${money(data.grand_total)}</p>
      <table border="1">
        <thead><tr><th>Número</th><th>Normal</th><th>Reventado</th><th>Total</th><th>Tiquetes</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5">Sin ventas</td></tr>'}</tbody>
      </table>
    </body></html>
  `;

  const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `lista-${activeSellerList.sellerName}-${activeSellerList.loteriaName}.xls`.replace(/\s+/g, '-').toLowerCase();
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function compartirListaWhatsapp() {
  const text = listaVendedorTexto();
  if (!text) { alert('Primero abre una lista.'); return; }

  window.open(`https://wa.me/?text=${textArg(text)}`, '_blank', 'noopener');
}

async function crearVendedor() {
  const name = document.getElementById('new-vendedor-name').value.trim();
  const phone = document.getElementById('new-vendedor-phone').value.trim();
  const pin = document.getElementById('new-vendedor-pin').value.trim();
  const loteria_ids = Array.from(document.querySelectorAll('.loteria-check:checked')).map(el => el.value);

  if (!name || !phone || !pin) { alert('Faltan datos del vendedor'); return; }
  if (pin.length !== 4) { alert('El PIN debe tener 4 digitos.'); return; }

  const res = await fetch(`${API}/users`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ name, phone, pin, loteria_ids }),
  });
  if (await handleAuthFailure(res)) return;

  if (!res.ok) { const err = await readError(res); alert(err.message || 'No se pudo crear el vendedor'); return; }

  alert(`Vendedor "${name}" creado.`);
  document.getElementById('new-vendedor-name').value = '';
  document.getElementById('new-vendedor-phone').value = '';
  document.getElementById('new-vendedor-pin').value = '';
  document.querySelectorAll('.loteria-check').forEach(el => el.checked = false);
  cargarVendedoresDetalle();
  cargarVendedores();
}

// ---------- COMISIONES ----------

async function cargarComisiones() {
  return cargarControlVendedores();
}

async function cargarControlVendedores() {
  const params = reportParams();

  const res = await fetch(`${API}/reports/seller-control?${params.toString()}`, { headers: authHeaders() });
  if (await handleAuthFailure(res)) return;
  if (!res.ok) return;
  const data = await res.json();
  const totals = data.totals || {};

  document.getElementById('report-sales-total').textContent = money(totals.sales_total);
  document.getElementById('report-addon-total').textContent = money(totals.sales_addon);
  document.getElementById('report-commission-total').textContent = money(totals.commission_total);
  document.getElementById('report-due-total').textContent = money(totals.settlement_due);

  const tbody = document.getElementById('seller-control-rows');
  tbody.innerHTML = data.rows?.length ? data.rows.map(row => {
    const dueClass = row.settlement_due > 0 ? 'money-warning' : (row.settlement_due < 0 ? 'money-danger' : 'money-positive');
    const sellerName = jsArg(row.seller.name);
    return `
      <tr>
        <td><strong>${row.seller.name}</strong><br><span class="sub">${row.seller.phone}</span></td>
        <td>${row.sales_count}</td>
        <td>${money(row.sales_main)}</td>
        <td>${money(row.sales_addon)}</td>
        <td><strong>${money(row.sales_total)}</strong></td>
        <td>${money(row.commission_total)}</td>
        <td>${money(row.prize_total)}</td>
        <td>${money(row.cash_delivered)}</td>
        <td class="${dueClass}">${money(row.settlement_due)}</td>
        <td><span class="pill ${row.status === 'pendiente' ? 'pending' : 'paid'}">${row.status}</span></td>
        <td><button class="inline-btn" onclick="cerrarCajaVendedor(${row.seller.id}, '${sellerName}', ${Number(row.settlement_due || 0)})">Cerrar</button></td>
      </tr>
    `;
  }).join('') : '<tr><td colspan="11">Sin vendedores para mostrar.</td></tr>';

  const recent = document.getElementById('report-recent-list');
  recent.innerHTML = data.recent?.length ? data.recent.map(item => {
    const total = item.type === 'venta' ? Number(item.amount) + Number(item.addon_amount || 0) : Number(item.amount);
    const detail = [
      item.seller_name || 'Sin vendedor',
      item.draw_name || '',
      item.number_played ? `#${item.number_played}` : '',
    ].filter(Boolean).join(' · ');

    return `
      <div class="history-item">
        <span class="kind">${item.type}</span>
        <span>${detail || 'Movimiento manual'}</span>
        <strong>${money(total)}</strong>
      </div>
    `;
  }).join('') : '<span class="sub">Sin movimientos en el rango seleccionado.</span>';

  const closures = document.getElementById('report-closures-list');
  closures.innerHTML = data.closures?.length ? data.closures.map(item => `
    <div class="history-item">
      <span class="kind">Cierre #${item.id}</span>
      <span>${item.seller_name || 'Vendedor'} · ${item.period_from} a ${item.period_to} · por ${item.closed_by_name || 'admin'}</span>
      <strong>${money(item.settlement_amount)}</strong>
    </div>
  `).join('') : '<span class="sub">Todavia no hay cierres en este rango.</span>';
}

function reportParams() {
  const params = new URLSearchParams();
  const from = document.getElementById('report-from')?.value;
  const to = document.getElementById('report-to')?.value;
  const drawId = document.getElementById('report-draw-select')?.value;
  const sellerId = document.getElementById('report-seller-select')?.value;

  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (drawId) params.set('draw_id', drawId);
  if (sellerId) params.set('user_id', sellerId);

  return params;
}

async function exportarReporte(type) {
  const params = reportParams();
  const endpoint = type === 'pdf' ? 'pdf' : 'excel';
  const extension = type === 'pdf' ? 'pdf' : 'xls';
  const res = await fetch(`${API}/reports/seller-control/export/${endpoint}?${params.toString()}`, { headers: authHeaders() });
  if (await handleAuthFailure(res)) return;
  if (!res.ok) { alert('No se pudo exportar el reporte'); return; }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const from = document.getElementById('report-from')?.value || 'inicio';
  const to = document.getElementById('report-to')?.value || 'fin';
  link.href = url;
  link.download = `control-vendedores-${from}-${to}.${extension}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function cerrarCajaVendedor(userId, name, amount) {
  const params = reportParams();
  const label = amount > 0
    ? `${name} debe entregar ${money(amount)}.`
    : amount < 0
      ? `${name} queda a favor por ${money(Math.abs(amount))}.`
      : `${name} esta cuadrado en este rango.`;

  const ok = await window.showAppConfirm(
    `${label}\n\nSe guardara un cierre formal y un ajuste automatico para dejar el periodo cuadrado.`,
    'Cerrar caja del vendedor'
  );
  if (!ok) return;

  const body = {
    user_id: userId,
    from: params.get('from'),
    to: params.get('to'),
    draw_id: params.get('draw_id') || null,
    note: 'Cierre desde panel admin',
  };

  const res = await fetch(`${API}/reports/seller-control/close`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  if (await handleAuthFailure(res)) return;
  if (!res.ok) { const err = await readError(res); alert(err.message || 'No se pudo cerrar la caja'); return; }

  alert('Cierre de caja registrado.');
  cargarControlVendedores();
  cargarVendedores();
}

// ---------- CAJA ----------

async function cargarVendedores() {
  const res = await fetch(`${API}/vendedores`, { headers: authHeaders() });
  if (await handleAuthFailure(res)) return;
  if (!res.ok) {
    document.getElementById('balances-list').innerHTML = '<span class="sub">No se pudieron cargar los saldos.</span>';
    cargarVendedoresDetalle();
    return;
  }
  const vendedores = await res.json();

  const balances = document.getElementById('balances-list');
  balances.innerHTML = vendedores.length ? vendedores.map(v => `
    <div class="row">
      <span class="name">${v.name}</span>
      <span style="color:${v.balance < 0 ? 'var(--coral)' : 'var(--mint)'};">
        ${v.balance < 0 ? `debe ₡${Math.abs(v.balance).toLocaleString('es-CR')}` : `a favor ₡${Number(v.balance).toLocaleString('es-CR')}`}
      </span>
    </div>
  `).join('') : '<span class="sub">No hay vendedores registrados.</span>';

  const select = document.getElementById('vendedor-select');
  select.innerHTML = vendedores.map(v =>
    `<option value="${v.id}">${v.name} — ${v.balance < 0 ? 'debe' : 'a favor'} ₡${Math.abs(v.balance).toLocaleString('es-CR')}</option>`
  ).join('');

  const reportSellerSelect = document.getElementById('report-seller-select');
  if (reportSellerSelect) {
    const selected = reportSellerSelect.value;
    reportSellerSelect.innerHTML = '<option value="">Todos los vendedores</option>' + vendedores.map(v =>
      `<option value="${v.id}">${v.name}</option>`
    ).join('');
    reportSellerSelect.value = selected;
  }

  cargarVendedoresDetalle();
}

async function registrarMovimiento() {
  const user_id = document.getElementById('vendedor-select').value;
  const direction = document.getElementById('direction-select').value;
  const amount = document.getElementById('cash-amount').value;
  const note = document.getElementById('cash-note').value;

  if (!user_id || !amount) { alert('Elegí un vendedor y un monto'); return; }

  const res = await fetch(`${API}/cash-movements`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ user_id, amount, direction, note }),
  });
  if (await handleAuthFailure(res)) return;

  if (!res.ok) { const err = await readError(res); alert(err.message || 'No se pudo registrar el movimiento'); return; }

  const data = await res.json();
  alert(`Movimiento registrado. Nuevo saldo: ₡${data.nuevo_saldo}`);
  document.getElementById('cash-amount').value = '';
  document.getElementById('cash-note').value = '';
  cargarVendedores();
  cargarComisiones();
}

// ---------- CLIENTES PREPAGO ----------

async function cargarClientes() {
  const selectedRecharge = document.getElementById('recharge-client-select')?.value || '';
  const res = await fetch(`${API}/clients`, { headers: authHeaders() });
  if (await handleAuthFailure(res)) return;
  if (!res.ok) return;

  const clients = await res.json();
  window.adminClients = clients;

  const list = document.getElementById('clients-list');
  list.innerHTML = clients.length ? `<div class="client-grid">${clients.map(client => `
    <div class="client-card ${Number(activeClientHistoryId) === Number(client.id) ? 'active-client' : ''}">
      <div class="client-card-head">
        <div>
          <div class="client-name">${client.name}</div>
          <div class="client-phone">${client.phone || 'sin telefono'}</div>
        </div>
        <div class="client-balance">${money(client.balance)}</div>
      </div>
      <div class="list-actions">
        <button class="inline-btn neutral" onclick="seleccionarClienteRecarga(${client.id})">Recargar</button>
        <button class="inline-btn" onclick="cargarMovimientosCliente(${client.id})">Historial</button>
        <button class="inline-btn danger" onclick="eliminarCliente(${client.id})">Eliminar</button>
      </div>
    </div>
  `).join('')}</div>` : '<span class="sub">Todavia no hay clientes prepago.</span>';

  const select = document.getElementById('recharge-client-select');
  select.innerHTML = clients.map(client => `<option value="${client.id}">${client.name} - ${money(client.balance)}</option>`).join('');
  if (selectedRecharge && clients.some(client => Number(client.id) === Number(selectedRecharge))) {
    select.value = selectedRecharge;
  }
}

async function crearCliente() {
  const name = document.getElementById('new-client-name').value;
  const phone = document.getElementById('new-client-phone').value;
  const initial_balance = document.getElementById('new-client-balance').value || 0;

  if (!name) { alert('Falta el nombre del cliente'); return; }

  const res = await fetch(`${API}/clients`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ name, phone, initial_balance }),
  });
  if (await handleAuthFailure(res)) return;
  if (!res.ok) { const err = await readError(res); alert(err.message || 'No se pudo crear el cliente'); return; }

  document.getElementById('new-client-name').value = '';
  document.getElementById('new-client-phone').value = '';
  document.getElementById('new-client-balance').value = '';
  alert('Cliente prepago creado.');
  cargarClientes();
}

function seleccionarClienteRecarga(clientId) {
  document.getElementById('recharge-client-select').value = clientId;
  document.getElementById('recharge-amount').focus();
}

async function recargarCliente() {
  const clientId = document.getElementById('recharge-client-select').value;
  const amount = document.getElementById('recharge-amount').value;
  const note = document.getElementById('recharge-note').value;

  if (!clientId || !amount) { alert('Selecciona un cliente y monto'); return; }

  const res = await fetch(`${API}/clients/${clientId}/recharge`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ amount, note }),
  });
  if (await handleAuthFailure(res)) return;
  if (!res.ok) { const err = await readError(res); alert(err.message || 'No se pudo registrar la recarga'); return; }

  document.getElementById('recharge-amount').value = '';
  document.getElementById('recharge-note').value = '';
  alert('Recarga registrada.');
  cargarClientes();
  cargarMovimientosCliente(clientId);
}

async function cargarMovimientosCliente(clientId, options = {}) {
  activeClientHistoryId = clientId;
  if (!options.quiet) seleccionarClienteRecarga(clientId);

  if (!options.skipClientRefresh) await cargarClientes();

  const target = document.getElementById('client-movements-list');
  if (!options.quiet) {
    const client = (window.adminClients || []).find(item => Number(item.id) === Number(clientId));
    target.innerHTML = `<span class="sub">Cargando historial de ${client?.name || 'cliente'}...</span>`;
    if (!options.noScroll) target.closest('.card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const res = await fetch(`${API}/clients/${clientId}/movements`, { headers: authHeaders() });
  if (await handleAuthFailure(res)) return;
  if (!res.ok) {
    if (!options.quiet) {
      const err = await readError(res);
      alert(err.message || 'No se pudo cargar el historial del cliente');
    }
    return;
  }

  const movements = await res.json();
  const client = (window.adminClients || []).find(item => Number(item.id) === Number(clientId));
  target.innerHTML = `
    <div class="row">
      <div>
        <div class="name">${client?.name || 'Cliente'}</div>
        <div class="sub">Saldo actual ${money(client?.balance || 0)}</div>
      </div>
      <span class="pill pending">Historial</span>
    </div>
    ${movements.length ? movements.map(movement => {
      const isCompra = movement.type === 'compra';
      const detail = isCompra
        ? `${movement.draw_name || 'Sorteo'}${movement.number_played ? ` · numero ${movement.number_played}` : ''}${movement.prepaid_applied ? ' · descontado' : ''}`
        : (movement.note || 'Recarga de saldo');
      return `
    <div class="row">
      <div>
        <div class="name">${isCompra ? 'Compra' : 'Recarga'}</div>
        <div class="sub">${new Date(movement.created_at).toLocaleString('es-CR', { dateStyle: 'short', timeStyle: 'short' })} · ${movement.user_name || client?.name || ''} · ${detail}</div>
      </div>
      <span style="color:${movement.amount < 0 ? 'var(--coral)' : 'var(--mint)'};">${money(movement.amount)}</span>
    </div>
    `;
    }).join('') : '<span class="sub">Este cliente todavia no tiene movimientos.</span>'}
  `;
}

async function eliminarCliente(clientId) {
  const client = (window.adminClients || []).find(item => Number(item.id) === Number(clientId));
  if (!await showAppConfirm(`Eliminar de la lista activa a ${client?.name || 'este cliente'}?\nEl historial de recargas y compras queda guardado.`, 'Eliminar cliente')) return;

  const res = await fetch(`${API}/clients/${clientId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (await handleAuthFailure(res)) return;
  const data = await readError(res);
  if (!res.ok) { alert(data.message || 'No se pudo eliminar el cliente'); return; }

  if (Number(activeClientHistoryId) === Number(clientId)) {
    activeClientHistoryId = null;
    document.getElementById('client-movements-list').innerHTML = '<span class="sub">Selecciona un cliente para ver movimientos.</span>';
  }
  alert(data.message || 'Cliente eliminado.');
  cargarClientes();
}

// ---------- REGLAS ----------

async function cargarReglas() {
  const res = await fetch(`${API}/tenant-rules`, { headers: authHeaders() });
  if (await handleAuthFailure(res)) return;
  if (!res.ok) return;
  const reglas = await res.json();
  const list = document.getElementById('rules-list');

  const tipoSelect = document.getElementById('new-loteria-type');
  if (tipoSelect) tipoSelect.innerHTML = reglas.map(r => `<option value="${r.game_type}">${r.game_type}</option>`).join('');

  list.innerHTML = reglas.map(r => {
    if (r.partial_match_rules) {
      const pm = r.partial_match_rules;
      return `
        <div class="rule-block">
          <div class="rule-title">${r.game_type}</div>
          <div class="rule-fields three">
            <div><label>3 aciertos</label><input type="number" id="pm3-${r.id}" value="${pm['3'] ?? ''}" /></div>
            <div><label>2 aciertos</label><input type="number" id="pm2-${r.id}" value="${pm['2'] ?? ''}" /></div>
            <div><label>1 acierto</label><input type="number" id="pm1-${r.id}" value="${pm['1'] ?? ''}" /></div>
          </div>
          <label style="margin-top:10px;">Comisión %</label>
          <input type="number" id="comm-${r.id}" value="${r.commission_pct}" />
          <button class="btn ghost" onclick="guardarReglaParcial(${r.id})">Guardar ${r.game_type}</button>
        </div>`;
    }
    return `
      <div class="rule-block">
        <div class="rule-title">${r.game_type}</div>
        <div class="rule-fields">
          <div><label>Paga (veces la inversión)</label><input type="number" id="mult-${r.id}" value="${r.prize_multiplier}" /></div>
          ${r.addon_multiplier ? `<div><label>Paga Reventado</label><input type="number" id="addon-${r.id}" value="${r.addon_multiplier}" /></div>` : '<div></div>'}
          <div><label>Comisión %</label><input type="number" id="comm-${r.id}" value="${r.commission_pct}" /></div>
          <div><label>Máx. por número</label><input type="number" id="max-${r.id}" value="${r.max_bet_per_number ?? ''}" /></div>
        </div>
        <button class="btn ghost" onclick="guardarRegla(${r.id})">Guardar ${r.game_type}</button>
      </div>`;
  }).join('');
}

async function guardarRegla(id) {
  const body = {
    prize_multiplier: document.getElementById(`mult-${id}`).value,
    commission_pct: document.getElementById(`comm-${id}`).value,
    max_bet_per_number: document.getElementById(`max-${id}`).value || null,
  };
  const addonInput = document.getElementById(`addon-${id}`);
  if (addonInput) body.addon_multiplier = addonInput.value;
  await guardarReglaRequest(id, body);
}

async function guardarReglaParcial(id) {
  const body = {
    commission_pct: document.getElementById(`comm-${id}`).value,
    partial_match_rules: {
      '3': document.getElementById(`pm3-${id}`).value,
      '2': document.getElementById(`pm2-${id}`).value,
      '1': document.getElementById(`pm1-${id}`).value,
    },
  };
  await guardarReglaRequest(id, body);
}

async function guardarReglaRequest(id, body) {
  const res = await fetch(`${API}/tenant-rules/${id}`, {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  if (await handleAuthFailure(res)) return;
  if (!res.ok) { alert('No se pudo guardar la regla'); return; }
  alert('Regla actualizada');
  cargarReglas();
}

// ---------- SESION EXISTENTE ----------

if (getToken()) mostrarApp();
