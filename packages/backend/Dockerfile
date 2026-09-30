# @interview-coach/backend - production image (HLD Phase 8, S8b).
#
# Runtime is tsx-on-source (the repo has no emit step: packages export TS via
# ./src/index.ts and run under tsx locally too). tsx is therefore a runtime
# dependency, installed with --prod. Compiled emit is a possible follow-up;
# it would need composite tsconfigs across domain/db/backend first.
# Boot migrates (idempotent) then serves; seed the catalog explicitly:
#   docker compose run --rm backend pnpm --filter @interview-coach/db db:seed
# Build from the repo root:
#   docker build -f packages/backend/Dockerfile .

FROM node:24-slim

RUN npm install -g pnpm@12.3.4 && \
    useradd --create-home --shell /bin/bash app

# Feature 16: Docker CLI so the sandbox runner can drive per-run
# containers. Static binary only (no daemon in this image); the daemon
# comes from the host via the compose socket mount.
ARG DOCKER_VERSION=29.1.3
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && \
    curl -fsSL "https://download.docker.com/linux/static/stable/x86_64/docker-${DOCKER_VERSION}.tgz" -o /tmp/docker.tgz && \
    tar -xzf /tmp/docker.tgz -C /tmp && mv /tmp/docker/docker /usr/local/bin/docker && \
    rm -rf /tmp/docker.tgz /tmp/docker && \
    apt-get purge -y curl && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Workspace scaffolding first for a cached dependency layer.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/domain/package.json packages/domain/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/backend/package.json packages/backend/package.json
RUN pnpm install --prod --frozen-lockfile

# Runtime sources: backend + linked workspaces and migrations. The seed JSONs
# (raw_content/, content/) are gitignored and live outside the image: seed
# from a host checkout that has them with DATABASE_URL pointed at the stack DB:
#   pnpm --filter @interview-coach/db db:seed
COPY packages/domain/src packages/domain/src
COPY packages/db/src packages/db/src
COPY packages/db/drizzle packages/db/drizzle
COPY packages/backend/src packages/backend/src
RUN chown -R app:app /app
USER app

ENV HOST=0.0.0.0 \
    PORT=3000 \
    NODE_ENV=production
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=25s --retries=3 \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT ?? 3000}/api/ready`).then((r) => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"]

CMD ["sh", "-c", "pnpm --filter @interview-coach/db db:migrate && pnpm --filter @interview-coach/backend start"]
