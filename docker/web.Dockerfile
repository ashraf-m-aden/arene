# Front Nuxt 3 : build puis exécution du serveur Nitro seul.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
# --legacy-peer-deps : le verrou est genere avec ce drapeau (voir README et
# .github/workflows/ci.yml). Sans lui, npm derive un arbre different et rejette
# le verrou avec EUSAGE, alors que le verrou est bon.
RUN npm ci --legacy-peer-deps --workspace @arene/web --include-workspace-root

COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
ARG NUXT_PUBLIC_API_BASE=http://api:4000/api/v1
ARG NUXT_PUBLIC_SITE_URL=http://localhost:3000
ENV NUXT_PUBLIC_API_BASE=$NUXT_PUBLIC_API_BASE \
    NUXT_PUBLIC_SITE_URL=$NUXT_PUBLIC_SITE_URL
RUN npm run build --workspace @arene/web

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NITRO_PORT=3000 \
    NITRO_HOST=0.0.0.0
RUN apk add --no-cache dumb-init
COPY --from=build --chown=node:node /app/apps/web/.output ./.output
USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", ".output/server/index.mjs"]
