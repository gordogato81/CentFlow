# ---- Build stage -------------------------------------------------------------
# The build toolchain and the full dependency tree stay in this stage; only the
# compiled static bundle is carried into the runtime image.
FROM node:24-alpine AS build

ENV CI=true \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH

# Pins pnpm to the version in package.json's "packageManager" field.
RUN corepack enable

WORKDIR /app/CentFlow

# Copy manifests first so the dependency layer is cached independently of source.
COPY CentFlow/package.json CentFlow/pnpm-lock.yaml CentFlow/pnpm-workspace.yaml ./

# The store cache mount means repeat builds resolve from cache instead of the
# network. It lives outside the layer, so the image stays small.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

COPY CentFlow/ ./

# "pnpm run build" maps to "ng build", which is the production configuration
# (output hashing, environment.prod.ts substitution, budgets).
RUN pnpm run build

# ---- Runtime stage -----------------------------------------------------------
# nginx-unprivileged runs the whole server as UID 101 rather than starting a root
# master, and is ~8 MB smaller than nginx:stable-alpine.
# Both service ports are above the unprivileged threshold on the target host
# (net.ipv4.ip_unprivileged_port_start=0). If that is ever raised, map the
# listeners to 8080/8443 instead.
FROM ghcr.io/nginx/nginx-unprivileged:1.30.7-alpine@sha256:0c53a1f2890c3526bfd201440f0fd3970e5b78f80630f58284aad0d34b5ec7bd AS runtime

COPY --from=build /app/CentFlow/dist/cent-flow/browser/ /usr/share/nginx/html/
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80 443

CMD ["nginx", "-g", "daemon off;"]
