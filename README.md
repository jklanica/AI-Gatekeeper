# AI-Gatekeeper — AI Usage Tracker
### MVP Project Documentation

---

## What This Is

A self-hosted tool to track AI API usage across projects and team members. You deploy it on your own servers, point your AI tools at its proxy endpoint, and it records every request so you can see who used what and how much it cost.

The real purpose of this project is to learn Docker, Kubernetes, and related infrastructure tooling. The application itself is intentionally minimal — just enough to be a useful showcase.

---

## Architecture Overview

Three services, nothing more:

```
Developer's tool (Cursor, VS Code, CLI)
        │
        │  API call with AI-Gatekeeper key
        ▼
┌───────────────┐     enqueue event      ┌─────────────┐
│  Proxy        │ ─────────────────────► │  PostgreSQL  │
│  (Node/Express│                         │             │
│   port 3001)  │ ◄── key lookup ──────── │             │
└───────────────┘                         └─────────────┘
                                                ▲
┌───────────────┐                               │
│  Web App      │ ──── tRPC queries ────────────┘
│  (Next.js     │
│   port 3000)  │
└───────────────┘
        │
        ▼
   upstream AI providers
   (api.openai.com, etc.)
```

**Web App** — Next.js with tRPC. Serves the UI and handles all business logic (auth, project management, analytics queries).

**Proxy** — Standalone Express server. Sits between the developer's tool and the upstream AI provider. Authenticates the request, logs the usage event to Postgres, and forwards to the real API.

**PostgreSQL** — Single database for everything. No TimescaleDB, no Redis, no queue. Usage events are just rows in a table.

---

## Tech Stack

| | Choice |
|---|---|
| Frontend | Next.js, React, Tailwind, shadcn/ui |
| API | tRPC v11, Zod |
| ORM | Drizzle ORM |
| Database | PostgreSQL 16 |
| Proxy | Express + http-proxy-middleware |
| Auth | JWT (jose), HTTP-only cookies |
| Containers | Docker, Docker Compose |
| Orchestration | Kubernetes (the main learning goal) |
| Monorepo | pnpm workspaces + Turborepo |
| Language | TypeScript throughout |

---

## Monorepo Layout

```
prism/
├── apps/
│   ├── web/               # Next.js app (UI + tRPC server)
│   └── proxy/             # Standalone proxy service
├── packages/
│   ├── db/                # Drizzle schema + migrations + db client
│   └── types/             # Shared Zod schemas
├── k8s/                   # Kubernetes manifests
│   ├── namespace.yaml
│   ├── web/
│   ├── proxy/
│   ├── postgres/
│   └── ingress.yaml
├── docker-compose.yml
├── docker-compose.prod.yml
└── turbo.json
```

---

## Database Schema

Five tables. That's it.

```sql
-- Users
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  display_name  TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Projects
CREATE TABLE projects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  created_by  UUID NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Project membership + roles
-- role: 'owner' | 'member'
-- Owners can manage members and settings. Members can view stats and get their virtual API key.
CREATE TABLE project_members (
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  tags        TEXT[] NOT NULL DEFAULT '{}',  -- e.g. ['backend', 'squad-payments']
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (project_id, user_id)
);

-- API keys (one per user per project, or a shared project key)
CREATE TABLE api_keys (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,  -- NULL = shared key
  name        TEXT NOT NULL,          -- e.g. "Cursor on MBP"
  key_hash    TEXT NOT NULL UNIQUE,
  key_prefix  TEXT NOT NULL,          -- first 8 chars for display (e.g. gk_abc12345)
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Every proxied AI API call becomes one row here
CREATE TABLE usage_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES projects(id),
  user_id         UUID REFERENCES users(id),  -- NULL if shared key
  api_key_id      UUID NOT NULL REFERENCES api_keys(id),
  model           TEXT NOT NULL,          -- e.g. "gpt-4o"
  provider        TEXT NOT NULL,          -- e.g. "openai"
  input_tokens    INTEGER NOT NULL DEFAULT 0,
  output_tokens   INTEGER NOT NULL DEFAULT 0,
  cost_usd        NUMERIC(10, 6),         -- estimated from hardcoded pricing table
  latency_ms      INTEGER,
  http_status     SMALLINT,
  user_tags       TEXT[] NOT NULL DEFAULT '{}',  -- snapshot of tags at time of request
  timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON usage_events (project_id, timestamp DESC);
CREATE INDEX ON usage_events (user_id, timestamp DESC);
```

**Tags** are a simple string array on `project_members` (e.g., `['backend', 'senior']`). When a usage event is created, the user's current tags are snapshotted into `user_tags` on the event row so historical reports stay accurate even after tags change.

**Pricing** is a hardcoded TypeScript constant in `packages/types/src/pricing.ts`, not a DB table. Adding a new model means editing that file. Fine for MVP.

---

## tRPC API

### Auth
```
auth.register   mutation — email, password, displayName → creates account
auth.login      mutation — email, password → sets refresh cookie, returns access token
auth.logout     mutation — revokes refresh token
auth.me         query    — returns current user
```

### Projects
```
projects.list   query    — projects the current user belongs to
projects.get    query    — single project (must be a member)
projects.create mutation — creates project, caller becomes owner
projects.delete mutation — owner only
```

### Members
```
members.list         query    — members of a project with their tags (owner/member can view)
members.add          mutation — owner only; adds an existing user by email
members.remove       mutation — owner only
members.updateTags   mutation — owner only; replaces a member's tags array
```

### API Keys
```
apiKeys.list    query    — keys for a project (user sees own; owner sees all)
apiKeys.create  mutation — generates a key, returns raw value ONCE
apiKeys.revoke  mutation — marks key as revoked
```

### Analytics
```
analytics.summary    query — total requests, tokens, cost for a project over a date range
analytics.byUser     query — same but broken down per user (owner only for full breakdown)
analytics.byModel    query — usage grouped by model
analytics.byTag      query — usage grouped by tag value
analytics.timeline   query — daily totals for charting, over a date range
```

### Integrations
```
integrations.getConfig  query — returns pre-filled config snippet for a given tool
                                 tool: 'vscode' | 'cursor' | 'shell' | 'python' | 'node'
```

---

## Proxy Service

### How It Works

The proxy is the core of the whole project. A developer configures their AI tool to point at `http://your-gatekeeper-host/proxy/v1` instead of `https://api.openai.com/v1` and uses a virtual API key instead of their real OpenAI key. The proxy:

1. Reads the `Authorization: Bearer prism_xxxxx` header.
2. Looks up the key in Postgres → gets `projectId` and `userId`.
3. Forwards the full request to the real upstream provider, injecting the real API key.
4. Pipes the response back to the client (streaming supported).
5. After the response completes, writes a `usage_events` row with token counts and cost.

The proxy is **OpenAI-API-compatible** only for MVP. Any tool that supports a custom base URL works: Cursor, Continue, Cline, OpenAI SDK, LiteLLM, etc.

### Proxy Middleware Chain

```
1. extractKey        reads Bearer token from Authorization header
2. resolveKey        queries Postgres for key → project + user (with a simple in-memory
                     LRU cache of ~500 entries, 60s TTL, to avoid a DB hit per request)
3. rejectRevoked     returns 401 if key is not found or is revoked
4. forwardRequest    http-proxy-middleware → streams to api.openai.com with real key
5. logUsage          on stream end: reads token usage from response body, writes to DB
                     this is fire-and-forget (non-blocking) — errors are logged but
                     do not affect the response the developer receives
```

### Proxy Endpoints

The proxy exposes two endpoints. Both require `Authorization: Bearer gk_xxxxx`.

| Endpoint | Method | Description |
|---|---|---|
| `/v1/chat/completions` | POST | Main proxy. Validates virtual key, forwards to OpenAI, streams response, logs usage event. |
| `/v1/models` | GET | Returns a mocked model list. Required because IDEs (Cursor, Continue) call this on startup to populate the model picker dropdown. Without it, many tools silently fail or show an empty model list. |

The `/v1/models` response doesn't hit OpenAI — it returns a hardcoded list from the same `MODEL_PRICING` constant used for cost estimation, so the two are always in sync:

```typescript
// proxy/src/routes/models.ts
import { MODEL_PRICING } from '@ai-gatekeeper/types';

app.get('/v1/models', requireVirtualKey, (req, res) => {
  res.json({
    object: 'list',
    data: Object.keys(MODEL_PRICING).map(id => ({
      id,
      object: 'model',
      created: Math.floor(Date.now() / 1000),
      owned_by: 'openai',
    })),
  });
});
```

### Token Counting

Read directly from the OpenAI response JSON:
```
usage.prompt_tokens       → input_tokens
usage.completion_tokens   → output_tokens
```
For streaming responses, the final `data: [DONE]` chunk is buffered briefly to capture the usage object. The rest streams through untouched.

### Cost Estimation

```typescript
// packages/types/src/pricing.ts
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o':            { input: 2.50,  output: 10.00 }, // per million tokens
  'gpt-4o-mini':       { input: 0.15,  output: 0.60  },
  'gpt-4-turbo':       { input: 10.00, output: 30.00 },
  'o1':                { input: 15.00, output: 60.00 },
  'o1-mini':           { input: 3.00,  output: 12.00 },
};

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return 0;
  return (inputTokens / 1_000_000) * pricing.input
       + (outputTokens / 1_000_000) * pricing.output;
}
```

---

## Frontend — Pages

Minimal. You already know how to build this part.

```
/login                  Email + password form
/register               Same + display name

/dashboard              Cards for each project the user belongs to.
                        Each card shows project name, member count, total
                        tokens this month, estimated cost this month.

/projects/new           Create project form (name + description)

/projects/[id]          Main project page — tabs:
  Overview tab          Summary cards + token/cost timeline chart (last 30 days)
                        Bar chart of usage by model
  Members tab           Table: name, tags, role, usage this month
                        Owner can add/remove members, edit tags
  Virtual API Keys tab          Table of keys with prefix, name, created, last used
                        "Create key" button → shows raw key once in a modal
  Setup tab             Dropdown to pick tool → shows pre-filled config snippet
                        with copy button

/account                Display name update, password change
```

That's 6 routes. The Setup tab is basically a fancy code block — most of the value, least effort.

---

## Setup Guide Content (the Setup Tab)

When a user opens the Setup tab and picks their tool, AI-Gatekeeper renders a short guide with their personal virtual API key and the proxy URL pre-filled. Examples:

### VS Code (Continue extension)
```json
// .continue/config.json
{
  "models": [{
    "title": "GPT-4o (AI-Gatekeeper)",
    "provider": "openai",
    "model": "gpt-4o",
    "apiBase": "https://prism.yourcompany.com/proxy/v1",
    "apiKey": "gk_abc12345"
  }]
}
```

### Cursor
Go to Settings → Models → Override OpenAI base URL:
- Base URL: `https://prism.yourcompany.com/proxy/v1`
- API Key: `gk_abc12345`

### Shell (global default)
```bash
export OPENAI_API_KEY="gk_abc12345"
export OPENAI_BASE_URL="https://prism.yourcompany.com/proxy/v1"
```

### Python
```python
import openai
client = openai.OpenAI(
    api_key="gk_abc12345",
    base_url="https://prism.yourcompany.com/proxy/v1"
)
```

### Node.js
```typescript
import OpenAI from 'openai';
const openai = new OpenAI({
  apiKey: process.env.GATEKEEPER_KEY,
  baseURL: "https://prism.yourcompany.com/proxy/v1"
});
```

The proxy URL and key are injected server-side by `integrations.getConfig` before sending to the client.

---

## Docker Setup

### docker-compose.yml (development)

```yaml
version: '3.9'

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: prism
      POSTGRES_PASSWORD: prism
      POSTGRES_DB: prism
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U prism"]
      interval: 5s
      timeout: 5s
      retries: 5

  web:
    build:
      context: .
      dockerfile: docker/web.Dockerfile
      target: dev
    environment:
      DATABASE_URL: postgresql://prism:prism@postgres:5432/prism
      GK_SECRET: dev-secret-change-in-prod
      NEXT_PUBLIC_APP_URL: http://localhost:3000
      PROXY_URL: http://proxy:3001
    ports:
      - "3000:3000"
    volumes:
      - ./apps/web:/app/apps/web     # hot reload
      - ./packages:/app/packages
    depends_on:
      postgres:
        condition: service_healthy

  proxy:
    build:
      context: .
      dockerfile: docker/proxy.Dockerfile
      target: dev
    environment:
      DATABASE_URL: postgresql://prism:prism@postgres:5432/prism
      PROXY_PORT: 3001
      # The actual OpenAI key goes here — or per-project in the DB
      OPENAI_API_KEY: ${OPENAI_API_KEY}
    ports:
      - "3001:3001"
    volumes:
      - ./apps/proxy:/app/apps/proxy
      - ./packages:/app/packages
    depends_on:
      postgres:
        condition: service_healthy

volumes:
  postgres_data:
```

### docker/web.Dockerfile

```dockerfile
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# ── dev target ──────────────────────────────────────────────────
FROM base AS dev
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/db/package.json ./packages/db/
COPY packages/types/package.json ./packages/types/
RUN pnpm install --frozen-lockfile
COPY . .
CMD ["pnpm", "--filter", "web", "dev"]

# ── build target ─────────────────────────────────────────────────
FROM base AS build
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/db/package.json ./packages/db/
COPY packages/types/package.json ./packages/types/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm turbo build --filter=web

# ── runner (production image) ─────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Next.js standalone output
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
```

### docker/proxy.Dockerfile

```dockerfile
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

FROM base AS dev
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./
COPY apps/proxy/package.json ./apps/proxy/
COPY packages/db/package.json ./packages/db/
COPY packages/types/package.json ./packages/types/
RUN pnpm install --frozen-lockfile
COPY . .
CMD ["pnpm", "--filter", "proxy", "dev"]

FROM base AS build
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./
COPY apps/proxy/package.json ./apps/proxy/
COPY packages/db/package.json ./packages/db/
COPY packages/types/package.json ./packages/types/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm turbo build --filter=proxy

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/apps/proxy/dist ./dist
COPY --from=build /app/apps/proxy/package.json ./
COPY --from=build /app/node_modules ./node_modules
EXPOSE 3001
CMD ["node", "dist/index.js"]
```

**Key Dockerfile concepts demonstrated here:**
- Multi-stage builds (dev, build, runner stages)
- Monorepo-aware layer caching (copy only `package.json` files first, then source)
- Minimal production images (Alpine, only built output)
- Next.js standalone output mode
- Non-root user (add `USER node` before CMD in runner stage)

---

## Kubernetes Setup

This is the main learning surface of the project. The `k8s/` directory contains raw manifests (no Helm for MVP — Helm is a later exercise).

### Directory structure

```
k8s/
├── namespace.yaml
├── postgres/
│   ├── secret.yaml          # DB credentials
│   ├── pvc.yaml             # PersistentVolumeClaim for data
│   ├── deployment.yaml
│   └── service.yaml
├── web/
│   ├── configmap.yaml       # non-secret env vars
│   ├── secret.yaml          # GK_SECRET
│   ├── deployment.yaml
│   ├── service.yaml
│   └── hpa.yaml             # HorizontalPodAutoscaler
├── proxy/
│   ├── configmap.yaml
│   ├── secret.yaml          # OPENAI_API_KEY
│   ├── deployment.yaml
│   ├── service.yaml
│   └── hpa.yaml
└── ingress.yaml
```

### namespace.yaml

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: prism
```

### postgres/pvc.yaml

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: postgres-pvc
  namespace: prism
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 10Gi
```

### postgres/deployment.yaml

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: postgres
  namespace: prism
spec:
  replicas: 1       # Postgres is stateful — single replica with a PVC
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
        - name: postgres
          image: postgres:16-alpine
          ports:
            - containerPort: 5432
          env:
            - name: POSTGRES_USER
              valueFrom:
                secretKeyRef:
                  name: postgres-secret
                  key: POSTGRES_USER
            - name: POSTGRES_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: postgres-secret
                  key: POSTGRES_PASSWORD
            - name: POSTGRES_DB
              value: prism
          volumeMounts:
            - name: postgres-storage
              mountPath: /var/lib/postgresql/data
          readinessProbe:
            exec:
              command: ["pg_isready", "-U", "prism"]
            initialDelaySeconds: 5
            periodSeconds: 5
          resources:
            requests:
              cpu: 100m
              memory: 256Mi
            limits:
              cpu: 500m
              memory: 512Mi
      volumes:
        - name: postgres-storage
          persistentVolumeClaim:
            claimName: postgres-pvc
```

### web/deployment.yaml

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  namespace: prism
spec:
  replicas: 2
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
        - name: web
          image: ghcr.io/your-username/ai-gatekeeper-web:latest
          ports:
            - containerPort: 3000
          envFrom:
            - configMapRef:
                name: web-config
            - secretRef:
                name: web-secret
          readinessProbe:
            httpGet:
              path: /api/healthz
              port: 3000
            initialDelaySeconds: 10
            periodSeconds: 5
          livenessProbe:
            httpGet:
              path: /api/healthz
              port: 3000
            initialDelaySeconds: 30
            periodSeconds: 15
          resources:
            requests:
              cpu: 100m
              memory: 256Mi
            limits:
              cpu: 500m
              memory: 512Mi
```

### proxy/hpa.yaml

```yaml
# The proxy is the hot path — it handles every AI call. HPA scales it on CPU.
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: proxy-hpa
  namespace: prism
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: proxy
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 60
```

### ingress.yaml

```yaml
# Requires nginx ingress controller installed in cluster
# Both services share one domain — /proxy/* goes to the proxy, everything else to web
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: prism-ingress
  namespace: prism
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /$2
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - prism.yourdomain.com
      secretName: prism-tls
  rules:
    - host: prism.yourdomain.com
      http:
        paths:
          - path: /proxy(/|$)(.*)
            pathType: ImplementationSpecific
            backend:
              service:
                name: proxy
                port:
                  number: 3001
          - path: /
            pathType: Prefix
            backend:
              service:
                name: web
                port:
                  number: 3000
```

### Applying Everything

```bash
# One-time cluster setup (install nginx ingress + cert-manager)
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/cloud/deploy.yaml
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.14.0/cert-manager.yaml

# Deploy AI-Gatekeeper
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/postgres/
kubectl apply -f k8s/web/
kubectl apply -f k8s/proxy/
kubectl apply -f k8s/ingress.yaml

# Run DB migrations (one-off Job)
kubectl create job db-migrate --image=ghcr.io/your-username/ai-gatekeeper-web:latest \
  --namespace=prism -- node migrate.js

# Check status
kubectl get pods -n prism
kubectl get ingress -n prism
```

### K8s Concepts This Project Covers

| Concept | Where |
|---|---|
| Deployments | web, proxy, postgres |
| Services (ClusterIP) | All three services — internal DNS |
| PersistentVolumeClaim | Postgres data persistence |
| ConfigMaps | Non-secret env vars per service |
| Secrets | DB password, GK_SECRET, OpenAI key |
| Ingress | Path-based routing to two services on one domain |
| HPA | Auto-scaling proxy replicas on CPU |
| Health probes | Liveness + readiness on web and proxy |
| Resource limits | Requests/limits on all containers |
| Jobs | One-off DB migration |
| Namespaces | Isolation under `prism` namespace |

---

## Environment Variables

```bash
# web service
DATABASE_URL=postgresql://user:pass@postgres:5432/prism
GK_SECRET=<32 random bytes hex>          # JWT signing + API key hashing
NEXT_PUBLIC_APP_URL=https://prism.example.com
PROXY_BASE_URL=https://prism.example.com/proxy/v1   # shown in setup guides

# proxy service
DATABASE_URL=postgresql://user:pass@postgres:5432/prism
PROXY_PORT=3001
OPENAI_API_KEY=sk-...                        # real OpenAI key, used server-side
UPSTREAM_BASE_URL=https://api.openai.com/v1  # override for Azure or local LLM
```

---

## CI/CD (GitHub Actions)

`.github/workflows/deploy.yml` — triggers on push to `main`:

```yaml
jobs:
  build-and-push:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - name: Build and push web
        uses: docker/build-push-action@v5
        with:
          context: .
          file: docker/web.Dockerfile
          target: runner
          push: true
          tags: ghcr.io/${{ github.repository }}/web:${{ github.sha }}
      - name: Build and push proxy
        uses: docker/build-push-action@v5
        with:
          context: .
          file: docker/proxy.Dockerfile
          target: runner
          push: true
          tags: ghcr.io/${{ github.repository }}/proxy:${{ github.sha }}

  deploy:
    needs: build-and-push
    runs-on: ubuntu-latest
    steps:
      - name: Update image tags in K8s manifests and apply
        run: |
          sed -i "s|:latest|:${{ github.sha }}|g" k8s/web/deployment.yaml
          sed -i "s|:latest|:${{ github.sha }}|g" k8s/proxy/deployment.yaml
          kubectl apply -f k8s/
        env:
          KUBECONFIG: ${{ secrets.KUBECONFIG }}
```

---

## What's Deliberately Left Out

These are things that would matter in production but are out of scope for an MVP learning project:

- **Redis** — API key cache uses an in-process LRU map instead. Fine for MVP.
- **Rate limiting** — not implemented.
- **Budget enforcement** — stats are displayed but requests are never blocked.
- **Multiple upstream providers** — OpenAI-compatible only. Anthropic, Azure, Ollama can be added later.
- **Email** — no invite emails, no password reset email. Users are added by an owner entering their email (they must already have an account).
- **SSO / SAML** — not applicable.
- **TimescaleDB / continuous aggregates** — plain Postgres with indexes is fast enough for any realistic MVP dataset.
- **Helm chart** — raw manifests are better for learning. Helm is a natural next step after you understand what it abstracts.