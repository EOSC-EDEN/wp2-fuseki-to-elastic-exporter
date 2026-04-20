# EDEN Fuseki-to-Elastic Exporter

Syncs RDF data from Apache Jena Fuseki to Elasticsearch. A thin proxy in front of Fuseki publishes write events to Redis for real-time sync, while a periodic reconciliation job catches missed events and deletions. Falls back to a full blue-green reindex when state is unrecoverable. Part of the EDEN WP2 project.

Note: the startup of the project includes **_NO_** dummy data you will have to ingest that yourself into fuseki.

## Architecture

![Architecture](docs/architecture.png)

**How it works:**

1. The harvester writes graphs to Fuseki via HTTP (Graph Store Protocol)
2. A thin GSP proxy sits in front of Fuseki, forwards all requests, and publishes events to Redis when harmonized graphs are written or deleted
3. The exporter subscribes to those events and enqueues sync/delete jobs in a Bull queue for real-time updates
4. Each job fetches the affected graph, flattens it, and updates Elasticsearch (diffing document IDs against the registry)
5. Every 10 minutes a reconciliation job compares Fuseki's graph list against the registry — using content hashes — to catch missed events, manual changes, and deletions
6. If the active index is missing or reconciliation fails, an automatic full reindex is triggered (blue/green swap, zero downtime)

## Stack

| Service        | Image                    | Role                                  |
| -------------- | ------------------------ | ------------------------------------- |
| Fuseki backend | `secoresearch/fuseki`    | SPARQL triplestore (source of truth)  |
| Fuseki proxy   | (built locally)          | GSP proxy that publishes write events |
| Elasticsearch  | `elasticsearch:9.3.0`    | Search index (target)                 |
| PostgreSQL     | `postgres:17`            | Sync state + graph registry           |
| Redis          | `redis:7`                | Pub/sub events + Bull queue           |
| App            | `dansknaw/eden-exporter` | This application                      |
| Harvester      | `dansknaw/eden-harvester`| Writes RDF data into Fuseki           |

## Getting Started

To run the application locally you can do the following:

```bash
# start the entire stack including the app container
make start

# stop everything
make stop
```

The `app` service's `docker-compose.yml` environment block overrides all localhost URLs with Docker network hostnames automatically.

### Local development setup

Prerequisites: Docker, pnpm.

```bash
# first-time setup (copies .env.example to .env, installs deps)
make setup

# start infrastructure (fuseki, elasticsearch, postgres, redis) + run migrations
make start:dev

# start the app in watch mode
pnpm run start:dev
```

The app runs on `http://localhost:3000`.

## API

| Method | Route                     | Auth         | Description                 |
| ------ | ------------------------- | ------------ | --------------------------- |
| `GET`  | `/api`                    | -            | Health check                |
| `POST` | `/api/:index/_search`     | -            | Elasticsearch search proxy  |
| `GET`  | `/api/:index/_source/:id` | -            | Get document source by ID   |
| `GET`  | `/api/export`             | Bearer token | Trigger manual full reindex |

### Examples

```bash
# search
curl -X POST http://localhost:3000/api/eden/_search \
  -H "Content-Type: application/json" \
  -d '{"query": {"match_all": {}}, "size": 10}'

# get document by id
curl http://localhost:3000/api/eden/_source/https%3A%2F%2Fdata.4tu.nl%2F

# trigger manual full reindex (requires AUTH_API_TOKEN)
curl -H "Authorization: Bearer $AUTH_API_TOKEN" http://localhost:3000/api/export
```

## Configuration

All environment variables are documented in `.env.example`. The main groups:

- **Core**
- **Fuseki**
- **Elasticsearch**
- **PostgreSQL**
- **Redis**
- **Auth**

## Development

```bash
pnpm run test                    # run all tests
npx jest /path/to/file.spec.ts   # run a single test
pnpm run lint                    # eslint with auto-fix
pnpm run format                  # prettier
npx tsc --noEmit                 # typecheck
make migrate                     # run prisma migrations
```
