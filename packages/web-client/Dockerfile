# @interview-coach/web-client — static build served by nginx (S8b).
# Build from the repo root:
#   docker build -f packages/web-client/Dockerfile \
#     --build-arg VITE_BACKEND_URL=http://localhost:3000 .
# VITE_API_TOKEN is local-dev-only (ships in the bundle when set).

FROM node:24-slim AS build
RUN npm install -g pnpm@12.3.4
WORKDIR /repo
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY dsa-interview-curriculum.json ./dsa-interview-curriculum.json
COPY packages/web-client/package.json packages/web-client/package.json
RUN pnpm install --frozen-lockfile --filter @interview-coach/web-client
COPY packages/web-client ./packages/web-client
ARG VITE_BACKEND_URL=http://localhost:3000
ARG VITE_API_TOKEN=
ENV VITE_BACKEND_URL=${VITE_BACKEND_URL} \
    VITE_API_TOKEN=${VITE_API_TOKEN}
RUN pnpm --filter @interview-coach/web-client build

FROM nginx:1.27-alpine
COPY packages/web-client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/packages/web-client/dist /usr/share/nginx/html
EXPOSE 80
