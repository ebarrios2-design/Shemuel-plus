# Shemuel Plus

## Visión general

Shemuel Plus es un prototipo de plataforma SaaS multi-tenant para la gestión de prácticas pedagógicas. El sistema está diseñado para que cada universidad o institución tenga su propio espacio de trabajo, usuarios, asignaciones, reportes y branding visual, sin mezclar información entre clientes.

## Arquitectura general

El frontend estático consume un gateway Express en el puerto 4000. El gateway
conserva las rutas públicas existentes y enruta las solicitudes por prefijo a
dos servicios independientes:

- **SACI** (puerto 4001): autenticación, usuarios, instituciones receptoras,
  solicitudes, asignaciones, evaluaciones y reportes; usa PostgreSQL/Supabase.
- **SSRE** (puerto 4002): planes, observaciones, talleres, entregas y quizzes;
  usa MongoDB.

SSRE consulta a SACI por REST para comprobar las asignaciones y acreditar horas.
La acreditación usa una clave idempotente para impedir que los reintentos sumen
horas más de una vez. SACI y SSRE solo escuchan en localhost por defecto; el
gateway es el punto de entrada público.

## Flujo real de uso

1. El usuario accede a una URL que identifica el tenant (por ejemplo `?tenant=udi` o un subdominio).
2. El frontend ejecuta `tenant.js` para detectar el tenant y pedir la información de la institución a `GET /api/public/institucion`.
3. El backend resuelve el tenant con `resolveTenant`, que consulta la tabla `instituciones` en PostgreSQL.
4. El usuario verifica su correo con `/api/auth/verificar-correo` y después inicia sesión en `/api/auth/login`; ambas operaciones se limitan a `institucion_id`.
5. Las rutas protegidas validan el token con `requireAuth` y restringen permisos con `requireRole`.
6. SACI y SSRE consultan sus respectivas bases, siempre filtrando por el tenant
   validado.

## Tecnologías principales

- Node.js + Express para la API
- PostgreSQL para relaciones estructuradas
- MongoDB para documentos flexibles
- JWT para autenticación
- CORS y middleware para seguridad y trazabilidad

## Estructura del proyecto

- `backend/`: API y persistencia
  - `src/apps/gateway.app.js`: gateway HTTP que enruta por prefijo
  - `src/apps/saci.app.js`, `src/apps/ssre.app.js`: aplicaciones separadas
  - `src/server.js`: arranque del gateway
  - `src/services/saci.server.js`, `src/services/ssre.server.js`: arranque de los servicios
  - `src/config/postgres.js`: pool de PostgreSQL
  - `src/config/mongo.js`: conexión a MongoDB
  - `src/middleware/resolveTenant.js`: identifica la institución actual
  - `src/middleware/auth.js`: validación JWT y roles
  - `src/routes/practicas-saci.routes.js`: endpoints relacionales
  - `src/routes/practicas-ssre.routes.js`: endpoints documentales y de talleres
  - `src/routes/ssre-internal.routes.js`: API interna de SACI usada por SSRE
  - `src/controllers/*.js`: lógica de negocio
  - `src/models/mongo/*.js`: modelos documentales
  - `database/schema.sql`: esquema relacional
- `frontend/public/`: interfaz del sistema
  - `index.html`: presentación institucional
  - `login.html`: autenticar usuario en un tenant
  - `dashboard.html`: panel principal según rol
  - `js/tenant.js`: detección de tenant y branding
  - `instituciones/*.html`: páginas de ejemplo por universidad

## Qué hace cada base de datos

### PostgreSQL

Usado para datos estructurados, transaccionales y relacionales. Su esquema central incluye:

- `instituciones`: clientes del SaaS / universidades
- `usuarios`: estudiantes, docentes, directores
- `instituciones_receptoras`: entidades donde se realiza la práctica
- `asignaciones_practica`: relación principal del negocio
- `evaluaciones`: notas formales del proceso

Todos estos registros se relacionan con `institucion_id` para aislar cada tenant.

### MongoDB

Usado para contenido con estructura flexible o narrativa, como:

- planes de clase
- observaciones pedagógicas
- hoja de vida
- talleres, preguntas de quiz y entregas de actividades

Esto permite guardar documentos con campos variados sin forzar un esquema rígido de SQL.

SACI funciona sin conectarse a MongoDB y SSRE no consulta directamente
PostgreSQL. Si MongoDB no está disponible, las rutas documentales responden HTTP
503. SSRE necesita SACI para validar tenants/asignaciones y acreditar horas.

### Talleres y horas de práctica

El docente asesor crea talleres para sus asignaciones, agrega preguntas de opción múltiple
y activa el quiz cuando esté listo. El estudiante inicia la actividad, tiene tres horas
para subir un archivo (se aceptan PDF, archivos de Office, imágenes y texto, hasta 8 MB)
y puede agregar un comentario. La entrega tardía se permite y queda marcada. Tras la
entrega, el estudiante puede iniciar el quiz cuando el docente lo haya activado; el intento
dura una hora y las respuestas se guardan mientras avanza. Se acreditan 3 horas al entregar
la actividad y 1 hora al terminar el quiz, una sola vez cada una y sin superar las horas
requeridas por la asignación.

### Actualización de bases existentes

En bases inicializadas antes de permitir asignaciones sin institución receptora, aplica una vez `backend/database/migrations/001_optional_practice_receiver.sql`. Para exigir el cambio de contraseñas temporales, aplica también `backend/database/migrations/005_password_change_required.sql`.

Los roles `director` e `institucion_receptora` pueden gestionar usuarios únicamente dentro de su tenant y asignar cualquiera de los roles disponibles. Las cuentas nuevas y las contraseñas restablecidas exigen un cambio al iniciar sesión. Para aprovisionar las cuentas administrativas institucionales, configura temporalmente `INSTITUTION_ADMIN_INITIAL_PASSWORD` y ejecuta desde `backend`:

```powershell
$env:INSTITUTION_ADMIN_INITIAL_PASSWORD = "<contraseña temporal>"
npm run db:seed:institution-admins
Remove-Item Env:\INSTITUTION_ADMIN_INITIAL_PASSWORD
```

El aprovisionamiento usa los subdominios `udi` y `uan`; si se vuelve a ejecutar, restablece las contraseñas de esas dos cuentas y vuelve a exigir el cambio.

### Migrar PostgreSQL local a Supabase

1. Crea un proyecto Supabase y copia la URI de PostgreSQL de **Connect → Session pooler**. No la publiques ni la guardes en el repositorio.
2. Descarga el certificado raíz desde **Project Settings → Database → SSL Configuration** y guárdalo como `backend/supabase-root.crt`.
3. En `backend/.env`, configura `SUPABASE_DATABASE_URL` con la URI, `PG_SSL=true` y `PG_SSL_ROOT_CERT=supabase-root.crt`. La conexión valida el certificado; no desactives esa validación.
4. Desde `backend`, ejecuta `npm run db:migrate:supabase`. El script crea el esquema si la base destino está vacía y copia las tablas en orden de dependencias. La migración no reemplaza filas existentes en Supabase; si encuentra conflictos, conserva las filas remotas. Toda la copia se realiza en una transacción.
5. Cuando la migración finalice, configura `PG_CONNECTION_STRING` con la URI de Supabase. El backend usará Supabase en adelante; si `PG_CONNECTION_STRING` queda vacío, seguirá usando las variables locales `PG_*`.

En PowerShell, la migración se puede ejecutar así desde `backend` (reemplaza el valor localmente, sin compartirlo):

```powershell
$env:SUPABASE_DATABASE_URL = "postgresql://..."
npm run db:migrate:supabase
```

## Ejecutar los servicios

Configura `backend/.env` con las conexiones de PostgreSQL/Supabase y MongoDB,
los puertos y URL de servicio del archivo `.env.example`, y secretos fuertes
en `JWT_SECRET` y `SACI_INTERNAL_TOKEN`. SACI y SSRE deben usar el mismo valor
para ambos secretos; no es necesario configurarlos en el gateway. Aplica una vez
`backend/database/migrations/004_idempotent_hours_credits.sql` en la base
PostgreSQL existente antes de usar talleres que acrediten horas, y
`backend/database/migrations/005_password_change_required.sql` para habilitar
el cambio obligatorio de contraseñas temporales.

Instala dependencias una sola vez desde `backend` (`npm ci`) y ejecuta cada
proceso en una terminal distinta:

```powershell
npm run dev:gateway
npm run dev:saci
npm run dev:ssre
```

El frontend sigue usando el gateway en `http://localhost:4000`. Comprueba
`/health` en los puertos 4000, 4001 y 4002. En despliegues, expón el gateway y
mantén SACI y SSRE en una red privada; configura `SACI_URL` y `SSRE_URL` con las
direcciones internas correspondientes y enlaza esos servicios a una interfaz
accesible desde la red privada (por ejemplo, `SACI_HOST=0.0.0.0`).

## Conexión entre módulos

- `tenant.js` -> llama a `/api/public/institucion` -> `public.routes.js`
- `login.html` -> verifica correo e inicia sesión en `auth.routes.js` -> `auth.controller.js`
- `dashboard.html` -> llama al gateway en `/api/practicas/*` y `/api/reportes/*`
- SACI valida JWT en sus rutas y consulta PostgreSQL
- SSRE valida JWT y solicita a SACI la validación del tenant/asignación y la acreditación de horas

## Endpoints principales

### Públicos

- `GET /health`: verifica que el backend esté vivo
- `GET /api/public/institucion`: retorna metadata del tenant

### Autenticación

- `POST /api/auth/verificar-correo`: confirma que el correo pertenece a una cuenta activa del tenant.
- `POST /api/auth/login`: inicio de sesión con validación por tenant

### Prácticas

- `GET /api/practicas/asignaciones`
- `POST /api/practicas/asignaciones`
- `GET /api/practicas/planes-clase`
- `POST /api/practicas/planes-clase`
- `GET /api/practicas/observaciones`
- `POST /api/practicas/observaciones`
- `GET /api/practicas/talleres`
- `POST /api/practicas/talleres`: crea un taller y sus preguntas (docente asesor)
- `POST /api/practicas/talleres/:id/actividad/iniciar`: inicia el plazo de entrega (estudiante)
- `POST /api/practicas/talleres/:id/actividad/entregar`: entrega el archivo y comentario (estudiante)
- `POST /api/practicas/talleres/:id/quiz/activar`: habilita el quiz (docente asesor)
- `POST /api/practicas/talleres/:id/quiz/iniciar`: inicia el plazo de una hora (estudiante)
- `POST /api/practicas/talleres/:id/quiz/respuestas`: guarda respuestas parciales (estudiante)
- `POST /api/practicas/talleres/:id/quiz/finalizar`: califica el intento y acredita la hora (estudiante)

### Reportes

- `GET /api/reportes/resumen`

## Seguridad multi-tenant

La capa de seguridad principal no está en la vista, sino en el backend:

- `resolveTenant` detecta la institución actual
- `requireAuth` valida el JWT
- `requireRole` restringe acciones por perfil
- todas las consultas relevantes usan `req.tenant.id`

Eso evita que un usuario de una universidad consulte datos de otra.

## Documentación técnica adicional

Para una explicación más detallada de cada archivo y de la arquitectura completa, consulta:

- `docs/ARQUITECTURA.md`

## Resumen corto

Este proyecto combina datos relacionales para la gestión formal y documentos flexibles para el seguimiento pedagógico, todo bajo una lógica SaaS multi-tenant que aísla cada institución por subdominio y por `institucion_id`.
