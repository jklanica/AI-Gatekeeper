# ==========================================
# Stage 1: Base
# ==========================================
FROM node:20-alpine AS base
# Install libc6-compat for Turborepo native dependencies
RUN apk update && apk add --no-cache libc6-compat
# Disable Turborepo telemetry for privacy
ENV TURBO_TELEMETRY_DISABLED=1
# Install pnpm globally in the base image so all stages can use it
RUN npm install -g pnpm

# ==========================================
# Stage 2: Pruner
# ==========================================
FROM base AS builder
WORKDIR /app
RUN npm install -g turbo
# Copy the entire workspace
COPY . .
# Extract only the proxy app and its dependencies
RUN turbo prune @ai-gatekeeper/proxy --docker

# ==========================================
# Stage 3: Installer
# ==========================================
FROM base AS installer
WORKDIR /app

# Copy pruned package.json files
COPY --from=builder /app/out/json/ .
# Install dependencies with Docker caching to dramatically speed up rebuilds
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile

# Copy actual source code
COPY --from=builder /app/out/full/ .

# Build the proxy application (compiles TypeScript to JavaScript)
RUN pnpm turbo run build --filter=@ai-gatekeeper/proxy

# ==========================================
# Stage 4: Runner
# ==========================================
FROM base AS runner
WORKDIR /app

# Set production environment variables
ENV NODE_ENV=production
ENV PORT=3001

# Security: Create a non-root user to run the application
RUN addgroup --system --gid 1001 expressjs
RUN adduser --system --uid 1001 expressjs
USER expressjs

# Copy the built application and its production dependencies
COPY --from=installer --chown=expressjs:expressjs /app/ .

EXPOSE 3001

# Start the Express server
CMD ["node", "apps/proxy/dist/index.js"]
