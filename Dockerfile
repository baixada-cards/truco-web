# syntax=docker/dockerfile:1.7

FROM node:24.12.0-bookworm-slim AS dependencies

ARG SFW_VERSION=1.13.1
ARG SFW_SHA256=4dc46b626a7c5b81c0b54e1984ee53be5a628dbfb2f55ab14e9b04c8a134db6a

RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates curl git \
    && rm -rf /var/lib/apt/lists/* \
    && curl --fail --location --proto '=https' --tlsv1.2 \
      "https://github.com/SocketDev/sfw-free/releases/download/v${SFW_VERSION}/sfw-free-linux-x86_64" \
      --output /usr/local/bin/sfw \
    && echo "${SFW_SHA256}  /usr/local/bin/sfw" | sha256sum --check - \
    && chmod 0755 /usr/local/bin/sfw \
    && sfw npm install --global pnpm@10.26.2

WORKDIR /app
COPY . .
RUN sfw pnpm install --frozen-lockfile

FROM dependencies AS build
ARG NEXT_PUBLIC_SHOW_DEV_CONTROLS=false
ARG NEXT_PUBLIC_STUDY_LAB_LINKS=false
ARG NEXT_PUBLIC_STUDY_MANIFEST_URL

ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_SHOW_DEV_CONTROLS=${NEXT_PUBLIC_SHOW_DEV_CONTROLS}
ENV NEXT_PUBLIC_STUDY_LAB_LINKS=${NEXT_PUBLIC_STUDY_LAB_LINKS}
ENV NEXT_PUBLIC_STUDY_MANIFEST_URL=${NEXT_PUBLIC_STUDY_MANIFEST_URL}

RUN pnpm build

FROM node:24.12.0-bookworm-slim AS runtime
ENV HOSTNAME=0.0.0.0
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=8080

WORKDIR /app
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static

USER node
EXPOSE 8080
CMD ["node", "server.js"]
