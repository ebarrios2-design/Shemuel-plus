// ============================================================
// Deteccion de tenant + branding compartido entre las paginas.
//
// El tenant debe ser explícito para evitar que una solicitud se resuelva para
// otra universidad. En producción se toma del subdominio; en desarrollo
// se toma de ?tenant=udi o del encabezado X-Tenant enviado por el cliente.
// ============================================================

const API_BASE = window.location.protocol === 'file:'
  ? 'http://localhost:4000'
  : `${window.location.protocol}//${window.location.hostname}:4000`;

function detectarTenantSlug() {
  const params = new URLSearchParams(window.location.search);
  const slugFromUrl = params.get('tenant')?.trim().toLowerCase();
  const baseDomain = window.location.hostname.split('.').slice(-2).join('.');
  const slugFromHost = window.location.hostname.startsWith('localhost')
    ? null
    : window.location.hostname.replace(`.${baseDomain}`, '');
  const slugFromStorage = localStorage.getItem('shemuel_tenant');

  const slug = slugFromUrl || slugFromHost || slugFromStorage;

  if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error('No se pudo determinar un tenant válido. Abre la URL con ?tenant=udi o ?tenant=uan.');
  }

  localStorage.setItem('shemuel_tenant', slug);
  return slug;
}

function redirectToLogin(tenant) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tenant)) return;

  const loginUrl = new URL('../login.html', window.location.href);
  loginUrl.searchParams.set('tenant', tenant);
  localStorage.setItem('shemuel_tenant', tenant);
  window.location.assign(loginUrl.toString());
}

async function cargarInstitucion() {
  const slug = detectarTenantSlug();
  const res = await fetch(`${API_BASE}/api/public/institucion`, {
    headers: { 'X-Tenant': slug },
  });

  if (!res.ok) {
    throw new Error('No se pudo cargar la institucion. ¿Esta corriendo el backend?');
  }

  const institucion = await res.json();
  aplicarBranding(institucion);
  return institucion;
}

function aplicarBranding(institucion) {
  const root = document.documentElement.style;
  root.setProperty('--tenant-color', institucion.colorPrimario || '#1E3A5F');
  root.setProperty('--tenant-color-soft', `${institucion.colorPrimario || '#1E3A5F'}22`);

  document.querySelectorAll('[data-tenant-nombre]').forEach((el) => {
    el.textContent = institucion.nombre;
  });
  document.querySelectorAll('[data-tenant-slug]').forEach((el) => {
    el.textContent = `${institucion.subdominio}.shemuel.app`;
  });
}
