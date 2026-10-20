# dramapp

[![CI](https://github.com/pizarropablox/dramapp/actions/workflows/ci.yml/badge.svg)](https://github.com/pizarropablox/dramapp/actions/workflows/ci.yml)

Event management app for Fiesta DRAMA: bar POS with Mercado Pago, voucher counting, ID-based entry and staff payroll.

## Cómo levantar el proyecto en local

Requisitos: Docker Desktop, Java 21 y Node >= 24.15 (npm 11). Los comandos son para Windows/PowerShell, desde la raíz del repositorio.

### 1. Base de datos (PostgreSQL 17 en Docker)

```powershell
Copy-Item .env.example .env   # solo la primera vez
docker compose up -d
```

En `.env` elige también las claves locales de `barra` y `admin` (`DRAMAPP_BARRA_PASSWORD` y `DRAMAPP_ADMIN_PASSWORD`, con el prefijo `{noop}`). El backend lee ese archivo al arrancar con `spring-boot:run`; sin esas variables nadie puede iniciar sesión en local.

### 2. Backend (Spring Boot, puerto 8080)

En una terminal:

```powershell
cd backend
.\mvnw.cmd spring-boot:run
```

Para comprobarlo: http://localhost:8080/actuator/health/liveness (el resto de la API pide sesión).

### 3. Frontend (Angular, puerto 4200)

En otra terminal:

```powershell
cd frontend
npm install   # solo la primera vez o si cambian las dependencias
npm start
```

### 4. Abrir la app

Abre http://localhost:4200 e inicia sesión como `barra` o `admin` con las claves de tu `.env`. Con `admin`, **Totales → Estado del sistema** muestra el estado del backend, la versión de PostgreSQL y la hora de la base. En desarrollo, las llamadas a `/api` se redirigen al backend mediante el proxy de Angular (`frontend/proxy.conf.json`), así que la cookie de sesión funciona igual que en producción.

Para detener la base: `docker compose down` (los datos se conservan en el volumen `postgres-data`).

## Tests

Backend (JUnit con [Testcontainers](https://testcontainers.com/)): cada corrida levanta su propio PostgreSQL 17 desechable en Docker, así que solo necesitas **Docker Desktop abierto**; no usa la base local.

```powershell
cd backend
.\mvnw.cmd verify
```

Frontend (Vitest y Prettier):

```powershell
cd frontend
npm test -- --watch=false
npm run format:check
```

GitHub Actions corre ambos, más el build del frontend, en cada pull request y en cada push a `main`.

## Deploy

Producción usa solo planes gratuitos:

```
iPhone ──► Render Static Site "dramapp"  (Angular)
              │  rewrite /api/*  (mismo origen, sin CORS)
              ▼
           Render Web Service "dramapp-backend"  (Docker, Java 21, región Virginia)
              │  JDBC + SSL, conexión directa
              ▼
           Neon  (PostgreSQL 17, AWS us-east-1)
```

La configuración de Render vive en [`render.yaml`](render.yaml) (Blueprint) y la imagen del backend en [`backend/Dockerfile`](backend/Dockerfile). Ninguna clave está en el repositorio.

### Despliegue continuo

- `main` está protegida: todo entra por PR con los dos checks del CI (backend y frontend) en verde.
- Render despliega los dos servicios **después de que pasan los checks del CI** del commit en `main` (`autoDeployTrigger: checksPass`). El backend se despliega sin cortes: la instancia anterior atiende hasta que la nueva responde el health check.
- Cada PR genera un preview del frontend en Render.

> **Ojo: los previews usan el backend y la base de producción.** El rewrite `/api/*` de un preview apunta al mismo backend que producción, así que una venta hecha en un preview es una venta real. Prueba los previews sin un evento abierto, o solo para revisar pantallas.

### Variables de entorno

| Dónde | Variable | Valor |
|---|---|---|
| Render, `dramapp-backend` | `SPRING_PROFILES_ACTIVE` | `prod` (ya viene en `render.yaml`) |
| Render, `dramapp-backend` | `SPRING_DATASOURCE_URL` | URL JDBC de la conexión **directa** de Neon (secreta) |
| Render, `dramapp-backend` | `SPRING_DATASOURCE_USERNAME` | usuario de Neon (secreto) |
| Render, `dramapp-backend` | `SPRING_DATASOURCE_PASSWORD` | contraseña de Neon (secreta) |
| Render, `dramapp-backend` | `DRAMAPP_JWT_SECRET` | clave que firma las sesiones: base64 de 256 bits (secreta, ver [Usuarios y contraseñas](#usuarios-y-contraseñas)) |
| Render, `dramapp-backend` | `DRAMAPP_BARRA_PASSWORD` | hash `{bcrypt}...` de la clave de `barra` (secreto) |
| Render, `dramapp-backend` | `DRAMAPP_ADMIN_PASSWORD` | hash `{bcrypt}...` de la clave de `admin` (secreto) |
| Render, `dramapp` | `NODE_VERSION` | `24.20.0` (ya viene en `render.yaml`) |

Render entrega `PORT` solo; el backend lo usa (`server.port: ${PORT:8080}`).

Con el perfil `prod`, el backend **no arranca** si falta `DRAMAPP_JWT_SECRET` o si alguna clave no es un hash `{bcrypt}`. En un deploy, eso deja a la instancia anterior atendiendo.

### Configuración inicial (una sola vez, en los paneles)

**1. Neon**

1. Crear el proyecto `dramapp` con **PostgreSQL 17** en la región **AWS US East 1 (N. Virginia)**.
2. En la configuración del cómputo, fijar el tamaño en **0.25 CU** (mínimo y máximo) para que las 100 CU-hora del plan gratis alcancen.
3. En **Connect**, dejar **Connection pooling desactivado** (conexión directa: el host **no** lleva `-pooler`). Flyway usa un *advisory lock* de sesión que no funciona a través del pooler.
4. Neon muestra `postgresql://USUARIO:CLAVE@HOST/BASE?sslmode=require...`. Para Spring hay que separarla:
   - `SPRING_DATASOURCE_URL` = `jdbc:postgresql://HOST/BASE?sslmode=require&channelBinding=require`
   - `SPRING_DATASOURCE_USERNAME` = `USUARIO`
   - `SPRING_DATASOURCE_PASSWORD` = `CLAVE`

No hay que crear tablas: Flyway aplica las migraciones (V1–V4, con la carta oficial) en la primera partida del backend.

**2. Render**

1. **New → Blueprint**, elegir este repositorio y la rama `main`. Render lee `render.yaml` y propone los servicios `dramapp-backend` y `dramapp`.
2. Ingresar las tres variables `SPRING_DATASOURCE_*` del paso anterior y las tres de [Usuarios y contraseñas](#usuarios-y-contraseñas).
3. Al terminar, revisar en cada servicio:
   - **Settings → Auto-Deploy**: "After CI Checks Pass".
   - Backend, **Settings → Health Check Path**: `/actuator/health/liveness`.
   - La URL del backend. Si no es `https://dramapp-backend.onrender.com`, actualizar el destino del rewrite `/api/*` en `render.yaml` (y en **Redirects/Rewrites** del static site).
4. Frontend, **Previews**: dejar los PR previews en **Automatic**.
5. Primera partida del backend: en los logs deben aparecer las cuatro migraciones de Flyway y `Started BackendApplication`.

**3. UptimeRobot**

1. **New monitor → HTTP(s)**, URL `https://dramapp-backend.onrender.com/actuator/health/liveness`, intervalo **10 minutos**.
2. Mantiene despierto al backend (Render apaga un servicio gratis tras 15 minutos sin tráfico). Se usa `liveness` y no `/actuator/health` porque no consulta la base: así el ping no despierta a Neon y no gasta sus horas de cómputo.

### Usuarios y contraseñas

Hay dos usuarios fijos, compartidos por quienes cumplen ese rol:

| Usuario | Puede |
|---|---|
| `barra` | vender, anular, ver últimas ventas y totales |
| `admin` | todo lo de `barra`, más abrir y cerrar eventos, la carta y **Estado del sistema** |

Ninguna clave ni hash vive en el repositorio: solo en las variables de Render.

**Sesiones.** Iniciar sesión deja una cookie `HttpOnly` que dura **24 horas fijas** (no se renuevan con el uso). La cajera entra una vez antes de abrir y le alcanza hasta el día siguiente. Cuando faltan menos de 3 horas, la pantalla de venta lo avisa. Si una sesión vence a mitad de una venta, la app vuelve al login sin perder el carrito.

**Crear o cambiar una clave** (PowerShell, con Docker Desktop abierto). El comando pide la clave dos veces sin mostrarla, así que no queda en el historial:

```powershell
docker run --rm -it httpd:2.4-alpine sh -c 'h=$(htpasswd -nBC 10 x) && echo {bcrypt}${h#x:}'
```

Copia la línea completa que imprime (`{bcrypt}$2y$10$...`) en `DRAMAPP_BARRA_PASSWORD` o `DRAMAPP_ADMIN_PASSWORD` (Render → `dramapp-backend` → **Environment**). Al guardar, Render reinicia el backend con la clave nueva (alrededor de un minuto). Usa claves largas: 4 palabras al azar o 14 caracteres o más. Costo 10 porque con 0,1 CPU cada login ya tarda cerca de un segundo.

**Generar el secreto de las sesiones:**

```powershell
docker run --rm httpd:2.4-alpine sh -c 'head -c 32 /dev/urandom | base64'
```

Pégalo en `DRAMAPP_JWT_SECRET`. No se usa `generateValue` en `render.yaml`: la documentación de Render no asegura que una sincronización del Blueprint no lo regenere, y eso cerraría todas las sesiones en plena fiesta.

**Cerrar todas las sesiones** (por ejemplo, si se pierde un teléfono): genera un secreto nuevo y cambia la clave de ese usuario. Una sesión no se puede revocar por separado: "Cerrar sesión" borra la cookie del teléfono, pero un token copiado sigue sirviendo hasta que vence o cambia el secreto.

**Intentos fallidos.** Tras 5 claves incorrectas en 5 minutos desde la misma IP, el login responde "Demasiados intentos" durante unos minutos; además hay un tope global de 30 intentos fallidos por minuto. Las sesiones ya abiertas no se ven afectadas. Nunca se bloquea a un usuario.

> El backend identifica la IP con `X-Forwarded-For` (`server.forward-headers-strategy: native`, que toma la dirección más a la derecha agregada por el proxy, no la que manda el cliente). Si detrás del rewrite de Render todas las peticiones llegan con la IP del proxy, el límite "por IP" queda en la práctica **global**: un ataque podría trabar el login por unos minutos, pero nadie con sesión abierta lo nota. El log del backend muestra `Login as barra from <IP>` y `Failed login from <IP>`: compara esa IP con la de tu teléfono para saber cuál es el caso.

### Abrir y cerrar un evento (admin)

Mientras no haya pantalla para eventos, se hacen con la API (PowerShell). El login también devuelve el token, que se envía como `Authorization: Bearer`; así no hace falta cookie ni token CSRF:

```powershell
$api = 'https://dramapp-backend.onrender.com/api'
$login = @{ username = 'admin'; password = (Read-Host 'Clave de admin') } | ConvertTo-Json
$session = Invoke-RestMethod -Method Post -Uri "$api/auth/login" -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($login))
$auth = @{ Authorization = "Bearer $($session.token)" }

# Abrir (solo puede haber uno abierto)
Invoke-RestMethod -Method Post -Uri "$api/events" -Headers $auth -ContentType 'application/json' -Body '{"name": "DRAMA Noviembre", "eventDate": "2026-11-28"}'

# Ver el evento abierto
$event = Invoke-RestMethod -Uri "$api/events/current" -Headers $auth

# Cerrar
Invoke-RestMethod -Method Post -Uri "$api/events/$($event.id)/close" -Headers $auth
```

El token dura 24 horas; para no dejarlo en la sesión de PowerShell, cierra la terminal al terminar.

### Límites del plan gratis

- **Render (backend):** 512 MB de RAM y 0,1 CPU. La JVM va ajustada en el `Dockerfile` (heap al 60 %, SerialGC). Arranca en alrededor de un minuto, y Render puede reiniciarlo en cualquier momento. Con el ping de UptimeRobot queda despierto todo el mes (unas 744 de las 750 horas gratis del workspace), así que no cabe un segundo servicio gratis que esté siempre encendido.
- **Render (workspace):** 5 GB de tráfico saliente y 500 minutos de build al mes, compartidos por los dos servicios.
- **Neon:** 1 GB de almacenamiento y 100 CU-hora al mes. La base se suspende tras 5 minutos sin uso y despierta en unos cientos de ms; el backend no mantiene conexiones ociosas para permitirlo.

### Después de cada evento

Sacar un **snapshot manual en Neon** (el plan gratis guarda solo 6 horas de historial y un snapshot).

### Probar la imagen en local

Con Docker Desktop abierto y la base de `docker compose` levantada:

```powershell
docker build -t dramapp-backend backend
docker run --rm --name dramapp-prod-local --network dramapp_default `
  --memory=512m --cpus=0.1 -p 10000:10000 `
  -e PORT=10000 -e SPRING_PROFILES_ACTIVE=prod `
  -e SPRING_DATASOURCE_URL=jdbc:postgresql://dramapp-postgres:5432/dramapp `
  -e SPRING_DATASOURCE_USERNAME=dramapp -e SPRING_DATASOURCE_PASSWORD=dramapp `
  dramapp-backend
```

`--memory` y `--cpus` imitan el plan gratis de Render. Cuando aparezca `Started BackendApplication`, http://localhost:10000/actuator/health/liveness debe responder `{"status":"UP"}`. Para no tocar los datos de `dramapp`, apunta `SPRING_DATASOURCE_URL` a otra base del mismo contenedor.
