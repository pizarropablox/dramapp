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

## Stack

| Parte | Tecnología |
|---|---|
| Backend | Spring Boot 4.1.1, Java 21, Maven (wrapper `mvnw`) |
| Base de datos | PostgreSQL 17 vía Docker Compose, migraciones con Flyway |
| Frontend | Angular 22.2, TypeScript 6.0, SCSS, tests con Vitest 5 |
| Tooling | Node >= 24.15 (en desarrollo: 24.20), npm 11.19 |

## Estructura

```
dramapp/
├── backend/            # Spring Boot (cl.dramapp.backend)
│   └── src/main/resources/
│       ├── application.yml       # datasource por variables de entorno
│       └── db/migration/         # migraciones Flyway (V1__init.sql, ...)
├── frontend/           # Angular (tiene su propio CLAUDE.md con buenas prácticas de Angular)
├── docker-compose.yml  # PostgreSQL 17
├── .env.example        # plantilla de credenciales -> copiar a .env
├── .mcp.json           # MCP del Angular CLI apuntando a frontend/
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
DB_NAME=dramapp_test ./mvnw test   # tests en la base aparte dramapp_test (ver abajo)

# Frontend (desde frontend/)
npm install
npm start                    # http://localhost:4200
npm test                     # Vitest
npm run build
```

El backend lee `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USERNAME`, `DB_PASSWORD`. Los valores por defecto (`localhost:5432/dramapp`, usuario y contraseña `dramapp`) coinciden con `.env.example`.

### Tests del backend en `dramapp_test`

Los tests suponen tablas `sale` y `event` vacías, así que no se corren contra `dramapp` (que tiene los datos de las pruebas manuales), sino contra la base aparte `dramapp_test`, en el mismo contenedor. Flyway la migra sola al correr los tests.

```bash
# Una sola vez, con la base levantada: crear dramapp_test
docker exec dramapp-postgres sh -c 'psql -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE dramapp_test OWNER \"$POSTGRES_USER\";"'

# Linux / macOS / Git Bash (desde backend/): la variable solo vale para este comando
DB_NAME=dramapp_test ./mvnw test
```

```powershell
# PowerShell (desde backend/)
$env:DB_NAME = 'dramapp_test'; .\mvnw.cmd test
Remove-Item Env:DB_NAME
```

**Ojo en PowerShell:** `$env:DB_NAME` queda activa en esa terminal hasta cerrarla o hacer `Remove-Item Env:DB_NAME`. Si no la quitas, un `.\mvnw.cmd spring-boot:run` posterior en la misma terminal se conecta a `dramapp_test` en vez de `dramapp`.

## Convenciones

- **Ramas**: `tipo/DRAMA-N-descripcion-corta`, con tipo `feat`, `fix`, `chore`, `docs`, `test` o `refactor`. Ej: `feat/DRAMA-24-product-buttons`.
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
