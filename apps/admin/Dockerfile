FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy workspace files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY tsconfig.base.json ./
COPY packages/types/package.json packages/types/
COPY apps/admin/package.json apps/admin/

# Install
RUN pnpm install --frozen-lockfile || pnpm install

# Copy source
COPY packages/types/ packages/types/
COPY apps/admin/ apps/admin/

# Build
RUN pnpm --filter @studio/admin build

ENV PORT=3000
EXPOSE 3000

CMD ["pnpm", "--filter", "@studio/admin", "start"]
