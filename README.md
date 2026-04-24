# NestJS Auth Starter

A production-ready authentication boilerplate for REST APIs — built with NestJS, Prisma 7, PostgreSQL, HttpOnly JWT cookies, RBAC, and Docker.

Fork it, drop in your domain modules, and skip re-implementing auth from scratch.

---

## Stack

| Area       | Technology                                                               |
| ---------- | ------------------------------------------------------------------------ |
| Framework  | NestJS                                                                   |
| Language   | TypeScript (strict, type-aware ESLint)                                   |
| Database   | PostgreSQL 16 via Prisma 7                                               |
| Auth       | Passport JWT — HttpOnly cookie transport (no Bearer headers)             |
| Validation | class-validator + class-transformer, global ValidationPipe               |
| Config     | @nestjs/config + Joi schema — fails fast on bad env                      |
| Security   | Helmet, @nestjs/throttler, bcrypt cost 12, SHA-256 hashed refresh tokens |
| Docs       | Swagger / OpenAPI at `/api` in non-production environments               |
| Tooling    | ESLint (type-aware), Prettier, Jest unit + E2E, one-command quality gate |
| Containers | Docker + Docker Compose — migrations run before app starts               |

---

## What's implemented

- Full auth lifecycle: register, login, refresh, logout, logout-all, change-password, `/auth/me`
- HttpOnly cookie auth — `accessToken` (15m) + `refreshToken` (7d)
- Refresh token rotation with DB-backed revocation — old token deleted on every refresh
- Refresh tokens stored as SHA-256 hash — breach-safe
- RBAC: `SUPER_ADMIN › ADMIN › USER` via `RolesGuard` + `@Roles()` decorator
- Global `JwtAuthGuard` with `@Public()` allowlist — secure by default
- Full `/users` admin API: list, get, role update, deactivate, hard-delete
- Soft deactivation — deactivated users blocked at login and refresh
- Structured `HttpExceptionFilter` — logs 4xx/5xx with timestamp, IP, route
- Prisma seed — one user per role, all using `Password123`
- `.http` request files for REST Client (VS Code)

---

## OWASP coverage

| ID  | Control                | Implementation                                                                      |
| --- | ---------------------- | ----------------------------------------------------------------------------------- |
| A01 | Broken Access Control  | Global JwtAuthGuard + RolesGuard, userId always from JWT payload                    |
| A02 | Cryptographic Failures | bcrypt cost 12, SHA-256 refresh tokens, HttpOnly + secure cookies                   |
| A03 | Injection              | All queries via Prisma ORM, ValidationPipe strips unknown fields                    |
| A04 | Insecure Design        | Token rotation, logout-all, isActive check before password compare                  |
| A07 | Auth Failures          | Rate limiting on auth routes, generic error messages, password strength enforcement |
| A09 | Security Logging       | HttpExceptionFilter logs all errors — IP, route, timestamp                          |

---

## Quick start

### Docker (recommended)

```bash
git clone https://github.com/pkpotter03/nestjs-auth-starter
cd nestjs-auth-starter
cp .env.example .env          # set JWT_SECRET (min 32 chars)
docker compose up --build     # starts Postgres, runs migrations, starts API
docker compose exec app npm run prisma:seed
```

### Local

```bash
npm install
cp .env.example .env          # configure DATABASE_URL + JWT_SECRET
npm run prisma:deploy
npm run prisma:seed
npm run start:dev
```

API: `http://localhost:3000` — Swagger: `http://localhost:3000/api`

> Swagger is available in development and test environments. It is disabled automatically when `NODE_ENV=production`.

---

## API reference

| Method   | Endpoint                | Auth                | Role          |
| -------- | ----------------------- | ------------------- | ------------- |
| `GET`    | `/`                     | None                | —             |
| `POST`   | `/auth/register`        | None                | —             |
| `POST`   | `/auth/login`           | None                | —             |
| `POST`   | `/auth/refresh`         | refreshToken cookie | —             |
| `POST`   | `/auth/logout`          | accessToken cookie  | —             |
| `POST`   | `/auth/logout-all`      | accessToken cookie  | —             |
| `POST`   | `/auth/change-password` | accessToken cookie  | —             |
| `GET`    | `/auth/me`              | accessToken cookie  | —             |
| `GET`    | `/users`                | accessToken cookie  | `ADMIN`+      |
| `GET`    | `/users/:id`            | accessToken cookie  | `ADMIN`+      |
| `PATCH`  | `/users/:id/role`       | accessToken cookie  | `SUPER_ADMIN` |
| `PATCH`  | `/users/:id/deactivate` | accessToken cookie  | `ADMIN`+      |
| `DELETE` | `/users/:id`            | accessToken cookie  | `SUPER_ADMIN` |

---

## Project structure

```
src/
  auth/             Login, register, refresh, logout — JWT strategy, DTOs
  common/           @Public(), @Roles(), @CurrentUser() — JwtAuthGuard, RolesGuard, HttpExceptionFilter
  config/           Joi env validation schema
  generated/prisma  Prisma 7 generated client (git-ignored)
  health/           GET / health endpoint
  prisma/           PrismaModule + PrismaService
  users/            Admin user management
prisma/
  migrations/       Versioned migration files
  schema.prisma     User + RefreshToken models
  seed.ts           3 seed users (one per role)
prisma.config.ts    Prisma 7 config — datasource, migration path, seed command
requests/           REST Client .http files
test/               E2E test setup and specs
```

---

## Extending this project

```typescript
// Add a new module
npx nest g module products
npx nest g controller products
npx nest g service products

// Protect a route by role
@Roles(Role.ADMIN)
@Get()
findAll() { ... }

// Make a route public
@Public()
@Get('public')
publicRoute() { ... }

// Add a Prisma model — edit schema.prisma, then:
npm run prisma:migrate -- --name add_products
npm run prisma:generate
```

---

## Quality gate

```bash
npm run check   # format check + lint + typecheck + unit tests + e2e tests
```

Run this before every commit. If it passes, the code is clean.

---

## Getting started in detail

This section walks through setup from scratch — what each tool does, why it's here, and exactly how to get things running.

### What is this project?

This is a **backend API** — a server that handles user accounts, login, and permissions. It has no frontend (no buttons, no pages). You interact with it by sending HTTP requests and it responds with JSON.

Think of it as the "auth layer" that every real app needs. Instead of building login from scratch every time, you fork this and build your features on top.

---

### Tools and what they do

**NestJS** — the framework this API is built with. It's like Express.js but more structured. It organizes code into modules, controllers, and services and uses TypeScript throughout.

**Prisma** — the tool that talks to the database. Instead of writing raw SQL, you define your data models in a `schema.prisma` file and Prisma handles the queries.

**PostgreSQL** — the database where all user data is stored. Prisma connects to it using the `DATABASE_URL` in your `.env` file.

**Docker** — a tool that packages the app and database into containers so they run the same way on every machine. Think of it as a self-contained box that has everything the app needs to run — you don't need to install or configure PostgreSQL separately.

**JWT (JSON Web Token)** — a small encoded string that proves who you are. After you log in, the server creates a JWT and stores it in a cookie. Your browser sends it back automatically on every request so the server knows it's you.

**HttpOnly cookie** — instead of storing the JWT in your JavaScript code (which is risky), this project stores it in a special cookie that only the browser can read. This protects against a common attack called XSS where malicious scripts try to steal your tokens.

**Swagger** — an interactive web page at `/api` where you can test all the API endpoints directly in your browser without needing Postman.

> Swagger is meant for development and testing. In this project, `/api` is not mounted in production.

---

### Prerequisites

| Tool               | Why                                 | How to install                                                    |
| ------------------ | ----------------------------------- | ----------------------------------------------------------------- |
| Node.js 20+        | Runs the API                        | [nodejs.org](https://nodejs.org) — download the LTS version       |
| npm                | Installs packages — comes with Node | Included with Node.js                                             |
| PostgreSQL 16      | The database                        | [postgresql.org/download](https://www.postgresql.org/download/)   |
| Docker (optional)  | Run everything with one command     | [docs.docker.com/get-docker](https://docs.docker.com/get-docker/) |
| VS Code (optional) | Code editor with useful extensions  | [code.visualstudio.com](https://code.visualstudio.com)            |

Verify Node and npm are installed:

```bash
node -v    # should print v20.x.x or higher
npm -v     # should print 9.x.x or higher
```

---

### Option A — Run with Docker (easiest)

Docker starts PostgreSQL and the API together automatically. You don't need to install PostgreSQL separately.

**Step 1 — Clone the repository**

```bash
git clone https://github.com/pkpotter03/nestjs-auth-starter
cd nestjs-auth-starter
```

> Cloning downloads a copy of the project to your machine.

**Step 2 — Create your environment file**

```bash
cp .env.example .env
```

This creates a `.env` file from the example template. Open it in a text editor — it looks like this:

```env
PORT=3000
NODE_ENV=development
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/auth_starter
JWT_SECRET=your-super-secret-key-min-32-chars-long
JWT_ACCESS_TOKEN_EXPIRY=15m
JWT_REFRESH_TOKEN_EXPIRY=7d
THROTTLE_TTL=60
THROTTLE_LIMIT=10
```

Replace `JWT_SECRET` with a long random string. Generate one by running:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output and paste it as your `JWT_SECRET` value.

> **Why does JWT_SECRET matter?** The server uses this secret to sign tokens. If someone knows your secret, they can forge tokens and impersonate any user. Keep it private and never commit it to Git.

**Step 3 — Start everything**

```bash
docker compose up --build
```

The first time this runs it will take a few minutes — it's downloading PostgreSQL and Node.js images. When you see a line like this, the API is ready:

```
Application is running on: http://[::1]:3000
```

**Step 4 — Add test users**

Open a second terminal window (keep the first one running) and run:

```bash
docker compose exec app npm run prisma:seed
```

This creates three test users in the database.

**Step 5 — Open Swagger**

Go to [http://localhost:3000/api](http://localhost:3000/api) in your browser. You'll see the interactive API docs.

> This works in development. In production, Swagger is disabled on purpose.

---

### Option B — Run locally (without Docker)

Use this if you don't have Docker or prefer to run PostgreSQL directly on your machine.

**Step 1 — Clone and install**

```bash
git clone https://github.com/pkpotter03/nestjs-auth-starter
cd nestjs-auth-starter
npm install
```

> `npm install` reads `package.json` and downloads all the libraries the project needs into a `node_modules` folder.

**Step 2 — Create the database**

Connect to PostgreSQL:

```bash
psql -U postgres
```

If it asks for a password, use the one you set when installing PostgreSQL. Then run:

```sql
CREATE DATABASE auth_starter;
\q
```

**Step 3 — Create your environment file**

```bash
cp .env.example .env
```

Edit `.env` and update `DATABASE_URL` to match your local PostgreSQL:

```env
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/auth_starter
JWT_SECRET=paste-your-generated-secret-here
```

Generate a JWT secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Step 4 — Run migrations**

```bash
npm run prisma:deploy
```

> Migrations are versioned scripts that create or update database tables. The project's migrations create the `users` and `refresh_tokens` tables. Running `prisma:deploy` applies all of them in order. You should see output like:
>
> ```
> 2 migrations found in prisma/migrations
> 2 migrations applied
> ```

**Step 5 — Seed test users**

```bash
npm run prisma:seed
```

This runs `prisma/seed.ts` which inserts 3 users into the database.

**Step 6 — Start the API**

```bash
npm run start:dev
```

When you see `Application is running on: http://[::1]:3000`, the API is ready.

Open Swagger: [http://localhost:3000/api](http://localhost:3000/api)

> Swagger is only available outside production.

---

### Seed users

These are the test users created by the seed script. All use the password `Password123`.

| Email                    | Role          | What they can do                                         |
| ------------------------ | ------------- | -------------------------------------------------------- |
| `superadmin@example.com` | `SUPER_ADMIN` | Everything — including changing roles and deleting users |
| `admin@example.com`      | `ADMIN`       | View and deactivate users                                |
| `user@example.com`       | `USER`        | View their own profile only                              |

---

### Using Swagger

Swagger is the interactive API explorer at [http://localhost:3000/api](http://localhost:3000/api). It lists every endpoint with its expected inputs and outputs and lets you test them in the browser.

> In production, `/api` is disabled. Use Swagger locally for development, learning the API, and manual testing.

**Logging in and testing a protected route:**

1. Find `POST /auth/login` in the list and click on it
2. Click **Try it out** in the top-right corner of that section
3. Replace the example body with:
   ```json
   {
     "email": "superadmin@example.com",
     "password": "Password123"
   }
   ```
4. Click **Execute** — you should get a `200` response. The server has now set cookies in your browser.
5. Scroll up to `GET /auth/me`, click **Try it out → Execute**
6. You'll see your user profile returned — this worked because the cookie from step 4 was sent automatically

> **Why does it work without pasting a token?** Because the token lives in a cookie and browsers send cookies automatically on every request to the same origin. That's the whole point of cookie-based auth — you never have to handle the token manually.

---

### How the auth flow works

Here's exactly what happens at each step:

![NestJS Auth Flow Diagram](./assets/nestjs_auth_flow_diagram.svg)

Password change follows the same security-first approach:

- the user must already be authenticated with the `accessToken` cookie
- they must provide their current password
- the server verifies the current password before hashing the new one
- all refresh tokens are revoked after the password change
- auth cookies are cleared, so the user must log in again

> **Why log the user out after changing the password?** Because it forces every existing session to be re-authenticated. This is safer than silently keeping old sessions alive after credentials change.

---

### Roles and permissions

Some routes require a specific role. For example, only a `SUPER_ADMIN` can change another user's role.

The hierarchy works like this:

```
SUPER_ADMIN  can access everything
    ADMIN    can access ADMIN and USER routes
     USER    can access USER routes only
```

If you try to access an admin route while logged in as a `USER`, you'll get:

```json
{
  "statusCode": 403,
  "message": "Forbidden resource"
}
```

Try it — log in as `user@example.com` in Swagger and call `GET /users`. You'll get a `403`. Then log in as `admin@example.com` and try again.

---

### Environment variables

| Variable                   | What it controls                               | Example                                   |
| -------------------------- | ---------------------------------------------- | ----------------------------------------- |
| `PORT`                     | Which port the API listens on                  | `3000`                                    |
| `NODE_ENV`                 | Development mode vs production                 | `development`                             |
| `DATABASE_URL`             | How to connect to PostgreSQL                   | `postgresql://user:pass@host:5432/dbname` |
| `JWT_SECRET`               | Secret used to sign tokens — keep this private | a 64-character random string              |
| `JWT_ACCESS_TOKEN_EXPIRY`  | How long the access token lasts                | `15m` (15 minutes)                        |
| `JWT_REFRESH_TOKEN_EXPIRY` | How long the refresh token lasts               | `7d` (7 days)                             |
| `THROTTLE_TTL`             | Rate limit window in seconds                   | `60`                                      |
| `THROTTLE_LIMIT`           | Max requests allowed per window                | `10`                                      |

> **What happens if a required variable is missing?** The app refuses to start and tells you exactly which variable is missing. This is intentional — it's better to fail loudly at startup than crash silently later.
>
> **What changes in production mode?** Swagger is disabled when `NODE_ENV=production`, so `/api` will not be available.

---

### Prisma commands

| Command                                        | What it does                                     | When to use it                        |
| ---------------------------------------------- | ------------------------------------------------ | ------------------------------------- |
| `npm run prisma:generate`                      | Rebuilds the Prisma client from `schema.prisma`  | After changing the schema             |
| `npm run prisma:migrate -- --name your_change` | Creates a new migration file from schema changes | While actively developing             |
| `npm run prisma:deploy`                        | Applies all pending migrations to the database   | Initial setup, or a fresh environment |
| `npm run prisma:seed`                          | Runs `prisma/seed.ts` to insert test data        | After setting up the database         |

> **migrate vs deploy:** Use `prisma:migrate` when you're changing the schema during development — it creates new migration files. Use `prisma:deploy` when you just want to apply existing migrations to a fresh database without creating new ones.

---

### Testing with .http files

If you're using VS Code, install the **REST Client** extension (search `humao.rest-client` in the Extensions panel).

Then open `requests/auth.http` or `requests/users.http`. You'll see requests like:

```http
POST http://localhost:3000/auth/login
Content-Type: application/json

{
  "email": "superadmin@example.com",
  "password": "Password123"
}
```

Click **Send Request** above any block. The response appears in a panel on the right.

> **Cookie tip:** After login, look for `Set-Cookie` in the response headers. The cookies are handled automatically in Swagger, but in `.http` files you may need to copy the `accessToken` value and add it manually to subsequent requests.

---

### Code quality commands

```bash
npm run format          # auto-formats all files with Prettier
npm run format:check    # checks formatting without making changes
npm run lint            # checks code for errors and bad patterns
npm run lint:fix        # automatically fixes lint issues where possible
npm run typecheck       # checks TypeScript types without compiling
npm run test            # runs unit tests
npm run test:e2e        # runs end-to-end tests (needs a running database)
npm run check           # runs all of the above in one go
```

> **What should you run most of the time?** Use `npm run check` before every commit or push. It verifies formatting, lint rules, TypeScript types, unit tests, and E2E tests in one command.
>
> **When should you use the others separately?**
>
> - Use `npm run format` or `npm run lint:fix` while actively editing code and you want quick auto-fixes.
> - Use `npm run typecheck` when you're debugging TypeScript errors specifically.
> - Use `npm run test` when you're only validating business logic and don't need the full pipeline.
> - Use `npm run test:e2e` when you want to confirm the API works end-to-end against the real app setup.

---

## License

MIT
