FROM node:24-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/orkestrai-collaboration-protocol/package.json packages/orkestrai-collaboration-protocol/package.json
COPY packages/orkestrai-relay/package.json packages/orkestrai-relay/package.json
RUN npm ci --omit=dev --workspace @orkestrai/relay --include-workspace-root=false

FROM node:24-alpine
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY packages/orkestrai-collaboration-protocol packages/orkestrai-collaboration-protocol
COPY packages/orkestrai-relay packages/orkestrai-relay
USER node
EXPOSE 8787
CMD ["node", "packages/orkestrai-relay/src/server.mjs"]
