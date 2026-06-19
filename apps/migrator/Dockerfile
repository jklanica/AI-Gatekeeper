# ==========================================
# Stage 1: Base
# ==========================================
FROM node:20-alpine AS base
RUN apk update && apk add --no-cache libc6-compat
ENV TURBO_TELEMETRY_DISABLED=1
RUN npm install -g pnpm

# ==========================================
# Stage 2: Pruner
# ==========================================
FROM base AS builder
WORKDIR /app
RUN npm install -g turbo
# Copy the entire workspace
COPY . .
# Extract only the db package and its dependencies
RUN turbo prune @ai-gatekeeper/db --docker

# ==========================================
# Stage 3: Runner
# ==========================================
FROM base AS runner
WORKDIR /app

# Copy pruned package.json files
COPY --from=builder /app/out/json/ .
# Install dependencies with caching
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile

# Copy actual source code
COPY --from=builder /app/out/full/ .

# Security: Create a non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 migrator
USER migrator

# Command to run Drizzle-Kit push for the db package
CMD ["pnpm", "turbo", "run", "db:push", "--filter=@ai-gatekeeper/db"]
