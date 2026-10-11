# Shemuel Plus — documentación de arquitectura y conexiones

## 1. Qué es esta aplicación

Shemuel Plus es un prototipo de SaaS multi-tenant para gestión de prácticas pedagógicas. Cada universidad o institución funciona como un tenant diferente, con su propio identificador de subdominio, usuarios, asignaciones y reportes, sin mezclar información entre clientes.

La aplicación está dividida en dos capas principales:

- Backend: API REST con Express, PostgreSQL y MongoDB
- Frontend: páginas HTML/JS estáticas para login, dashboard y branding por institución

## 2. Cómo se conecta todo

### Flujo principal

1. El usuario entra a una URL con un tenant (por ejemplo `?tenant=udi` o `udi.localhost`).
2. El archivo frontend/public/js/tenant.js detecta el tenant y llama a `/api/public/institucion`.
3. El backend resuelve el tenant con el middleware `resolveTenant`, consultando la tabla `instituciones` en PostgreSQL.
4. El sistema guarda `req.tenant` con el contexto de la institución actual.
5. El login valida credenciales contra `usuarios` y genera un JWT con `institucionId`.
6. Cada petición autenticada debe pasar por `requireAuth` y comparar el token con `req.tenant.id`.
7. Las rutas de negocio usan ese tenant para filtrar datos y evitar cruzarse entre instituciones.

### Relación entre capas

- `frontend/public/*.html`: interfaz del usuario
- `frontend/public/js/tenant.js`: lógica de detección de tenant y branding
- `backend/src/app.js`: ensamblaje de la API
- `backend/src/server.js`: arranque del servidor y conexión a bases de datos
- `backend/src/routes/*.js`: endpoints públicos y protegidos
- `backend/src/controllers/*.js`: lógica de negocio
- `backend/src/middleware/*.js`: validación de tenant y JWT
- `backend/src/config/*.js`: conexiones a PostgreSQL y MongoDB
- `backend/database/schema.sql`: esquema de datos relacional
- `backend/src/models/mongo/*.js`: modelos de documentos en MongoDB

## 3. Base de datos y responsabilidad de cada una

### PostgreSQL: datos estructurados y transaccionales

Se usa para todo lo que requiere integridad, relaciones y consultas filtradas por institución.

Archivos principales:

- `backend/database/schema.sql`
- `backend/src/config/postgres.js`
- `backend/src/controllers/auth.controller.js`
- `backend/src/controllers/practicas.controller.js`
- `backend/src/controllers/reportes.controller.js`

Tablas principales:

- `instituciones`: universidades o clientes del SaaS
- `usuarios`: estudiantes, docentes, directores, etc.
- `instituciones_receptoras`: centros donde se realiza la práctica
- `asignaciones_practica`: vínculo entre estudiante y docente con entidad receptora
- `evaluaciones`: calificaciones formales

Cada tabla incluye `institucion_id`, lo que garantiza aislamiento multi-tenant.

### MongoDB: datos flexibles y documentales

Se usa para información con estructura variable o narrativa, como planes de clase y observaciones.

Archivos principales:

- `backend/src/config/mongo.js`
- `backend/src/models/mongo/PlanClase.js`
- `backend/src/models/mongo/Observacion.js`
- `backend/src/models/mongo/HojaVida.js`
- `backend/src/controllers/practicas.controller.js`

Colecciones/documentos:

- `PlanClase`: contenido libre de plan de clase por asignación
- `Observacion`: comentarios del docente por seguimiento o visita
- `HojaVida`: datos académicos y experiencia del estudiante

## 4. Módulos del backend y para qué sirven

### `backend/src/app.js`

Define la API principal y monta los recursos por prefijo:

- `/api/public`: info institucional antes de login
- `/api/auth`: autenticación y emisión de token
- `/api/practicas`: gestión de asignaciones y seguimiento
- `/api/reportes`: indicadores resumen para el director

### `backend/src/server.js`

Es el punto de entrada real del servidor. Verifica que PostgreSQL y MongoDB estén activos antes de levantar Express.

### `backend/src/middleware/resolveTenant.js`

Resuelve a qué institución pertenece la petición. Usa el subdominio real o un valor de pruebas en local (`X-Tenant` o `?tenant=`). Guarda `req.tenant` y evita que un usuario se autentique en otra universidad.

### `backend/src/middleware/auth.js`

Valida el JWT y limita acceso por roles:

- `requireAuth`: exige sesión válida
- `requireRole(...roles)`: restringe acciones a roles permitidos

### `backend/src/routes/auth.routes.js`

Expone el login. Conecta `POST /api/auth/login` con el controlador `login`.

### `backend/src/routes/public.routes.js`

Entrega información pública de una institución, como nombre, colores y logo. Es usada por el frontend para "vestirse" con la identidad visual del tenant.

### `backend/src/routes/practicas.routes.js`

Agrupa las operaciones de práctica con autenticación y control de roles:

- `GET /asignaciones`
- `POST /asignaciones`
- `GET /planes-clase`
- `POST /planes-clase`
- `GET /observaciones`
- `POST /observaciones`

### `backend/src/routes/reportes.routes.js`

Entrega indicadores agregados al director del programa. Solo un `director` puede acceder.

### `backend/src/controllers/auth.controller.js`

Realiza la autenticación del usuario, consulta en PostgreSQL por `institucion_id + email`, compara contraseña y firma JWT.

### `backend/src/controllers/practicas.controller.js`

Es el controlador más importante del negocio. Une dos persistencias:

- PostgreSQL para asignaciones de práctica
- MongoDB para planes y observaciones

### `backend/src/controllers/reportes.controller.js`

Genera los indicadores para el director: total de estudiantes, docentes y porcentaje promedio de cumplimiento de horas.

## 5. Frontend y cómo se conecta con el backend

### `frontend/public/js/tenant.js`

Es el archivo central para identificar el tenant actual y personalizar la interfaz.

Funciones clave:

- `detectarTenantSlug()`: obtiene el tenant desde la URL, el host o localStorage
- `redirectToLogin(tenant)`: redirige a la vista de login con el tenant en la query
- `cargarInstitucion()`: llama a `/api/public/institucion`
- `aplicarBranding(institucion)`: cambia colores y nombre de la institución en la UI

### `frontend/public/login.html`

Form de ingreso. Se conecta al backend con `POST /api/auth/login` usando `X-Tenant` y almacena el JWT en `localStorage`.

### `frontend/public/dashboard.html`

Panel principal del usuario. Muestra datos de asignación y, si la persona es director, un resumen de indicadores. Usa `Authorization: Bearer <token>` para consultar rutas protegidas.

## 6. Rutas clave del sistema

### Público

- `GET /health`: verificación de salud del backend
- `GET /api/public/institucion`: devuelve metadata del tenant

### Autenticación

- `POST /api/auth/login`: valida credenciales y entrega JWT

### Prácticas

- `GET /api/practicas/asignaciones`: lista asignaciones de la institución
- `POST /api/practicas/asignaciones`: crea una asignación
- `GET /api/practicas/planes-clase`: lista planes por tenant/asignación
- `POST /api/practicas/planes-clase`: crea un plan de clase
- `GET /api/practicas/observaciones`: lista observaciones
- `POST /api/practicas/observaciones`: crea observación

### Reportes

- `GET /api/reportes/resumen`: indicadores del director

## 7. Seguridad y aislamiento multi-tenant

La seguridad no está en la interfaz; está en el backend:

- `resolveTenant` identifica la institución antes de autorizar cualquier operación.
- `requireAuth` verifica el JWT.
- `requireRole` restringe permisos por rol.
- `login` consulta por `institucion_id` y `email` simultáneamente.
- Los controladores consultan `req.tenant.id` para filtrar consultas.

Esto evita que un usuario de una universidad pueda ver o modificar datos de otra.

## 8. Cómo seguir desarrollando

Si quieres ampliar el sistema, la forma recomendada es:

1. Agregar nueva tabla o colección si la entidad requiere relación o flexibilidad.
2. Crear la ruta en el folder `backend/src/routes`.
3. Añadir el controlador correspondiente en `backend/src/controllers`.
4. Usar `req.tenant.id` en todas las consultas.
5. Mantener la autenticación y roles centralizados en `middleware/auth.js`.
6. Conectar la vista frontend a la API con fetch y `X-Tenant` cuando corresponda.

## 9. Resumen corto

Este proyecto combina:

- PostgreSQL para lo estructurado y seguro
- MongoDB para contenido flexible y narrativo
- Express para la API
- JWT para la identidad
- tenant-aware routing para aislar universidades
- frontend simple con branding dinámico por institución

Todo está conectado para que cada universidad tenga su propia data, lógica y visualización sin interferir con el resto.
