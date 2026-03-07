# Classroom Backend

REST API for the Classroom Management System, built with Express, TypeScript, Drizzle ORM, and NeonDB (Postgres).

## Stack

- **Runtime**: Node.js + TypeScript (`tsx` watch)
- **Framework**: Express
- **Database**: Neon serverless Postgres via `drizzle-orm/neon-http`
- **Auth**: `better-auth` v1.5.1
- **Security**: Arcjet (rate limiting, bot detection, shield)

## Getting Started

### Prerequisites

- Node.js 18+
- A [Neon](https://neon.tech) Postgres database
- An [Arcjet](https://arcjet.com) account (for security middleware)

### Install

```bash
npm install
```

### Environment Variables

Create a `.env` file in this directory:

```env
DATABASE_URL=your_neon_connection_string
BETTER_AUTH_SECRET=a_long_random_secret
FRONTEND_URL=http://localhost:5173
ARCJET_KEY=your_arcjet_key
```

### Run

```bash
# Development (watch mode)
npm run dev

# Type-check
npm run typecheck
```

The server starts on **http://localhost:8000**.

## API

All routes below **except the Auth endpoints** (such as `/api/auth/sign-up/email` and `/api/auth/sign-in/email`) require authentication via a valid session cookie. Unauthenticated requests to protected routes return `401`.

### Auth

Handled by `better-auth` — no custom implementation needed.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/sign-up/email` | Register |
| POST | `/api/auth/sign-in/email` | Login |
| POST | `/api/auth/sign-out` | Logout |
| GET  | `/api/auth/session` | Get current session |

### Users `/api/users`

| Method | Path | Auth required | Description |
|--------|------|---------------|-------------|
| GET | `/` | Any | List users (search, role filter, pagination) |
| GET | `/:id` | Any | Get user by id |
| PUT | `/:id` | Any (role change: admin only) | Update user fields |
| DELETE | `/:id` | Admin or self | Delete user |

### Departments `/api/departments`

| Method | Path | Auth required | Description |
|--------|------|---------------|-------------|
| GET | `/` | Any | List departments (search, pagination) |
| POST | `/` | Any | Create department |
| GET | `/:id` | Any | Get department by id |
| PUT | `/:id` | Any | Update department fields |
| DELETE | `/:id` | Any | Delete department (blocked if subjects exist) |

### Subjects `/api/subjects`

| Method | Path | Auth required | Description |
|--------|------|---------------|-------------|
| GET | `/` | Any | List subjects (search, department filter, pagination) |
| POST | `/` | Any | Create subject |
| GET | `/:id` | Any | Get subject by id |
| PUT | `/:id` | Any | Update subject fields |
| DELETE | `/:id` | Any | Delete subject (blocked if classes exist) |

### Classes `/api/classes`

| Method | Path | Auth required | Description |
|--------|------|---------------|-------------|
| GET | `/` | Any | List classes (search, subject/teacher filter, pagination) |
| POST | `/` | Any | Create class |
| GET | `/:id` | Any | Get class details |
| PUT | `/:id` | Any | Update class fields |
| DELETE | `/:id` | Any | Delete class |
| GET | `/:id/users` | Any | List users in a class by role |
| POST | `/:id/enroll` | Admin or class teacher | Enroll a student |
| DELETE | `/:id/unenroll` | Any | Unenroll a student |
| POST | `/join` | Student | Self-enroll via invite code |

### Dashboard `/api/dashboard`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/stats` | Aggregated stats (counts, distributions, trends, recent activity) |

## Database Schema

| Table | Key columns |
|-------|-------------|
| `user` | `id`, `name`, `email`, `role` (admin/teacher/student), `image` |
| `departments` | `id`, `name`, `code` |
| `subjects` | `id`, `name`, `code`, `departmentId` |
| `classes` | `id`, `name`, `teacherId`, `subjectId`, `capacity`, `status`, `inviteCode`, `schedules` |
| `enrollments` | `studentId`, `classId` (composite PK) |

Schema is defined in `src/db/schema/` and managed via Drizzle Kit.

## Project Structure

```
src/
  db/
    index.ts          # Drizzle + Neon client
    schema/
      app.ts          # App tables (departments, subjects, classes, enrollments)
      auth.ts         # better-auth generated tables
  lib/
    auth.ts           # better-auth instance
  middleware/
    security.ts       # Arcjet middleware
  routes/
    classes.ts
    dashboard.ts
    departments.ts
    subjects.ts
    users.ts
  index.ts            # Express app entry point
```

## CI/CD

GitHub Actions workflow (`.github/workflows/ci.yml`) runs type-check and deploys to Railway on push to `main`. Requires a `RAILWAY_TOKEN` repository secret.
