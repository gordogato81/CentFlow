FROM node:24-alpine AS build

RUN corepack enable

WORKDIR /app

COPY ./CentFlow/package.json ./CentFlow/pnpm-lock.yaml ./CentFlow/pnpm-workspace.yaml ./CentFlow/
WORKDIR /app/CentFlow
RUN pnpm install --frozen-lockfile

COPY ./CentFlow/ ./
RUN pnpm run build

FROM nginx:stable-alpine AS production

COPY --from=build /app/CentFlow/dist/cent-flow/browser/ /usr/share/nginx/html/
COPY ./nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
EXPOSE 443

CMD ["nginx", "-g", "daemon off;"]
