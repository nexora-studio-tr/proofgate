FROM node:24.15.0-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends procps && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/proofgate
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund && npm cache clean --force
COPY execute.mjs reporter.mjs filter.mjs workspace-bootstrap.mjs workspace-vitest.mjs ./
RUN mkdir /input /scratch && chown node:node /scratch
USER node
ENV NODE_ENV=test CI=true TZ=UTC
WORKDIR /scratch
ENTRYPOINT ["node","/opt/proofgate/execute.mjs"]
