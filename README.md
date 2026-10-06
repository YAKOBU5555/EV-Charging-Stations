# EV Charging Station Health Monitoring System

A Node.js + Express application for monitoring the health of electric vehicle charging
infrastructure. It tracks stations and chargers, scores charger health from live telemetry,
raises and clears alerts, records charging sessions, schedules maintenance, and streams every
change to a dashboard over Socket.IO. A built-in simulator generates realistic readings when no
hardware is connected.

## Features

- Role-based access for administrators, operators and viewers (JWT + bcrypt)
- Live operations dashboard with stat cards, health and status charts, station map, recent alerts and active sessions
- Station and charger management with search, filters and an OpenStreetMap view
- Configurable health scoring (0–100) across communication, temperature, voltage, current, error state and maintenance
- Automatic alert generation, de-duplication, acknowledgement, resolution and auto-clearing
- Charging session tracking, opened and closed automatically as chargers start and stop delivering power
- Analytics over any date range: energy, utilisation, uptime, downtime, fault frequency, station performance
- Maintenance scheduling with overdue and upcoming reminders
- Telemetry simulator with fault injection, startable and stoppable from the UI, with every simulated reading labelled
- Consistent REST envelopes, centralised error handling, request validation, rate limiting and secure headers

## Technology

**Backend** — Node.js, Express, MongoDB with Mongoose, Socket.IO, JSON Web Tokens, bcryptjs,
express-validator, helmet, express-rate-limit, CORS, dotenv.

**Frontend** — HTML5, CSS3, vanilla JavaScript, Bootstrap 5, Chart.js, Leaflet with OpenStreetMap
tiles, the Socket.IO browser client. No build step and no framework — the `public/` folder is served
directly by Express.

**Testing** — Jest and Supertest against an in-memory MongoDB.

## Architecture

```
 hardware / simulator
         │  reading
         ▼
 telemetryService.ingest
         │
         ├── ChargerTelemetry.create        (append-only history)
         ├── healthCalculator               (score against SystemConfiguration)
         ├── healthMonitoringService        (persist charger + roll up station health)
         ├── alertService                   (raise new alerts, clear cleared ones)
         └── monitoringSocket.emit          (charger:update, alert:new, stats:refresh)
                                                      │
                                              browser dashboard
```

Requests flow `route → middleware (auth, role, validation) → controller → service/model`, and every
response is wrapped by `utils/apiResponse.js` or normalised by `middleware/errorMiddleware.js`.

### Database relationships

| Relationship | Notes |
| --- | --- |
| `ChargingStation` 1 → N `Charger` | `Charger.station` references the station; deleting a station deletes its chargers |
| `Charger` 1 → N `ChargerTelemetry` | time-series of raw readings, indexed on `{ charger, recordedAt }` |
| `Charger` 1 → N `Alert` | alerts also carry `station` so operator scoping is a single query |
| `Charger` 1 → N `ChargingSession` | at most one session per charger is `Active` |
| `ChargingStation` 1 → N `Maintenance` | `charger` is optional: a job can cover the whole station |
| `User` N → N `ChargingStation` | `assignedStations` scopes what an operator can see |
| `SystemConfiguration` | one document, key `default`, holding thresholds, weights and simulator settings |

## Installation

Requirements: Node.js 18 or newer and MongoDB 5 or newer.

```bash
git clone <your-repo-url> ev-charging-monitoring
cd ev-charging-monitoring
npm install
cp .env.example .env     # then edit JWT_SECRET and MONGO_URI
npm run seed
npm start
```

Open http://localhost:3000.

For development with auto-reload:

```bash
npm run dev
```

### MongoDB setup

Local install:

```bash
# macOS
brew services start mongodb-community
# Ubuntu
sudo systemctl start mongod
```

`MONGO_URI=mongodb://127.0.0.1:27017/ev_charging_monitoring` works with a default local install.
For MongoDB Atlas, paste the connection string from your cluster instead and whitelist your IP.

### Environment variables

| Variable | Purpose |
| --- | --- |
| `PORT` | HTTP port (default 3000) |
| `NODE_ENV` | `development`, `production` or `test` |
| `MONGO_URI` | MongoDB connection string |
| `JWT_SECRET` | Signing secret — set a long random value |
| `JWT_EXPIRES_IN` | Token lifetime, e.g. `8h` |
| `BCRYPT_SALT_ROUNDS` | Password hashing cost (10 is a good default) |
| `CORS_ORIGIN` | `*` or a comma-separated allowlist |
| `SIMULATOR_AUTOSTART` | Start generating telemetry on boot |
| `SIMULATOR_INTERVAL_MS` | Milliseconds between simulator cycles |
| `SIMULATOR_FAULT_PROBABILITY` | Chance of injecting a fault per reading |
| `LOG_LEVEL` | `error`, `warn`, `info` or `debug` |

### Seeding

```bash
npm run seed
```

This wipes the collections and inserts 6 stations, 3–6 chargers each, three users, two weeks of
charging sessions, telemetry history, alerts and maintenance records.

## Test credentials

| Role | Email | Password |
| --- | --- | --- |
| Admin | admin@evmonitor.com | Admin@12345 |
| Operator | operator@evmonitor.com | Operator@123 |
| Viewer | viewer@evmonitor.com | Viewer@12345 |

The operator is assigned to the first two stations only, which demonstrates station scoping.
Change these before deploying anywhere real.

## Simulator

The simulator writes readings for every charger on a timer. Each cycle it picks a plausible state
(charging, available, idle), derives voltage, current, power, temperature and energy from the
charger's rating, and with a configurable probability injects a fault: overheating, over-current,
under-voltage, communication loss, or a hardware error. Faults flow through the same path as real
telemetry, so they update health, raise alerts, change charger status and reach the dashboard live.

Control it from **Thresholds** in the sidebar, or through the API:

```bash
curl -X POST http://localhost:3000/api/monitoring/simulator/start \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"intervalMs":5000}'
```

Whenever it is running, every page that shows telemetry displays a banner saying the data is
generated, and each `ChargerTelemetry` document carries `simulated: true`.

## Health score

Six components are each scored 0–1, multiplied by their configured weight, summed and normalised
to 0–100:

| Component | Default weight | Scored on |
| --- | --- | --- |
| Communication | 25 | time since last heartbeat |
| Temperature | 20 | distance past the warning ceiling toward the critical one |
| Voltage | 15 | distance outside the configured band |
| Current | 15 | draw relative to the charger's rating |
| Error status | 15 | error code, weighted by whether it is classed critical |
| Maintenance | 10 | days until (or past) the next scheduled service |

A charger whose heartbeat has stopped is capped at 35 regardless of the other components, because
readings from a charger you cannot reach are not evidence of health.

Bands: 90–100 Healthy · 70–89 Warning · 40–69 Degraded · 0–39 Critical. Thresholds and weights live
in the `SystemConfiguration` document and are editable at `/settings.html`.

## API

All routes except `POST /api/auth/login` and `GET /api/health` require
`Authorization: Bearer <token>`.

**Success**

```json
{ "success": true, "message": "OK", "data": { } }
```

**Failure**

```json
{ "success": false, "message": "Charger not found", "error": "CHARGER_NOT_FOUND" }
```

| Method | Endpoint | Roles |
| --- | --- | --- |
| POST | `/api/auth/login` | public |
| POST | `/api/auth/logout` | any |
| GET | `/api/auth/me` | any |
| PUT | `/api/auth/password` | any |
| GET | `/api/users` | admin |
| POST | `/api/users` | admin |
| PUT | `/api/users/:id` | admin |
| PUT | `/api/users/:id/password` | admin |
| DELETE | `/api/users/:id` | admin |
| GET | `/api/stations` · `/api/stations/:id` | any |
| POST/PUT/DELETE | `/api/stations`, `/api/stations/:id` | admin |
| GET | `/api/chargers` · `/api/chargers/:id` | any |
| POST | `/api/chargers` | admin |
| PUT | `/api/chargers/:id` | admin, operator |
| DELETE | `/api/chargers/:id` | admin |
| GET | `/api/monitoring/overview` · `/map` · `/chargers/:id` · `/stations/:id` · `/config` · `/simulator` | any |
| POST | `/api/monitoring/telemetry` | admin, operator |
| PUT | `/api/monitoring/config` | admin |
| POST | `/api/monitoring/simulator/start` · `/stop` | admin |
| GET | `/api/alerts` | any |
| POST | `/api/alerts` | admin, operator |
| PUT | `/api/alerts/:id/acknowledge` · `/resolve` | admin, operator |
| DELETE | `/api/alerts/:id` | admin |
| GET | `/api/sessions` · `/api/sessions/:id` | any |
| POST | `/api/sessions` | admin, operator |
| PUT | `/api/sessions/:id/stop` | admin, operator |
| GET | `/api/analytics/energy` · `/utilization` · `/faults` · `/stations` | any |
| GET | `/api/maintenance` | any |
| POST | `/api/maintenance` · PUT `/api/maintenance/:id` | admin, operator |
| DELETE | `/api/maintenance/:id` | admin |

Analytics endpoints accept `from`, `to` (ISO dates) and, for energy, `groupBy=day|week|month`.

Posting a reading as hardware would:

```bash
curl -X POST http://localhost:3000/api/monitoring/telemetry \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"chargerId":"STN-HYD-01-C01","voltage":415,"current":120,"power":49.8,"temperature":47,"status":"Charging"}'
```

### Socket.IO events

Clients connect with `io({ auth: { token } })` and receive `charger:update`, `station:update`,
`stats:refresh`, `alert:new`, `alert:updated`, `alert:resolved`, `session:started`, `session:ended`,
`simulator:tick` and `simulator:state`.

## Tests

```bash
npm test
```

Covers authentication and token handling, station and charger CRUD, role authorisation, operator
station scoping, health score calculation and its bands, alert generation and de-duplication,
session start/stop rules and the monitoring overview endpoint. Tests run against
`mongodb-memory-server`, so no local database is touched.

## Project structure

```
ev-charging-monitoring/
├── server.js                 boot, database, sockets, graceful shutdown
├── app.js                    Express app (imported by tests)
├── config/database.js
├── models/                   User, ChargingStation, Charger, ChargerTelemetry,
│                             Alert, ChargingSession, Maintenance, SystemConfiguration
├── controllers/              auth, user, station, charger, monitoring, alert,
│                             session, analytics, maintenance
├── routes/                   one router per controller
├── middleware/               auth, role, validation, error
├── services/                 healthMonitoring, alert, telemetry, simulator
├── sockets/monitoringSocket.js
├── utils/                    healthCalculator, apiResponse, logger
├── seed/seed.js
├── tests/
└── public/                   dashboard, stations, chargers, charger, alerts,
                              sessions, analytics, maintenance, users, settings
                              + css/style.css and js/
```

## Logging

`utils/logger.js` writes levelled lines for sign-in attempts, charger status changes, fault
detection, alert generation, station and user changes, simulator lifecycle and 5xx errors. Values
under keys like `password`, `token` or `secret` are redacted before anything is written, and 5xx
responses return a generic message so internal details never reach a client.

## Future enhancements

- OCPP 1.6J / 2.0.1 adapter so real chargers can connect without a translation layer
- Email, SMS or webhook escalation for critical alerts
- Predictive maintenance from temperature and fault trends
- Multi-tenant operator accounts with per-site billing
- CSV and PDF export for analytics
- Refresh tokens with rotation, plus optional single sign-on
