# ==========================================
# Stage 1: Base
# ==========================================
FROM node:20-alpine AS base
# Install libc6-compat for Turborepo and Next.js SWC dependencies
RUN apk update && apk add --no-cache libc6-compat
# Disable Next.js and Turborepo telemetry for privacy and performance
ENV NEXT_TELEMETRY_DISABLED=1
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
# Extract only the web app and its dependencies
RUN turbo prune @ai-gatekeeper/web --docker

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

# Provide build-time environment variables
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL

# Build the web application
RUN pnpm turbo run build --filter=@ai-gatekeeper/web

# ==========================================
# Stage 4: Runner
# ==========================================
FROM base AS runner
WORKDIR /app

# Set production environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Security: Create a non-root user to run the application
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Pre-create the prerender cache directory and set ownership to prevent runtime crashes
RUN mkdir .next
RUN chown nextjs:nodejs .next

USER nextjs

# Copy static assets (images, fonts, etc.)
COPY --from=installer --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

# Copy the standalone Next.js server (contains only the necessary production files)
COPY --from=installer --chown=nextjs:nodejs /app/apps/web/.next/standalone ./

# Copy the compiled React application bundles
COPY --from=installer --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

EXPOSE 3000

# Start the optimized standalone server
CMD ["node", "apps/web/server.js"]
