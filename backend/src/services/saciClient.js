function crearErrorServicio(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function llamarSaci(ruta, payload) {
  const baseUrl = process.env.SACI_URL || 'http://127.0.0.1:4001';
  const token = process.env.SACI_INTERNAL_TOKEN;
  if (!token) {
    throw crearErrorServicio('SACI_INTERNAL_TOKEN no está configurado.', 503);
  }

  let response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    response = await fetch(`${baseUrl}/internal/ssre${ruta}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Service-Token': token,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (_err) {
    throw crearErrorServicio('No se pudo conectar con SACI.', 503);
  } finally {
    clearTimeout(timeout);
  }

  let data;
  try {
    data = await response.json();
  } catch (_err) {
    throw crearErrorServicio('SACI devolvió una respuesta no válida.', 502);
  }
  if (!response.ok) {
    throw crearErrorServicio(data.error || 'SACI rechazó la solicitud interna.', response.status);
  }
  return data;
}

async function resolverTenant(tenantId, subdominio) {
  const tenant = await llamarSaci('/tenant', { tenantId, subdominio });
  if (!tenant || typeof tenant.id !== 'string') {
    throw crearErrorServicio('SACI devolvió datos de tenant no válidos.', 502);
  }
  return tenant;
}

async function listarAsignaciones(tenantId, userId, rol) {
  const asignaciones = await llamarSaci('/asignaciones/listar', { tenantId, userId, rol });
  if (!Array.isArray(asignaciones)) {
    throw crearErrorServicio('SACI devolvió una lista de asignaciones no válida.', 502);
  }
  return asignaciones;
}

async function validarAsignacion(tenantId, userId, rol, asignacionId, estudianteId) {
  const result = await llamarSaci('/asignaciones/validar', {
    tenantId,
    userId,
    rol,
    asignacionId,
    estudianteId,
  });
  if (typeof result.autorizado !== 'boolean') {
    throw crearErrorServicio('SACI devolvió un resultado de autorización no válido.', 502);
  }
  return result.autorizado;
}

async function acreditarHoras(tenantId, asignacionId, horas, claveIdempotencia) {
  return llamarSaci(`/asignaciones/${encodeURIComponent(asignacionId)}/acreditar-horas`, {
    tenantId,
    horas,
    claveIdempotencia,
  });
}

module.exports = {
  resolverTenant,
  listarAsignaciones,
  validarAsignacion,
  acreditarHoras,
};
