# Image Processing Platform

Web platform for high-quality image resizing, compression, conversion, cropping,
enhancement and (in a later phase) real AI super-resolution.

The product name is configurable (`NEXT_PUBLIC_BRAND_NAME` in `.env`).

## Status

| Phase | Scope | State |
|---|---|---|
| 1 | Monorepo, TypeScript, database schema, API foundation, web shell | **Done** |
| 2 | Core engine and image APIs: upload, resize, crop, rotate, flip, compress, convert, enhance, batch, ZIP | **Done (API)** |
| 3 | Website: homepage and Resizer, Batch Resizer, Compressor, Converter, Cropper, Enhancer and Metadata Viewer pages | **Done** |
| 4–10 | Full editor workspace, auth & dashboard, AI service, admin, billing, hardening, deployment | Planned |

## Repository layout

```text
apps/
  api/            Express REST API (Node.js, TypeScript, sharp/libvips)
  web/            Next.js app (public site, tools, editor, dashboards)
packages/
  db/             Prisma schema, migrations, seed, database client
  image-core/     Pure dimension / preset / format logic shared by web and API
  shared/         Shared zod schemas, API types, error codes, brand config
```

## Prerequisites (Windows)

- Node.js 22.12+ (developed on Node 24 LTS) and npm 10+
- No separate PostgreSQL install is needed for development: `npm run db:local`
  runs a real PostgreSQL 17 from npm. Production needs a normal PostgreSQL 16+.

> This folder sits inside XAMPP's `htdocs`. The root `.htaccess` stops Apache
> from serving any file in it, including `.env`. Don't delete it.

## First-time setup

```powershell
# 1. Install dependencies (this also generates the Prisma client)
npm install

# 2. Create your environment file, then edit DATABASE_URL in it
Copy-Item .env.example .env
```

In `.env`, set `COOKIE_SECRET` to a random value:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Database setup (first time)

```powershell
npm run db:local     # terminal 1: starts PostgreSQL on localhost:5433 (keep it open)
npm run db:deploy    # terminal 2: create the tables
npm run db:seed      # insert default plans, presets and settings
```

The default `DATABASE_URL` in `.env.example` already points at this local
database. Data is kept in `.pgdata/` between runs.

To use your own PostgreSQL instead, create a database and put its URL in
`DATABASE_URL`.

## Running in development

Use three terminals:

```powershell
npm run db:local  # database (localhost:5433)
npm run dev:api   # API + image worker (http://localhost:4000)
npm run dev:web   # website (http://localhost:3000)
```

Open http://localhost:3000. The **System status** panel shows live checks of
the API, the database and the image engine (sharp/libvips version and
JPEG/PNG/WebP/AVIF support).

## Useful commands

| Command | What it does |
|---|---|
| `npm test` | Run all unit and integration tests (starts a throwaway database automatically) |
| `npm run test:e2e` | Browser tests of every tool, desktop and mobile (needs `npm run db:local` running; first time: `npx playwright install chromium`) |
| `npm run typecheck` | Type-check every workspace |
| `npm run build` | Production build of API (`apps/api/dist`) and web (`apps/web/.next`) |
| `npm run start:api` / `npm run start:web` | Run the production builds |
| `npm run db:migrate` | Create a new migration after editing `schema.prisma` (dev only) |
| `npm run db:deploy` | Apply pending migrations (dev and production) |
| `npm run db:seed` | Insert default plans, presets, AI model entries and settings (safe to repeat) |
| `npm run db:studio` | Browse the database in Prisma Studio |

## API endpoints

Full reference with examples: [docs/api.md](docs/api.md).

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health`, `/api/health/live` | Readiness diagnostics and liveness |
| GET | `/api/config`, `/api/presets` | Limits, formats and size presets for the UI |
| POST | `/api/images/upload` | Upload one or more images (multipart, field `files`) |
| GET | `/api/images` | List your images |
| GET | `/api/images/:id` | Image details |
| GET | `/api/images/:id/file` | View the file (`?download=1` to download it) |
| GET | `/api/images/:id/thumbnail` | Thumbnail |
| GET | `/api/images/:id/metadata` | Metadata viewer (EXIF, colour space, GPS presence) |
| DELETE | `/api/images/:id` | Delete an image now |
| GET | `/api/images/zip?ids=a,b` | Download selected images as a ZIP |
| POST | `/api/images/resize` · `crop` · `rotate` · `flip` · `enhance` · `sharpen` · `blur` · `background` · `compress` · `convert` | One tool; returns a job |
| POST | `/api/images/process` | Ordered list of operations (editor) |
| POST | `/api/images/batch` | Same settings for many images |
| GET | `/api/jobs`, `/api/jobs/:id` | Job list, and a job's status and progress (poll this endpoint) |
| POST | `/api/jobs/:id/cancel`, `/api/jobs/:id/retry` | Cancel a queued job or retry a failed one |
| GET | `/api/batches/:id`, `/api/batches/:id/download` | Batch status and a ZIP of its results |

Errors always use this shape:
`{ "error": { "code": "NOT_FOUND", "message": "...", "requestId": "..." } }`.
Internal details such as stack traces, file paths and SQL are never sent to clients.

## Configuration

Every setting is in `.env` (see `.env.example` for the list and descriptions).
The API validates its configuration at startup and exits with a readable
message if anything is missing or malformed.

Only variables prefixed with `NEXT_PUBLIC_` are exposed to the browser. Never
put secrets in them.
