FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy workspace files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY tsconfig.base.json ./
COPY packages/database/package.json packages/database/
COPY packages/types/package.json packages/types/
COPY packages/utils/package.json packages/utils/
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/

# Install
RUN pnpm install --frozen-lockfile || pnpm install

# Copy source
COPY packages/ packages/
COPY apps/api/ apps/api/

# Generate Prisma
RUN cd packages/database && npx prisma generate

# Expose
ENV PORT=4000
EXPOSE 4000

# Start
CMD ["pnpm", "--filter", "@studio/api", "dev"]
