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
      </div>
      <span class="pill ${t.status}">${t.status}</span>
    </div>
  `).join('') : '<span class="sub">No hay tenants todavía.</span>';
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
  list.innerHTML = planes.length ? planes.map(p => `
    <div class="row">
      <div>
        <div class="name">${p.name}</div>
        <div class="sub">₡${Number(p.price_monthly).toLocaleString('es-CR')}/mes · hasta ${p.max_vendedores ?? '∞'} vendedores</div>
      </div>
      <span class="sub">${p.tenants_count} tenant(s)</span>
    </div>
  `).join('') : '<span class="sub">No hay paquetes creados todavía.</span>';

  document.getElementById('new-tenant-plan').innerHTML = planes.map(p => `<option value="${p.id}">${p.name} (₡${Number(p.price_monthly).toLocaleString('es-CR')}/mes)</option>`).join('');
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

if (getToken()) mostrarApp();
