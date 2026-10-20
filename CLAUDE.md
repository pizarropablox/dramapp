# DRAMApp

App para **Fiesta DRAMA**, evento mensual de reggaetón en San Bernardo.

**MVP: venta en barra desde el teléfono**
- Botones por producto/variante, con total de la venta.
- Cobro por Mercado Pago (el monto se digita a mano en la máquina) o en efectivo.
- Propina opcional.
- Anulación de ventas sin borrarlas (quedan registradas como anuladas).
- Totales en vivo por producto y por medio de pago.

**Futuro:** conteo de vales, concesión, entradas con QR del carnet, sueldos.

## Glosario de dominio

- **Evento**: una edición de la fiesta. Las ventas y los totales pertenecen a un evento.
- **Producto**: lo que se vende en barra (ej. Jack Daniels).
- **Variante**: versión de un producto (ej. Jack Daniels Original / Manzana / Honey).
- **Promo**: precio especial por cantidad. Puede mezclar variantes del **mismo** producto, nunca productos distintos.
- **Vale**: flor de papel que la cajera entrega al cliente después de cobrar; el cliente la canjea con el bartender, que la guarda. Al cierre se cuentan para cuadrar contra las ventas registradas.
- **Roles**:
  - `barra`: registra ventas, anula y ve totales.
  - `admin`: todo lo anterior, más administrar la carta (productos, variantes, precios, promos) y los eventos.
  - La cajera y la persona de apoyo en caja usan el rol `barra` (hasta 3 teléfonos a la vez). Los bartenders no usan la app; solo reciben el vale.

## Reglas de negocio

- Cada línea de venta guarda el precio cobrado en ese momento (snapshot); cambiar la carta no altera ventas pasadas.
- El backend calcula el total de la venta; nunca confía en el total enviado por el frontend.
- Solo puede haber un evento abierto a la vez; sin evento abierto no se puede vender.
- La propina se guarda separada del total de productos.
- Los productos y variantes se desactivan, nunca se borran.
- Una venta anulada no suma en los totales, pero se conserva con su hora de anulación.
- Toda la API exige sesión salvo login, logout y `/actuator/health/liveness`. Las sesiones duran 24 h fijas.

## Seguridad (DRAMA-27)

- Dos usuarios fijos, `barra` y `admin` (`ADMIN` hereda de `BARRA`). Sus claves (`{bcrypt}...`) y el secreto JWT vienen de variables de entorno (`DRAMAPP_BARRA_PASSWORD`, `DRAMAPP_ADMIN_PASSWORD`, `DRAMAPP_JWT_SECRET`); nunca en el repo. En local, `.env` con `{noop}...`.
- JWT HS256 en una cookie `HttpOnly; SameSite=Strict; Path=/api` (y también se acepta `Authorization: Bearer`). Las peticiones con cookie exigen el token CSRF (`XSRF-TOKEN` → `X-XSRF-TOKEN`, Angular lo hace solo).
- Los permisos viven en una sola tabla, `SecurityConfig`. Todo endpoint no listado queda **denegado**: un endpoint nuevo se agrega ahí y a `SecurityRulesTests`.
- Tests: `@WithMockUser(roles = "BARRA" | "ADMIN")` en tests de controladores; `PostgresIntegrationTest` define las claves de test.
- Frontend: `authGuard`/`adminGuard` en las rutas; ante un 401, `authInterceptor` vuelve al login sin recargar (el carrito se conserva).

## Stack

| Parte | Tecnología |
|---|---|
| Backend | Spring Boot 4.1.1, Java 21, Maven (wrapper `mvnw`) |
| Base de datos | PostgreSQL 17 vía Docker Compose, migraciones con Flyway |
| Frontend | Angular 22.2, TypeScript 6.0, SCSS, tests con Vitest 5 |
| Tooling | Node >= 24.15 (en desarrollo: 24.20), npm 11.19 |
| Producción | Render (backend Docker + frontend static site), Neon (PostgreSQL 17), UptimeRobot; planes gratis |

## Estructura

```
dramapp/
├── backend/            # Spring Boot (cl.dramapp.backend)
│   ├── Dockerfile                # imagen de producción (Render)
│   └── src/main/resources/
│       ├── application.yml       # datasource por variables de entorno
│       ├── application-prod.yml  # perfil de producción (pool Hikari, Tomcat)
│       └── db/migration/         # migraciones Flyway (V1__init.sql, ...)
├── frontend/           # Angular (tiene su propio CLAUDE.md con buenas prácticas de Angular)
├── docker-compose.yml  # PostgreSQL 17
├── render.yaml         # Blueprint de Render: backend + frontend (deploy)
├── .env.example        # plantilla de credenciales -> copiar a .env
├── .mcp.json           # MCP del Angular CLI apuntando a frontend/
├── .github/workflows/  # CI de GitHub Actions (ci.yml)
└── .vscode/            # launch/tasks compartidos de backend y frontend
```

## Comandos

En Windows/PowerShell usa `.\mvnw.cmd` en vez de `./mvnw` (ej. `.\mvnw.cmd spring-boot:run`).

```bash
# Base de datos (desde la raíz; requiere .env, copiar de .env.example)
docker compose up -d
docker compose down          # detener (los datos quedan en el volumen postgres-data)

# Backend (desde backend/)
./mvnw spring-boot:run       # http://localhost:8080, health en /actuator/health (base dramapp)
./mvnw test                  # tests con Testcontainers: requiere Docker Desktop abierto (ver abajo)
./mvnw verify                # lo mismo que corre el CI

# Frontend (desde frontend/)
npm install
npm start                    # http://localhost:4200
npm test                     # Vitest (en modo watch; una sola pasada: npm test -- --watch=false)
npm run format               # formatea con Prettier
npm run format:check         # verifica el formato (lo exige el CI)
npm run build
```

El backend lee `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USERNAME`, `DB_PASSWORD`. Los valores por defecto (`localhost:5432/dramapp`, usuario y contraseña `dramapp`) coinciden con `.env.example`. Solo las usa la app (`spring-boot:run`); los tests no.

### Tests del backend con Testcontainers

Los tests de integración heredan de `PostgresIntegrationTest`, que levanta un PostgreSQL 17 desechable en Docker (la misma imagen que `docker-compose.yml`) y lo conecta con `@ServiceConnection`; Flyway corre las migraciones en ese contenedor. No usan la base `dramapp` ni `DB_NAME`: basta `./mvnw test` (o `.\mvnw.cmd test`) con **Docker Desktop abierto**. No hace falta `docker compose up`.

- Un solo contenedor para toda la corrida (campo estático): se paga su arranque una vez. Testcontainers lo borra al terminar.
- Cada corrida parte solo con las migraciones (la carta oficial, sin eventos ni ventas), y cada test hace rollback con `@Transactional`.
- Todo test nuevo que use la base debe extender `PostgresIntegrationTest`.

## Integración continua

GitHub Actions (`.github/workflows/ci.yml`) corre en cada pull request y en cada push a `main`, con dos jobs en paralelo:

- **backend**: Java 21 y `./mvnw -B verify` (Testcontainers usa el Docker del runner).
- **frontend**: Node 24, `npm ci`, `npm run format:check`, `npm test -- --watch=false` y `npm run build`.

Un PR solo se mergea con el CI en verde. Antes de abrirlo, correr `npm run format` en `frontend/`.

## Producción

Detalle y pasos manuales en la sección "Deploy" del README.

- Render despliega `main` solo después de que pasan los checks del CI. Las claves viven solo en los paneles de Render (variables `SPRING_DATASOURCE_*`), nunca en el repo.
- El frontend llama a la API con rutas relativas `/api/...`: en producción las resuelve el rewrite del static site (igual que el proxy de Angular en desarrollo). No usar URLs absolutas ni CORS.
- Health checks y monitoreo usan `/actuator/health/liveness`, que no consulta la base: así Neon puede suspenderse. No apuntarlos a `/actuator/health`.
- El plan gratis de Render tiene 512 MB y 0,1 CPU: cuidar memoria y dependencias pesadas. La JVM se ajusta en el `Dockerfile`.
- Los previews de PR usan el backend y la base de producción.
- El perfil `prod` no arranca sin `DRAMAPP_JWT_SECRET` o con claves que no sean `{bcrypt}`. Ver README > "Usuarios y contraseñas".

## Convenciones

- **Ramas**: `tipo/DRAMA-N-descripcion-corta`, con tipo `feat`, `fix`, `chore`, `docs`, `test`, `refactor` o `ci`. Ej: `feat/DRAMA-24-product-buttons`.
- **Commits**: Conventional Commits en inglés, con la key de Jira al final. Ej: `feat(bar): add product buttons (DRAMA-24)`.
- **Pull Requests**: todo entra a `main` por PR, y el título del PR incluye la key de Jira.
- **Base de datos**: el esquema se cambia solo con migraciones Flyway (`ddl-auto` es `validate`, nunca `update`). Nunca modificar una migración ya mergeada; crear una nueva.
- **Secretos**: solo en `.env` (ignorado por git), nunca en el código ni en archivos commiteados.

## Reglas para Claude Code

- No hacer commits, push ni merge sin que Pablo lo pida.
- Preguntar antes de instalar dependencias nuevas.
- Si algo falla, detenerse, mostrar el error y proponer una alternativa antes de ejecutarla.
- Avisar de archivos sobrantes o generados antes de tocarlos.
- Explicaciones en español; código, commits y nombres en inglés.
- Toda lógica de negocio nueva lleva tests.
