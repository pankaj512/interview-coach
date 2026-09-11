# @interview-coach/backend — production image (HLD Phase 8, S8b).
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
WORKDIR /app

# Workspace scaffolding first for a cached dependency layer.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/domain/package.json packages/domain/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/backend/package.json packages/backend/package.json
RUN pnpm install --prod --frozen-lockfile

# Runtime sources: backend + linked workspaces, migrations, seed catalog.
COPY packages/domain/src packages/domain/src
COPY packages/db/src packages/db/src
COPY packages/db/drizzle packages/db/drizzle
COPY packages/backend/src packages/backend/src
COPY dsa-problem-catalog.json ./dsa-problem-catalog.json
RUN chown -R app:app /app
USER app

ENV HOST=0.0.0.0 \
    PORT=3000 \
    NODE_ENV=production
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=25s --retries=3 \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT ?? 3000}/api/ready`).then((r) => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"]

CMD ["sh", "-c", "pnpm --filter @interview-coach/db db:migrate && pnpm --filter @interview-coach/backend start"]
