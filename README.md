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

### 2. Backend (Spring Boot, puerto 8080)

En una terminal:

```powershell
cd backend
.\mvnw.cmd spring-boot:run
```

Para comprobarlo: http://localhost:8080/api/system/status

### 3. Frontend (Angular, puerto 4200)

En otra terminal:

```powershell
cd frontend
npm install   # solo la primera vez o si cambian las dependencias
npm start
```

### 4. Abrir la app

Abre http://localhost:4200. La pantalla "DRAMApp" muestra el estado del backend, la versión de PostgreSQL y la hora de la base. En desarrollo, las llamadas a `/api` se redirigen al backend mediante el proxy de Angular (`frontend/proxy.conf.json`).

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
