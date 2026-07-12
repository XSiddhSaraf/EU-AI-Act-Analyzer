# AI Governance Compatibility Checker — self-hosted container.
# The runtime server is `vinext start` (a devDependency), so dependencies are
# installed in full; the image trades a little size for a verified-simple path.
FROM node:22-bookworm

WORKDIR /app

# Native toolchain fallback for better-sqlite3 if no prebuilt binary matches.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ curl \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# NEXT_PUBLIC_* values are inlined at build time — pass them as build args.
ARG NEXT_PUBLIC_UPGRADE_URL=""
ARG NEXT_PUBLIC_CONTACT_URL=""
ENV NEXT_PUBLIC_UPGRADE_URL=${NEXT_PUBLIC_UPGRADE_URL} \
    NEXT_PUBLIC_CONTACT_URL=${NEXT_PUBLIC_CONTACT_URL}

RUN npm run build

ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/app/data

RUN mkdir -p /app/data
VOLUME /app/data

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://localhost:3000/ || exit 1

CMD ["npm", "run", "start"]
