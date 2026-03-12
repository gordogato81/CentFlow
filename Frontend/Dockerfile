FROM node:24-alpine AS build

WORKDIR /app

COPY ./CentFlow/package*.json ./CentFlow/
WORKDIR /app/CentFlow
RUN npm ci

COPY ./CentFlow/ ./
RUN npm run build

FROM nginx:stable-alpine AS production

COPY --from=build /app/CentFlow/dist/cent-flow/browser/ /usr/share/nginx/html/
COPY ./nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
