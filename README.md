# Shemuel Plus

## Visión general

Shemuel Plus es un prototipo de plataforma SaaS multi-tenant para la gestión de prácticas pedagógicas. El sistema está diseñado para que cada universidad o institución tenga su propio espacio de trabajo, usuarios, asignaciones, reportes y branding visual, sin mezclar información entre clientes.

## Arquitectura general

La aplicación se estructura en dos capas principales:

- Frontend estático: páginas HTML + JavaScript para login, dashboard y personalización visual
- Backend API: Express + PostgreSQL + MongoDB para lógica empresarial, autenticación y datos

## Flujo real de uso

1. El usuario accede a una URL que identifica el tenant (por ejemplo `?tenant=udi` o un subdominio).
2. El frontend ejecuta `tenant.js` para detectar el tenant y pedir la información de la institución a `GET /api/public/institucion`.
3. El backend resuelve el tenant con `resolveTenant`, que consulta la tabla `instituciones` en PostgreSQL.
4. El usuario hace login usando `/api/auth/login`, que valida credenciales por `institucion_id + email` y devuelve un JWT.
5. Las rutas protegidas validan el token con `requireAuth` y restringen permisos con `requireRole`.
6. Los controladores consultan datos de PostgreSQL o MongoDB, siempre filtrados por `req.tenant.id`.

## Tecnologías principales

- Node.js + Express para la API
- PostgreSQL para relaciones estructuradas
- MongoDB para documentos flexibles
- JWT para autenticación
- CORS y middleware para seguridad y trazabilidad

## Estructura del proyecto

- `backend/`: API y persistencia
  - `src/app.js`: monta la aplicación y rutas
  - `src/server.js`: arranque del backend y verificación de conexiones
  - `src/config/postgres.js`: pool de PostgreSQL
  - `src/config/mongo.js`: conexión a MongoDB
  - `src/middleware/resolveTenant.js`: identifica la institución actual
  - `src/middleware/auth.js`: validación JWT y roles
  - `src/routes/*.js`: endpoints por módulo
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

Esto permite guardar documentos con campos variados sin forzar un esquema rígido de SQL.

### Actualización de bases existentes

En bases inicializadas antes de permitir asignaciones sin institución receptora, aplica una vez `backend/database/migrations/001_optional_practice_receiver.sql`.

## Conexión entre módulos

- `tenant.js` -> llama a `/api/public/institucion` -> `public.routes.js`
- `login.html` -> llama a `/api/auth/login` -> `auth.routes.js` -> `auth.controller.js`
- `dashboard.html` -> llama a `/api/practicas/*` y `/api/reportes/*`
- `resolveTenant` -> llena `req.tenant` antes de cada ruta de negocio
- `requireAuth` -> valida JWT y compara `institucionId` con `req.tenant.id`
- `practicas.controller.js` -> consulta Postgres y Mongo dependiendo del tipo de dato

## Endpoints principales

### Públicos

- `GET /health`: verifica que el backend esté vivo
- `GET /api/public/institucion`: retorna metadata del tenant

### Autenticación

- `POST /api/auth/login`: inicio de sesión con validación por tenant

### Prácticas

- `GET /api/practicas/asignaciones`
- `POST /api/practicas/asignaciones`
- `GET /api/practicas/planes-clase`
- `POST /api/practicas/planes-clase`
- `GET /api/practicas/observaciones`
- `POST /api/practicas/observaciones`

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
