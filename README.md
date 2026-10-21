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

### 5. Probar la app instalable (PWA)

`npm start` no tiene service worker. Para probar el build de producción tal como lo sirve Render (con el backend corriendo):

```powershell
cd frontend
npm run serve:pwa   # construye y sirve http://localhost:4300, con /api/* hacia el backend
```

- **En el computador** (http://localhost:4300): el service worker funciona. En Chrome, DevTools → **Application** muestra el manifest, el service worker y la casilla **Offline**. Para ver el aviso de versión nueva: deja la app abierta, cambia cualquier cosa del frontend, corre `npm run build` en otra terminal (el servidor sirve el build nuevo sin reiniciarse) y vuelve a la pestaña.
- **En los teléfonos por la red local** (http://IP-del-PC:4300): la app abre y se puede **agregar a la pantalla de inicio**, pero sin service worker (fuera de `localhost` exige HTTPS), así que no hay modo offline ni aviso de versión nueva.
- **Android con service worker:** conecta el teléfono por USB con depuración USB activada, abre `chrome://inspect` en el PC → **Port forwarding** `4300` → `localhost:4300`, y en el teléfono abre http://localhost:4300.
- **iPhone con service worker:** solo con HTTPS: el preview del PR en Render (ojo: usa el backend de producción, no vender) o producción.

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

### App instalable (PWA)

DRAMApp se instala como una app en el teléfono: abre a pantalla completa, con su ícono, desde la pantalla de inicio.

**Instalarla**

- **Android (Chrome):** abre la app, menú **⋮ → Instalar app** (o **Agregar a pantalla de inicio**).
- **iPhone (Safari):** abre la app, botón **Compartir → Agregar a pantalla de inicio**.

> **iPhone: la app instalada tiene sus propias cookies**, separadas de Safari. Aunque ya hayas iniciado sesión en Safari, hay que **iniciar sesión dentro de la app instalada** (una vez; la sesión dura 24 horas como siempre).

**Actualizaciones.** Después de un deploy, la app abierta descarga la versión nueva en segundo plano (revisa cada 15 minutos y al volver a ella) y muestra arriba **"Hay una versión nueva · Actualizar"**. Nunca se recarga sola: el carrito vive en memoria y se perdería. Si al tocar "Actualizar" hay productos en el carrito, avisa y pide "Actualizar igual". La primera vez que se abre después del deploy que agrega el service worker, solo lo instala; desde la siguiente, ya funciona.

**Sin conexión.** La app abre desde la caché del teléfono, pero la API nunca se cachea: sin red muestra "No se pudo cargar el evento" / "No hay conexión con el servidor" y no deja vender, igual que en el navegador. El service worker solo guarda la app (HTML, JS, CSS, íconos); ver `frontend/ngsw-config.json`, que no tiene `dataGroups` a propósito (un test lo vigila).

**Caché en Render.** `render.yaml` envía `Cache-Control: no-cache` para todo el static site, así que `ngsw-worker.js`, `ngsw.json`, `index.html` y `manifest.webmanifest` se revalidan siempre y los teléfonos ven cada versión nueva.

**Íconos.** Son provisorios: fondo oscuro y una "D" rosada. Las fuentes están en `frontend/branding/` (`icon.svg` y `icon-maskable.svg`, esta con la "D" más chica para que Android pueda recortarla en círculo). Para cambiarlos por el logo oficial, reemplaza esos dos SVG y genera todos los tamaños (Docker, desde `frontend/`):

```powershell
docker run --rm -v "${PWD}:/work" -w /work alpine:3.22 sh branding/generate-icons.sh
```

También sirve pegar PNG con los mismos nombres en `frontend/public/icons/`.

**Si el service worker quedara pegado en una versión mala** (no debería: el aviso y el `no-cache` lo evitan), Angular trae un service worker que se desinstala solo. En `render.yaml`, cambia el `buildCommand` del static site a `npm ci && npm run build && cp dist/frontend/browser/safety-worker.js dist/frontend/browser/ngsw-worker.js` y despliega: cada teléfono elimina el service worker la próxima vez que abra la app. Después se vuelve al `buildCommand` normal.

### Abrir y cerrar un evento (admin)

Desde la app, con el usuario `admin`, en **Totales**:

- **Abrir evento** (arriba, cuando no hay uno abierto): pide el nombre, sugerido como "DRAMA <mes>" y ya seleccionado, así que basta escribir otro ("Prueba equipo") para reemplazarlo. La fecha se calcula sola en hora de Chile: lo que se abre antes del mediodía cuenta como la noche anterior.
- **Cerrar evento** (al final de la página): la confirmación muestra el nombre, desde qué hora está abierto y el total vendido, y avisa que después no se pueden registrar ni anular ventas. Para habilitar "Cerrar evento" hay que marcar **"Sí, terminó la fiesta"**, y el botón no responde durante el primer segundo y medio. Después de cerrar quedan en pantalla los totales finales. Un evento cerrado no se puede reabrir.
- `barra` no ve estos botones.

La pantalla de Venta de los otros teléfonos se entera sola: revisa el evento cada 15 s cuando no hay uno abierto y cada 60 s cuando sí, solo mientras está visible. Después de 30 minutos sin evento deja de revisar (para no mantener despierta la base de Neon) y muestra "Toca ↻ para actualizar"; vuelve a revisar al tocar ↻ o al regresar a la pestaña. Si alguien alcanza a confirmar una venta justo después del cierre, ve "El evento está cerrado: esta venta no se registró" y conserva el carrito.

**Alternativa sin la app (PowerShell),** por ejemplo si el frontend no está disponible. El login también devuelve el token, que se envía como `Authorization: Bearer`; así no hace falta cookie ni token CSRF:

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
