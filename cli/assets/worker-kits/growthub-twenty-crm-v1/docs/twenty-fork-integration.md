# Twenty Fork Integration — Developer Notes

**Kit:** `growthub-twenty-crm-v1`  
**Repo:** `github.com/twentyhq/twenty`  
**Stack:** TypeScript / React / NestJS / PostgreSQL / Redis

---

## OVERVIEW

Twenty is a fully open-source CRM built to replace Salesforce and Apollo-style tools for teams that want control over their data and growth stack. It ships with a REST and GraphQL API, a workflow engine, custom object support, and a CLI. This document defines how this kit targets the Twenty fork for local development and self-hosted deployments.

---

## REPOSITORY STRUCTURE (KEY PATHS)

```text
twenty/
├── packages/
│   ├── twenty-server/          # NestJS API server
│   │   ├── src/
│   │   │   ├── modules/        # CRM domain modules (Person, Company, Opportunity, etc.)
│   │   │   ├── metadata/       # Custom object and field metadata API
│   │   │   ├── api/            # REST and GraphQL endpoint handlers
│   │   │   └── workflow/       # Workflow engine (triggers, actions)
│   ├── twenty-front/           # React frontend (Vite)
│   │   ├── src/
│   │   │   ├── modules/        # UI modules per CRM object
│   │   │   └── pages/          # Page definitions
│   └── twenty-cli/             # CLI package (@twenty-crm/cli)
│       └── src/                # CLI commands (workspace management, etc.)
├── docker-compose.yml          # Local development stack
├── .env.example                # Server environment template
└── README.md
```

---

## STANDARD OBJECT MODULES

Each standard CRM object lives in `packages/twenty-server/src/modules/<object>/`:

| Object module | Key files |
|---|---|
| `person` | `person.entity.ts`, `person.repository.ts`, `person.resolver.ts` |
| `company` | `company.entity.ts`, `company.repository.ts`, `company.resolver.ts` |
| `opportunity` | `opportunity.entity.ts`, `opportunity.resolver.ts` |
| `note` | `note.entity.ts`, `note.resolver.ts` |
| `task` | `task.entity.ts`, `task.resolver.ts` |

**Inspecting standard object fields:** Read the entity file (e.g. `person.entity.ts`) to confirm which fields are available, their types, and which are required.

---

## METADATA API (CUSTOM OBJECTS)

Custom objects and fields are managed via the metadata API at `/metadata`.

### Creating a custom object

```graphql
POST <TWENTY_API_URL>/metadata
Authorization: Bearer <token>

mutation CreateObject {
  createOneObject(input: {
    labelSingular: "Partner Account"
    labelPlural: "Partner Accounts"
    nameSingular: "partnerAccount"
    namePlural: "partnerAccounts"
    icon: "IconBuilding"
    description: "Tracks partner organizations separately from customers"
  }) {
    id
    nameSingular
    isActive
  }
}
```

### Adding a field to a custom object

```graphql
mutation CreateTextField {
  createOneField(input: {
    objectMetadataId: "<object-id>"
    type: TEXT
    name: "partnerTier"
    label: "Partner Tier"
    isNullable: true
    defaultValue: null
  }) {
    id
    name
    type
  }
}
```

### Activating a custom object

After creation, activate via the UI (Settings > Objects > toggle Active) or via API:

```graphql
mutation ActivateObject {
  activateWorkspaceObject(input: { id: "<object-id>" }) {
    id
    isActive
  }
}
```

---

## WORKFLOW ENGINE

Twenty's workflow engine is in `packages/twenty-server/src/workflow/`.

### Trigger types (frozen assumptions, verify in fork)

| Trigger | Description |
|---|---|
| `RECORD_CREATED` | Fires when a record of the target object is created |
| `RECORD_UPDATED` | Fires when a record is updated |
| `MANUAL` | Manually triggered by a user |
| `CRON` | Time-based schedule |

### Action types (frozen assumptions, verify in fork)

| Action | Description |
|---|---|
| `SEND_EMAIL` | Send an email |
| `CREATE_RECORD` | Create a CRM record |
| `UPDATE_RECORD` | Update a CRM record |
| `DELETE_RECORD` | Delete a CRM record |
| `CODE` | Execute a custom code action (TypeScript function) |
| `FILTER` | Condition filter (branch logic) |
| `SEND_HTTP_REQUEST` | Outbound HTTP POST (webhook action) |

**Recommendation for custom automation logic:** Use the `CODE` action type for complex conditional logic that the standard action types do not support. The CODE action executes a TypeScript function in a sandboxed environment.

---

## LOCAL DEVELOPMENT STACK

### Prerequisites

- Docker and Docker Compose
- Node.js 18+
- Git

### Boot sequence

```bash
git clone https://github.com/twentyhq/twenty ~/twenty
cd ~/twenty
cp .env.example .env
docker-compose up -d
```

Services started:
- `twenty-server` — NestJS API at `http://localhost:3000`
- `twenty-front` — React frontend at `http://localhost:3001`
- `postgres` — PostgreSQL at `localhost:5432`
- `redis` — Redis at `localhost:6379`

### Running migrations

```bash
npx nx run twenty-server:database:migrate
```

### Seeding the database

```bash
npx nx run twenty-server:database:seed
```

### Accessing the GraphQL playground

Navigate to `http://localhost:3000/graphql` in the browser. The playground requires an active Bearer token.

---

## KNOWN FORK CONSIDERATIONS

### Environment variables (`.env`)

The Twenty server requires several environment variables. Key ones:

| Variable | Purpose |
|---|---|
| `PG_DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `SERVER_URL` | Public API URL (used for webhooks) |
| `FRONT_BASE_URL` | Frontend URL |
| `SIGN_IN_PREFILLED` | Pre-fill sign-in for local dev |
| `STORAGE_TYPE` | `local` (dev) or `s3` (production) |

### First-time workspace setup

After booting Docker Compose, navigate to `http://localhost:3001` and create your first workspace. The default seeded admin credentials (if seeded) are in the Twenty README.

### CLI

The Twenty CLI (`@twenty-crm/cli`) provides workspace management commands:

```bash
npx twenty workspace:create --name "My Workspace"
npx twenty workspace:list
```

Run `npx twenty --help` for the full command surface.
