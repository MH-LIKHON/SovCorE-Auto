# SovCorE Auto

Self-hosted vehicle management for individuals, families and small fleets, with a complete service history, running costs, documents and reminders held in one place and a clear audit trail behind every change.

A modern platform that records a vehicle once and keeps its maintenance, expenses, fuel, documents, timeline, health score and reports in step from that single entry. Built for owners who want their vehicle records organised and defensible, and simple enough for one car or capable enough for a small fleet. Owned and operated by VelVadY LTD trading as SovCorE.

> SovCorE Auto is in active development ahead of launch. The sections below describe the product and its architecture. Surfaces that are designed but not yet live are marked as such in plain prose.

---

## Live links

The product is planned to launch on the `auto.sovcore.com` subdomain. The addresses below are part of the product design and are not yet on the public record at the time of writing.

| Surface | Address | State |
| --- | --- | --- |
| Production application | `https://auto.sovcore.com` | Planned, not yet public (pre-launch) |
| Marketing home | `https://auto.sovcore.com/` | Planned, not yet public |
| Privacy notice | `https://auto.sovcore.com/legal/privacy` | Planned, not yet public |
| Terms of service | `https://auto.sovcore.com/legal/terms` | Planned, not yet public |
| Cookie policy | `https://auto.sovcore.com/legal/cookies` | Planned, not yet public |
| Security policy | `https://auto.sovcore.com/legal/security` | Planned, not yet public |

---

## At a glance

SovCorE Auto is the system an owner reaches for when a glovebox full of receipts and a spreadsheet have stopped being enough. It is built around three priorities, in order: a single source of truth so a fact is entered once and never re-keyed, a record of every change so the history is defensible, and correctness in the maths behind costs, fuel economy and renewal dates over feature count.

The buyer is a private owner, a family sharing several vehicles, or a small business running a handful of vans. The product runs vehicle records, a full maintenance history, fuel and running costs, documents, reminders for the dates that matter, a vehicle health score, multi-user collaboration with roles, reporting and export, all on a Next.js application backed by a Python service and PostgreSQL on Neon.

---

## Product overview

**Vehicles and ownership.** Registration, VIN, make, model, variant, year, engine, fuel, transmission, body type, and the full specification, with a separate ownership and finance record that travels with the vehicle as it changes hands.

**The record system.** Every action is a record: maintenance, repair, fuel, MOT, road tax, insurance, parking, penalty charge notices, cleaning, accessories, warranty, diagnostics and damage. The timeline, the cost totals and the health score are read from those records, never entered a second time.

**Maintenance history.** A structured catalogue across engine, transmission, brakes, suspension, steering, wheels, cooling, electrical, climate control and exhaust, with parts, labour, supplier and next-due tracking.

**Fuel and running costs.** Fuel logs with automatic economy and cost-per-mile analytics, and a running-costs view across insurance, tax, MOT, parking, breakdown cover, congestion and clean-air charges and tolls.

**Documents and photos.** V5C, insurance and MOT certificates, invoices, warranty and finance agreements, and vehicle photographs, stored in object storage and attached to the vehicle and its records.

**Reminders and tasks.** Email reminders for MOT, tax, insurance, service, tyres, warranty and finance, sent ahead of the date at staged intervals, with assignable tasks for the work that follows.

**Vehicle health score.** A clear red, amber or green standing for each vehicle, computed from MOT, tax, insurance, service, tyres, battery, open warnings and outstanding tasks.

**Multi-user collaboration.** Personal, family, business and fleet accounts, with Owner, Admin, Editor and Viewer roles, shared vehicles, ownership transfer, and an activity history.

**Reports, export and backup.** Cost and fuel reports, PDF vehicle and service-history exports, a full account export, and scheduled backups with restore.

---

## What this is not

A two-minute self-qualification.

- **Not a garage booking platform.** SovCorE Auto records the work and its cost. It does not book a garage or take payment for a service.
- **Not a DVLA or insurance broker.** It tracks MOT, tax and insurance dates and documents. It does not tax a vehicle, renew an MOT, or sell insurance.
- **Not a live telematics or tracking device.** Mileage and events are recorded by the user or imported. There is no on-board tracker or real-time location feed.
- **Not a marketplace.** There is no buying, selling or valuation engine.
- **Automatic vehicle-data lookup is not in the first release.** Vehicle details are entered by hand at launch. Lookup from a registration is on the roadmap.

---

## Architecture

SovCorE Auto is two applications: a Next.js frontend that owns the user interface, and a Python FastAPI backend that owns the data, the rules, the authentication and the background work. They communicate over a versioned REST API. The frontend shares the SovCorE platform design language used across the suite.

```
                          Browser
                             │  HTTPS
                             ▼
              ┌──────────────────────────────┐
              │  Next.js frontend            │
              │  user interface only         │
              └──────────────┬───────────────┘
                             │  REST  /api/v1
                             ▼
              ┌──────────────────────────────┐
              │  FastAPI backend             │
              │  routers → services →        │
              │  repositories → models       │
              └──────────────┬───────────────┘
                             │
        ┌──────────┬─────────┼──────────┬──────────┐
        ▼          ▼         ▼          ▼          ▼
       Neon    Cloudflare  Resend   Microsoft   Background
      Postgres    R2       (email)    (SSO)        jobs
```

The backend keeps a strict separation of layers. A router calls a service, a service calls a repository, and the repository is the only layer that touches the database. Every domain row carries an account reference, and every query is scoped to the caller's account so one account's vehicles are never visible to another.

---

## Technology stack

| Layer | Choice |
| --- | --- |
| Frontend framework | Next.js 15, App Router |
| Frontend runtime | React 19 |
| Styling | Tailwind v4 with the SovCorE platform design tokens |
| Backend framework | Python FastAPI |
| Validation | Pydantic |
| ORM | SQLAlchemy or SQLModel with Alembic migrations |
| Database | Neon PostgreSQL |
| Object storage | Cloudflare R2 |
| Email | Resend |
| Authentication | Passwordless email codes, Microsoft SSO, JWT with refresh tokens |
| Container | Docker, multi-stage images |
| Edge | Cloudflare Tunnel terminating at the production server |

---

## Security and data posture

Security is part of the design, not an afterthought.

- **Passwordless authentication.** Sign-in uses a six-digit email code with a ten-minute lifetime, with Microsoft single sign-on through OpenID Connect. Access is a short-lived token held in memory; the refresh token is an HTTP-only cookie.
- **Role-based access.** Owner, Admin, Editor and Viewer roles are enforced on every protected endpoint.
- **Account isolation.** The account is the tenant boundary. Every record is scoped to its account, and no query returns another account's data.
- **An audit record.** Creates, updates and deletes on tracked data are recorded with the actor, the change and the time.
- **Information-security standard.** SovCorE Auto is built to ISO/IEC 27001:2022 control principles. It is not currently certified.

---

## Roadmap

The build is phased. Each phase ships before the next begins.

| Phase | Focus |
| --- | --- |
| 0 | Foundations: the frontend and backend frame, the shared design language, the data and storage layers |
| 1 | Authentication, account types and roles, the public and legal pages |
| 2 | Vehicles, vehicle cards, the profile, the dashboard, document upload |
| 3 | The record system: records, maintenance categories, timeline, audit log |
| 4 | Fuel and running costs, penalty charge notices, damage history, warranty |
| 5 | Reminders, tasks and the vehicle health score |
| 6 | Reports, export and search |
| 7 | Backup and recovery, multi-user collaboration |
| 8 | Hardening and production deployment |

Planned beyond the phases above: automatic vehicle-data lookup from a registration, an interactive vehicle view, billing for the hosted offering, and additional single sign-on providers.

---

## Local development

The repository is a monorepo with a Next.js frontend and a FastAPI backend, run together with Docker for local work. A full local quickstart will be published with the first release.

---

## Third-party services

| Service | Use |
| --- | --- |
| Neon | PostgreSQL database |
| Cloudflare R2 | Object storage for images, invoices, PDFs and backups |
| Cloudflare Tunnel | Edge connectivity and protection for the production server |
| Resend | Transactional email: login codes, invitations, reminders |
| Microsoft identity platform | Single sign-on through OpenID Connect |

---

## Licence and contact

Proprietary. Copyright VelVadY LTD trading as SovCorE. All rights reserved.

For enquiries, contact the operator through the SovCorE website.
