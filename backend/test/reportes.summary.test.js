const test = require('node:test');
const assert = require('node:assert/strict');
const { resumenIndicadores } = require('../src/controllers/reportes.controller');
const postgres = require('../src/config/postgres');

async function withMockedQuery(testFn) {
  const original = postgres.query;
  postgres.query = async (text, params) => {
    const normalized = String(text).replace(/\s+/g, ' ').trim();

    if (normalized.includes('COUNT(*) FILTER (WHERE rol =')) {
      return { rows: [{ total_estudiantes: 8, total_docentes: 3 }] };
    }

    if (normalized.includes('FROM asignaciones_practica')) {
      return { rows: [{ cantidad: 2, estado: 'pendiente' }, { cantidad: 5, estado: 'en_curso' }, { cantidad: 1, estado: 'finalizada' }] };
    }

    if (normalized.includes('ROUND(AVG') || normalized.includes('AVG(horas_cumplidas')) {
      return { rows: [{ porcentaje_promedio: 72.5 }] };
    }

    if (normalized.includes('SELECT e.nombre_completo AS estudiante')) {
      return { rows: [
        { estudiante: 'Andrea Tarazona', horas_cumplidas: 90, horas_requeridas: 120, estado: 'en_curso' },
        { estudiante: 'Esteban Barrios', horas_cumplidas: 120, horas_requeridas: 120, estado: 'finalizada' }
      ] };
    }

    return { rows: [] };
  };

  try {
    await testFn();
  } finally {
    postgres.query = original;
  }
}

test('resumen del director incluye detalle de estudiantes y estados', async () => {
  await withMockedQuery(async () => {
    const req = { tenant: { id: 'tenant-1', nombre: 'UDI' } };
    const res = {
      json: (payload) => {
        assert.equal(payload.total_estudiantes, 8);
        assert.equal(payload.total_docentes, 3);
        assert.equal(Array.isArray(payload.topEstudiantes), true);
        assert.equal(payload.topEstudiantes[0].estudiante, 'Andrea Tarazona');
        assert.equal(payload.asignacionesPorEstado.length, 3);
      }
    };

    await resumenIndicadores(req, res, () => {});
  });
});
