# SovCorE Auto

A vehicle management platform built to keep a complete, organised record of every vehicle from first ownership through to disposal.

This repository is published as part of the author's engineering portfolio. It is shared so that reviewers and recruiters can assess the architecture, the engineering practices, and the quality of the work.

> Viewing and evaluation only. This repository is not open source. No permission is granted to clone, copy, run, reuse, modify or redistribute the code. See the [LICENSE](./LICENSE) for the full terms.

---

## What it does

SovCorE Auto replaces scattered paper receipts, maintenance spreadsheets and missed renewal reminders with a single, structured record for every vehicle.

A service job, a fuel fill, an MOT result or an uploaded invoice is entered once. The full service history, running costs, upcoming renewals and current vehicle health all update from that entry rather than being recorded separately.

It is designed for a private owner with one car, a family sharing several vehicles, or a small business managing a compact fleet, with multi-user collaboration and clearly defined access roles.

---

## Technology

| Layer | Technology |
| --- | --- |
| Frontend framework | Next.js 15, App Router |
| Frontend runtime | React 19 |
| Languages | TypeScript, Python |
| Styling | Tailwind CSS v4 with a shared design-token system |
| Backend framework | FastAPI |
| Validation | Pydantic v2 |
| Data access | SQLAlchemy with Alembic migrations |
| Database | PostgreSQL |
| Object storage | Cloudflare R2 |
| Authentication | Passwordless email codes, Microsoft SSO, JWT with refresh tokens |
| Transactional email | Resend |
| Background jobs | APScheduler |
| Tooling | Docker, type checking, linting and formatting across both applications |

---

## Architecture

Two applications with a clear separation of responsibility. The frontend owns the user interface. The backend owns the data, the business rules, the authentication and all background work. They communicate over a versioned REST API.

```
                Browser
                   |  HTTPS
                   v
        +----------------------+
        |  Next.js frontend    |  user interface only
        +----------+-----------+
                   |  REST  /api/v1
                   v
        +----------------------+
        |  FastAPI backend     |  routers -> services ->
        |                      |  repositories -> models
        +----------+-----------+
                   v
              PostgreSQL + R2
```

The backend follows a strict layer hierarchy. A router calls a service, a service calls a repository, and the repository is the only layer permitted to touch the database. Each account is an isolation boundary: every query is scoped to the calling account so no account's data is ever accessible to another.

---

## Feature set

| Feature | Description |
| --- | --- |
| Vehicles and ownership | Full technical specification per vehicle, with an ownership and finance record that follows it across transfers. |
| Record system | Fifteen record types covering every stage of a vehicle's life: maintenance, repair, fuel, MOT, tax, insurance, parking, penalty charge notices, cleaning, accessories, warranty, diagnostics, damage, roadside assistance and custom entries. |
| Maintenance history | Structured catalogue across engine, transmission, brakes, suspension, steering, wheels, cooling, electrical, climate control and exhaust. |
| Fuel and running costs | Fuel logs with MPG tracking and cost-per-mile analytics, plus a categorised running-costs breakdown. |
| Expenses | Separate expense tracking per vehicle, independent of fuel, with cost categorisation and history. |
| Custom alerts | Flexible conditions per vehicle: a fixed date, every N months or years, a mileage threshold, or every N miles. Multiple conditions per alert with configurable day and mile notification windows. |
| Attachments | Files attached to vehicles and their records. Structured support across penalty notices, damage reports and warranty records. |
| Reminders and tasks | Staged email reminders for renewal dates at configurable intervals, with assignable follow-up tasks per vehicle. |
| Email notifications | Branded transactional emails for login codes, renewal reminders and custom alerts. Each includes a registration plate block, RAG urgency colouring by days or miles remaining, and a legal footer. |
| Vehicle health score | Red, amber or green standing per vehicle from its renewal dates and open alerts, visible at a glance on the dashboard. |
| Timeline | A chronological view of every event on a vehicle, from records and documents to ownership changes and alerts. |
| Photos and gallery | Cover photo per vehicle, plus a structured before and after gallery for damage records. |
| Fleet search | Cross-fleet search across vehicles, records and documents from a single input. |
| Audit log | A complete, tamper-evident log of every data change per vehicle, accessible from the vehicle detail view. |
| Reports and export | Cost and fuel analytics, PDF service history and specification exports, and a full account data export. |
| Collaboration | Owner, Admin, Editor and Viewer roles across personal and fleet accounts, with shared access and ownership transfer. |
| UK GDPR erasure | Two-step erasure that permanently purges all database rows and associated stored files. |
| Backups | Manual and nightly scheduled backups to object storage, with download and restore from the settings panel. |

---

## Repository structure

```
SovCorE-Auto/
├── backend/
│   └── app/
│       ├── alembic/           database migrations (13 versioned migrations)
│       └── app/
│           ├── api/v1/        REST routers, one file per domain
│           ├── accounts/      users, accounts, memberships, roles
│           ├── auth/          passwordless flow, Microsoft SSO, JWT
│           ├── vehicles/      vehicle CRUD, renewals, health scoring
│           ├── records/       15-type record system with typed sub-models
│           ├── tasks/         reminders, custom alerts, tasks
│           ├── exports/       PDF generation, ZIP packaging
│           ├── reports/       analytics and aggregation queries
│           ├── scheduler/     background job runners
│           └── integrations/  Resend email, Cloudflare R2 storage
└── frontend/
    └── web/
        ├── app/               Next.js App Router pages
        └── src/
            ├── components/    shared UI components
            ├── lib/api/       typed API client
            └── styles/        global CSS and design tokens
```

---

## Background jobs

Three scheduled jobs run server-side via APScheduler:

| Job | Schedule | Purpose |
| --- | --- | --- |
| Reminder dispatch | Daily, 09:00 UTC | Sends renewal reminder emails for MOT, Tax, Insurance and Service dates at each configured interval. |
| Custom alert dispatch | Daily, 09:00 UTC | Evaluates all active custom alert conditions (date, recurring, mileage) and sends notifications where thresholds are met. |
| Scheduled backups | Nightly, 02:00 UTC | Triggers an automated account backup to object storage for every active account. |

---

## Engineering practices

| Practice | Detail |
| --- | --- |
| Layered architecture | Dependencies point one way only. Each layer is independently testable and replaceable without touching the layers above or below it. |
| Type safety | TypeScript on the frontend and Pydantic v2 on the backend. API contracts are enforced at both runtime and compile time with no untyped boundaries. |
| Security by design | Passwordless authentication, role-based access on every protected endpoint, account isolation at the query level, a full audit trail, rate limiting on auth, and seven security response headers on every response. |
| ISO/IEC 27001:2022 | Control principles applied throughout the design and access model. Not currently certified. |
| Commenting standard | A documented standard applied across every file: file-level purpose blocks and inline notes for non-obvious decisions only. |
| Delivery process | Conventional commits and a phased plan, each phase broken into small, independently reviewable steps. |
| Language | British English throughout all product copy, API responses, emails and documentation. |

---

## Project status

Active development. Eight phases delivered, covering the foundations and design system, authentication and accounts, vehicles and the fleet dashboard, the record system, operational modules, reminders and health scoring, reports and export, collaboration, and production hardening. Development is ongoing.

---

## Licence

Proprietary. Copyright M H LIKHON. All rights reserved. This repository is published for viewing and evaluation only and may not be cloned, used, copied, modified or redistributed in any form. See [LICENSE](./LICENSE).
