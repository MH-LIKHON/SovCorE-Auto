# SovCorE Auto

A vehicle management platform that records a vehicle once and keeps its service history, running costs, documents, reminders and reports in step from that single entry.

This repository is published as part of the author's engineering portfolio. It is shared so that reviewers and recruiters can see the architecture, the engineering practices, and the quality of the work.

> Viewing and evaluation only. This repository is not open source. No permission is granted to clone, copy, run, reuse, modify or redistribute the code. See the LICENSE for the full terms.

---

## Overview

SovCorE Auto turns a glovebox of receipts and a spreadsheet into one organised, defensible record for every vehicle. A maintenance job, a fuel fill, an MOT result or an uploaded document is entered once, and the timeline, the cost totals, the renewal reminders and the vehicle health score are read from that entry rather than typed again.

It is designed for a private owner with one car, a family sharing several vehicles, or a small business running a handful of vans, with multi-user collaboration and clear roles.

This project demonstrates a full product built across two applications: a typed React frontend and a Python service behind a versioned REST API, with a relational data model, role-based access, and a documented, phased delivery plan.

---

## Technology

| Layer | Technology |
| --- | --- |
| Frontend framework | Next.js 15, App Router |
| Frontend runtime | React 19 |
| Language | TypeScript |
| Styling | Tailwind v4 with a shared design-token system |
| Backend framework | Python, FastAPI |
| Validation | Pydantic |
| Data access | SQLAlchemy or SQLModel with Alembic migrations |
| Database | PostgreSQL |
| Authentication | Passwordless email codes, Microsoft single sign-on, JWT with refresh tokens |
| Tooling | Docker, type checking, linting and formatting on both applications |

---

## Architecture

Two applications with a clear separation of responsibility. The frontend owns the user interface. The backend owns the data, the rules, the authentication and the background work. They communicate over a versioned REST API.

```
                Browser
                   │  HTTPS
                   ▼
        ┌────────────────────┐
        │  Next.js frontend  │   user interface only
        └─────────┬──────────┘
                  │  REST  /api/v1
                  ▼
        ┌────────────────────┐
        │  FastAPI backend   │   routers → services →
        │                    │   repositories → models
        └─────────┬──────────┘
                  ▼
            PostgreSQL
```

The backend holds a strict layering. A router calls a service, a service calls a repository, and the repository is the only layer that touches the database. Each account is an isolation boundary, and every query is scoped to the caller's account so one account's data is never visible to another.

---

## Feature set

- **Vehicles and ownership.** Full specification, plus an ownership and finance record that travels with the vehicle.
- **Record system.** Every action is a record: maintenance, repair, fuel, MOT, tax, insurance, parking, penalty notices, warranty, diagnostics and damage.
- **Maintenance history.** A structured catalogue across engine, transmission, brakes, suspension, steering, wheels, cooling, electrical, climate control and exhaust.
- **Fuel and running costs.** Fuel logs with economy and cost-per-mile analytics, and a complete running-costs view.
- **Documents and photos.** Certificates, invoices and agreements attached to a vehicle and its records.
- **Reminders and tasks.** Staged email reminders for the dates that matter, with assignable follow-up tasks.
- **Vehicle health score.** A red, amber or green standing per vehicle from its key dates and condition.
- **Collaboration.** Account types and Owner, Admin, Editor and Viewer roles, with shared vehicles and ownership transfer.
- **Reports and export.** Cost and fuel reporting, PDF vehicle and service-history exports, and a full account export.

---

## Engineering practices

- **Layered architecture** with dependencies pointing one way, so each layer is testable and replaceable.
- **Type safety end to end**, TypeScript on the frontend and Pydantic schemas on the backend.
- **Security by design**: passwordless authentication, role-based access on every protected endpoint, account isolation, and an audit record of changes.
- **A documented commenting standard** applied to every file, so the codebase reads clearly.
- **Conventional commits** and a phased delivery plan, each phase broken into small, reviewable steps.
- **British English** throughout the product copy and documentation.

---

## Project status

In active development. The product is delivered in phases, from the foundations and the shared design system, through authentication and accounts, vehicles and the dashboard, the record system, the operational modules, reminders and the health score, reports and export, collaboration, and finally hardening for release.

---

## Licence

Proprietary. Copyright M H LIKHON. All rights reserved. This repository is published for viewing and evaluation only and may not be cloned, used, copied, modified or redistributed. See [LICENSE](./LICENSE).
