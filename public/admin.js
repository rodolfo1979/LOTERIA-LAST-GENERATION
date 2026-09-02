const API = '/api';

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
  window.location.href = '/admin.html?v=9';
}

async function handleAuthFailure(res) {
  if (res.status !== 401 && res.status !== 419) return false;
  clearAdminSession();
  alert('La sesion de administrador vencio. Inicia sesion de nuevo.');
  window.location.href = '/admin.html?v=9';
  return true;
}

async function readError(res) {
  try {
    return await res.json();
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
  cargarSorteos();
  cargarComisiones();
  cargarVendedores();
  cargarReglas();
  cargarLoterias();
}

// ---------- SORTEOS ----------

async function cargarSorteos() {
  const res = await fetch(`${API}/draws`, { headers: authHeaders() });
  if (await handleAuthFailure(res)) return;
  if (!res.ok) return;
  const draws = await res.json();
  const abiertos = draws.filter(d => d.status === 'abierto');

  const list = document.getElementById('draws-list');
  list.innerHTML = draws.length ? draws.map(d => `
    <div class="draw-item">
      <div class="draw-head">
        <div>
          <div class="draw-name">${d.name || d.game_type} · ${new Date(d.draw_datetime).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' })}</div>
          <div class="draw-meta">ID #${d.id} · reglas: ${d.game_type}</div>
        </div>
        <span class="pill ${d.is_open_for_sales ? 'pending' : 'paid'}">${d.is_open_for_sales ? 'vendible' : d.status}</span>
      </div>
    </div>
  `).join('') : '<span class="sub">No hay sorteos creados.</span>';

  const closeSelect = document.getElementById('close-draw-select');
  closeSelect.innerHTML = abiertos.map(d =>
    `<option value="${d.id}">${d.name || d.game_type} · ${new Date(d.draw_datetime).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' })} (#${d.id})</option>`
  ).join('') || '<option value="">No hay sorteos abiertos</option>';

  const numbersSelect = document.getElementById('numbers-draw-select');
  numbersSelect.innerHTML = draws.map(d =>
    `<option value="${d.id}">${d.name || d.game_type} · ${new Date(d.draw_datetime).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' })} (#${d.id})</option>`
  ).join('') || '<option value="">No hay sorteos creados</option>';

  const reportDrawSelect = document.getElementById('report-draw-select');
  if (reportDrawSelect) {
    const selected = reportDrawSelect.value;
    reportDrawSelect.innerHTML = '<option value="">Todos los sorteos</option>' + draws.map(d =>
      `<option value="${d.id}">${d.name || d.game_type} · ${new Date(d.draw_datetime).toLocaleDateString('es-CR')} ${new Date(d.draw_datetime).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' })}</option>`
    ).join('');
    reportDrawSelect.value = selected;
  }

  if (draws.length) cargarNumeros();
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
  const drawId = document.getElementById('numbers-draw-select').value;
  const grid = document.getElementById('numbers-grid');
  if (!drawId) {
    grid.innerHTML = '<span class="sub">No hay sorteos para mostrar.</span>';
    return;
  }

  const res = await fetch(`${API}/draws/${drawId}/numbers`, { headers: authHeaders() });
  if (await handleAuthFailure(res)) return;
  if (!res.ok) return;

  const data = await res.json();
  const vendidos = data.numeros.filter(n => Number(n.total) > 0);
  const totalVendido = vendidos.reduce((sum, n) => sum + Number(n.total), 0);
  const numerosRiesgo = data.numeros.filter(n => n.en_riesgo).length;
  const summary = `
    <div class="numbers-summary">
      <div class="numbers-stat"><span>Numeros vendidos</span><strong>${vendidos.length}</strong></div>
      <div class="numbers-stat"><span>Total vendido</span><strong>₡${totalVendido.toLocaleString('es-CR')}</strong></div>
      <div class="numbers-stat"><span>En riesgo</span><strong>${numerosRiesgo}</strong></div>
    </div>
  `;

  if (Array.isArray(data.numeros) && data.numeros.length > 0 && data.numeros[0].numero?.length === 2) {
    // Cuadricula completa 00-99.
    grid.innerHTML = `${summary}<div class="grid-99">${data.numeros.map(n => `
      <div class="grid-cell ${n.en_riesgo ? 'risk' : (n.total > 0 ? 'has-sales' : '')}">
        <div class="num">${n.numero}</div>
        <div class="amt">${n.total > 0 ? '₡' + n.total.toLocaleString('es-CR') : '—'}</div>
      </div>
    `).join('')}</div>`;
  } else {
    // Lista simple para juegos de 3+ digitos.
    grid.innerHTML = data.numeros.length ? summary + data.numeros.map(n => `
      <div class="row">
        <span class="name">${n.numero}</span>
        <span>₡${n.total.toLocaleString('es-CR')} <span class="sub">(${n.tickets} tiquetes)</span> ${n.en_riesgo ? '<span class="pill risk">riesgo</span>' : ''}</span>
      </div>
    `).join('') : '<span class="sub">Sin ventas todavía.</span>';
  }
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

  const list = document.getElementById('loterias-list');
  list.innerHTML = loterias.length ? loterias.map(l => `
    <div class="row">
      <div><div class="name">${l.name}</div><div class="sub">reglas: ${l.game_type}</div></div>
      <span class="sub">${l.vendedores_count} vendedor(es)</span>
    </div>
  `).join('') : '<span class="sub">No hay loterías creadas todavía.</span>';

  // Poblar selects que dependen de la lista de loterias.
  document.getElementById('new-draw-loteria').innerHTML = loterias.map(l => `<option value="${l.id}">${l.name}</option>`).join('');

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
      <div><div class="name">${v.name}</div><div class="sub">${v.loterias.join(', ') || 'sin loterías asignadas'}</div></div>
      <span class="sub">${v.phone}</span>
    </div>
  `).join('') : '<span class="sub">No hay vendedores todavía.</span>';
}

async function crearVendedor() {
  const name = document.getElementById('new-vendedor-name').value;
  const phone = document.getElementById('new-vendedor-phone').value;
  const pin = document.getElementById('new-vendedor-pin').value;
  const loteria_ids = Array.from(document.querySelectorAll('.loteria-check:checked')).map(el => el.value);

  if (!name || !phone || !pin) { alert('Faltan datos del vendedor'); return; }

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
