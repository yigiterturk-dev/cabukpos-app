# netcup: canlı sunucu (Neon → host Postgres 17). Ayrıntı ops/netcup/app/README.md.
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app ./
USER node
CMD ["sh", "-c", "exec node_modules/.bin/next start -H \"$HOSTNAME\" -p \"$PORT\""]
