// ============================================================
// Deteccion de tenant + branding compartido entre las 3 paginas.
//
// En produccion el subdominio real ya viene en location.hostname
// (udi.shemuel.app). En desarrollo local, como no siempre hay DNS
// configurado, se acepta:
//   1. udi.localhost:4000  (subdominio real de localhost)
//   2. ?tenant=udi en la URL
//   3. valor guardado en localStorage de una visita anterior
// ============================================================

const API_BASE = window.location.port === '4000'
  ? '' // servido por el mismo backend Express (mismo host:puerto)
  : `${window.location.protocol}//${window.location.hostname}:4000`;

function detectarTenantSlug() {
  const host = window.location.hostname;

  if (host.includes('.localhost')) {
    return host.split('.localhost')[0];
  }

  const params = new URLSearchParams(window.location.search);
  if (params.get('tenant')) {
    localStorage.setItem('shemuel_tenant', params.get('tenant'));
    return params.get('tenant');
  }

  if (localStorage.getItem('shemuel_tenant')) {
    return localStorage.getItem('shemuel_tenant');
  }

  return 'udi'; // fallback de demo
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
