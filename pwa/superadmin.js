const API = '/api';

function getToken() { return localStorage.getItem('superadmin_token'); }

function authHeaders(extra = {}) {
  return {
    Accept: 'application/json',
    Authorization: `Bearer ${getToken()}`,
    ...extra,
  };
}

function clearSuperadminSession() {
  localStorage.removeItem('superadmin_token');
}

function logoutSuperadmin() {
  clearSuperadminSession();
  window.location.href = '/superadmin.html?v=3';
}

async function handleAuthFailure(res) {
  if (res.status !== 401 && res.status !== 419) return false;
  clearSuperadminSession();
  alert('La sesion de superadmin vencio. Inicia sesion de nuevo.');
  window.location.href = '/superadmin.html?v=3';
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

  if (data.user.role !== 'superadmin') {
    alert('Este usuario no es superadmin.');
    return;
  }

  localStorage.setItem('superadmin_token', data.token);
  mostrarApp();
}

function mostrarApp() {
  window.scrollTo(0, 0);
  document.documentElement.scrollLeft = 0;
  document.body.scrollLeft = 0;
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-screen').style.display = 'block';
  cargarTenants();
  cargarPlanes();
}

// ---------- TENANTS ----------

async function cargarTenants() {
  const res = await fetch(`${API}/superadmin/tenants`, { headers: authHeaders() });
  if (await handleAuthFailure(res)) return;
  if (!res.ok) return;
  const tenants = await res.json();

  const list = document.getElementById('tenants-list');
  list.innerHTML = tenants.length ? tenants.map(t => `
    <div class="row">
      <div>
        <div class="name">${t.name}</div>
        <div class="sub">${t.plan?.name || 'sin plan'} · ${t.vendedores_count}/${t.plan?.max_vendedores ?? '∞'} vendedores</div>
        <div class="sub">Admins: ${(t.users || []).map(u => `${u.name} (${u.phone})`).join(', ') || 'sin admin'}</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end;">
        <span class="pill ${t.status}">${t.status}</span>
        ${(t.users || []).map(u => `<button class="btn small ghost" onclick="resetearPinTenantAdmin(${t.id}, ${u.id}, '${jsArg(u.name)}')">Reset PIN admin</button>`).join('')}
      </div>
    </div>
  `).join('') : '<span class="sub">No hay tenants todavía.</span>';
}

function jsArg(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function money(value) {
  return `₡${Number(value || 0).toLocaleString('es-CR')}`;
}

function nullableNumberValue(value) {
  return value === null || value === undefined || value === '' ? '' : Number(value);
}

async function resetearPinTenantAdmin(tenantId, userId, name) {
  const pin = prompt(`Nuevo PIN de 4 digitos para ${name}`);
  if (pin === null) return;
  if (!/^\d{4}$/.test(pin)) {
    alert('El PIN debe tener exactamente 4 digitos.');
    return;
  }

  const confirmar = window.showAppConfirm
    ? await showAppConfirm(`Resetear PIN de ${name}?`, 'Reset PIN admin')
    : window.confirm(`Resetear PIN de ${name}?`);
  if (!confirmar) return;

  const res = await fetch(`${API}/superadmin/tenants/${tenantId}/admin-pin`, {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ user_id: userId, pin }),
  });
  if (await handleAuthFailure(res)) return;
  const data = await readError(res);
  if (!res.ok) { alert(data.message || 'No se pudo resetear el PIN del admin'); return; }

  alert(data.message || `PIN actualizado para ${name}.`);
}

async function crearTenant() {
  const body = {
    name: document.getElementById('new-tenant-name').value,
    plan_id: document.getElementById('new-tenant-plan').value,
    subscription_ends_at: document.getElementById('new-tenant-ends').value || null,
    admin_name: document.getElementById('new-admin-name').value,
    admin_phone: document.getElementById('new-admin-phone').value,
    admin_pin: document.getElementById('new-admin-pin').value,
  };

  if (!body.name || !body.plan_id || !body.admin_name || !body.admin_phone || !body.admin_pin) {
    alert('Faltan datos del tenant o del admin');
    return;
  }

  const res = await fetch(`${API}/superadmin/tenants`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  if (await handleAuthFailure(res)) return;

  if (!res.ok) { const err = await readError(res); alert(err.message || 'No se pudo crear el tenant'); return; }

  alert(`Tenant "${body.name}" creado. Admin: ${body.admin_phone} / PIN ${body.admin_pin}`);
  ['new-tenant-name', 'new-admin-name', 'new-admin-phone', 'new-admin-pin', 'new-tenant-ends'].forEach(id => document.getElementById(id).value = '');
  cargarTenants();
}

// ---------- PLANES ----------

async function cargarPlanes() {
  const res = await fetch(`${API}/superadmin/plans`, { headers: authHeaders() });
  if (await handleAuthFailure(res)) return;
  if (!res.ok) return;
  const planes = await res.json();

  const list = document.getElementById('planes-list');
  const activePlans = planes.filter(p => p.active !== false);
  const tenantsTotal = planes.reduce((total, p) => total + Number(p.tenants_count || 0), 0);
  const averagePrice = activePlans.length
    ? activePlans.reduce((total, p) => total + Number(p.price_monthly || 0), 0) / activePlans.length
    : 0;

  document.getElementById('plans-active-count').textContent = activePlans.length;
  document.getElementById('plans-tenant-count').textContent = tenantsTotal;
  document.getElementById('plans-average-price').textContent = money(averagePrice);

  list.innerHTML = planes.length ? `<div class="plan-grid">${planes.map(p => `
    <div class="plan-card ${p.active === false ? 'inactivo' : ''}">
      <div class="plan-head">
        <div>
          <div class="plan-name">${p.name}</div>
          <div class="plan-price">${money(p.price_monthly)}<span class="sub"> / mes</span></div>
        </div>
        <span class="pill ${p.active === false ? 'suspendido' : 'activo'}">${p.active === false ? 'inactivo' : 'activo'}</span>
      </div>
      <div class="plan-limits">
        <span>${p.max_vendedores ?? '∞'} vendedores</span>
        <span>${p.max_loterias ?? '∞'} loterías</span>
        <span>${p.tenants_count || 0} tenant(s)</span>
      </div>
      <div class="form-grid" style="grid-template-columns:1.2fr .8fr .8fr .8fr;margin-bottom:10px;">
        <input id="plan-name-${p.id}" type="text" value="${p.name}" aria-label="Nombre del plan" />
        <input id="plan-price-${p.id}" type="number" min="0" value="${Number(p.price_monthly || 0)}" aria-label="Precio mensual" />
        <input id="plan-sellers-${p.id}" type="number" min="1" value="${nullableNumberValue(p.max_vendedores)}" placeholder="∞" aria-label="Máximo vendedores" />
        <input id="plan-loterias-${p.id}" type="number" min="1" value="${nullableNumberValue(p.max_loterias)}" placeholder="∞" aria-label="Máximo loterías" />
      </div>
      <div class="plan-actions">
        <button class="btn small" onclick="actualizarPlan(${p.id})">Guardar cambios</button>
        <button class="btn small ghost" onclick="cambiarEstadoPlan(${p.id}, ${p.active === false ? 'true' : 'false'}, '${jsArg(p.name)}')">${p.active === false ? 'Activar' : 'Desactivar'}</button>
      </div>
    </div>
  `).join('')}</div>` : '<div class="empty-state">No hay planes creados. Crea tu primer plan personalizado abajo.</div>';

  const tenantPlanSelect = document.getElementById('new-tenant-plan');
  tenantPlanSelect.innerHTML = activePlans.length
    ? activePlans.map(p => `<option value="${p.id}">${p.name} (${money(p.price_monthly)}/mes)</option>`).join('')
    : '<option value="">Crea un plan activo primero</option>';
}

async function crearPlan() {
  const body = {
    name: document.getElementById('new-plan-name').value,
    price_monthly: document.getElementById('new-plan-price').value,
    max_vendedores: document.getElementById('new-plan-max-vendedores').value || null,
    max_loterias: document.getElementById('new-plan-max-loterias').value || null,
  };

  if (!body.name || !body.price_monthly) { alert('Falta el nombre o el precio'); return; }

  const res = await fetch(`${API}/superadmin/plans`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  if (await handleAuthFailure(res)) return;

  if (!res.ok) { const err = await readError(res); alert(err.message || 'No se pudo crear el paquete'); return; }

  alert(`Paquete "${body.name}" creado.`);
  document.getElementById('new-plan-name').value = '';
  document.getElementById('new-plan-price').value = '';
  document.getElementById('new-plan-max-vendedores').value = '';
  document.getElementById('new-plan-max-loterias').value = '';
  cargarPlanes();
}

async function actualizarPlan(planId) {
  const body = {
    name: document.getElementById(`plan-name-${planId}`).value.trim(),
    price_monthly: document.getElementById(`plan-price-${planId}`).value,
    max_vendedores: document.getElementById(`plan-sellers-${planId}`).value || null,
    max_loterias: document.getElementById(`plan-loterias-${planId}`).value || null,
  };

  if (!body.name || body.price_monthly === '') {
    alert('El plan necesita nombre y precio.');
    return;
  }

  const res = await fetch(`${API}/superadmin/plans/${planId}`, {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  if (await handleAuthFailure(res)) return;
  const data = await readError(res);
  if (!res.ok) { alert(data.message || 'No se pudo actualizar el plan'); return; }

  alert('Plan actualizado.');
  cargarPlanes();
}

async function cambiarEstadoPlan(planId, active, name) {
  const accion = active ? 'activar' : 'desactivar';
  const confirmar = window.showAppConfirm
    ? await showAppConfirm(`Quieres ${accion} el plan ${name}?`, `${active ? 'Activar' : 'Desactivar'} plan`)
    : window.confirm(`Quieres ${accion} el plan ${name}?`);
  if (!confirmar) return;

  const res = await fetch(`${API}/superadmin/plans/${planId}/active`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ active }),
  });
  if (await handleAuthFailure(res)) return;
  const data = await readError(res);
  if (!res.ok) { alert(data.message || 'No se pudo cambiar el estado del plan'); return; }

  cargarPlanes();
}

if (getToken()) mostrarApp();
