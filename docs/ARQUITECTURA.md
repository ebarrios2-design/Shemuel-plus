# Arquitectura de Shemuel Plus

Shemuel Plus es una plataforma multi-tenant para gestionar prácticas pedagógicas. El backend se ejecuta como tres procesos Express independientes: un gateway público y dos servicios dueños de sus propias bases de datos.

## Procesos y responsabilidades

| Proceso | Puerto | Responsabilidad | Persistencia |
| --- | ---: | --- | --- |
| Gateway | 4000 | Recibir solicitudes del frontend y enrutarlas por prefijo. No consulta bases de datos. | Ninguna |
| SACI | 4001 | Autenticación, usuarios, instituciones receptoras, solicitudes, asignaciones, horas, evaluaciones y reportes. | PostgreSQL/Supabase |
| SSRE | 4002 | Planes de clase, observaciones, talleres, entregas y quizzes. | MongoDB |

Cada servicio es el único propietario de su base de datos. SACI no consulta MongoDB; SSRE no importa ni consulta PostgreSQL. El gateway tampoco tiene conexiones de persistencia.

## Flujo de una petición

1. El frontend identifica el tenant con `frontend/public/js/tenant.js` y envía la solicitud al gateway en el puerto 4000.
2. El gateway enruta por prefijo y conserva el cuerpo y los encabezados de la solicitud:
   - SACI recibe `/api/auth/*`, `/api/usuarios`, `/api/roles`, `/api/reportes/*`, solicitudes, asignaciones e instituciones receptoras.
   - SSRE recibe `/api/practicas/planes-clase`, `/api/practicas/observaciones` y `/api/practicas/talleres`.
3. El servicio destino valida el JWT, el rol y el tenant según corresponda, y consulta exclusivamente su base de datos.
4. Cuando SSRE necesita validar tenant/asignación o acreditar horas, llama a SACI por REST. SACI realiza la operación en PostgreSQL y devuelve el resultado; SSRE persiste su información documental en MongoDB.

## API interna de SACI

SACI expone operaciones internas bajo `/internal/ssre/*`. No se enrutan desde el gateway público. SSRE las llama mediante `src/services/saciClient.js` e incluye el encabezado `X-Internal-Service-Token`, cuyo valor debe coincidir con `SACI_INTERNAL_TOKEN` en SACI y SSRE.

| Endpoint interno | Uso |
| --- | --- |
| `POST /internal/ssre/tenant` | Validar y resolver el tenant. |
| `POST /internal/ssre/asignaciones/listar` | Listar asignaciones de un estudiante o docente. |
| `POST /internal/ssre/asignaciones/validar` | Autorizar una asignación según tenant, usuario y rol. Para un docente, `estudianteId` es opcional: si no se envía, valida que el docente sea dueño de la asignación. |
| `POST /internal/ssre/asignaciones/:id/acreditar-horas` | Acreditar horas en PostgreSQL con una clave idempotente. |

Si SACI no responde o vence el tiempo de espera, el cliente REST de SSRE informa un error HTTP 503. SSRE no intenta conectarse directamente a PostgreSQL como alternativa.

## Organización del código

- `backend/src/apps/`: composición de las aplicaciones de gateway, SACI y SSRE.
- `backend/src/server.js`: arranque del gateway.
- `backend/src/services/saci.server.js` y `ssre.server.js`: arranque de los servicios.
- `backend/src/routes/practicas-saci.routes.js` y `practicas-ssre.routes.js`: rutas públicas separadas por propietario.
- `backend/src/controllers/practicas-saci.controller.js`: handlers relacionales; solo usa PostgreSQL.
- `backend/src/controllers/practicas-ssre.controller.js`: handlers documentales; usa modelos MongoDB y `saciClient`.
- `backend/src/controllers/ssre-internal.controller.js`: handlers de la API interna, ejecutados dentro de SACI.
- `backend/src/services/saciClient.js`: cliente REST interno de SSRE hacia SACI.
- `backend/src/middleware/resolveTenant.js`: resolución de tenant en SACI.
- `backend/src/middleware/resolveTenantFromSaci.js`: resolución remota de tenant en SSRE.

## Aislamiento multi-tenant y seguridad

- SACI filtra sus consultas relacionales con `institucion_id`.
- SSRE guarda y filtra documentos con `tenantId`.
- El JWT identifica al usuario y su institución; las rutas verifican rol y tenant.
- La API interna requiere el token de servicio y no forma parte de las rutas públicas.
- Los servicios SACI y SSRE deben mantenerse en una red privada; el gateway es la entrada pública.

## Arranque y comprobación

Desde `backend`, inicia cada proceso en una terminal independiente:

```powershell
npm run dev:gateway
npm run dev:saci
npm run dev:ssre
```

Comprueba los endpoints de salud:

```powershell
Invoke-RestMethod http://localhost:4000/health
Invoke-RestMethod http://localhost:4001/health
Invoke-RestMethod http://localhost:4002/health
```

Las respuestas identifican respectivamente `gateway`, `SACI` y `SSRE`.
