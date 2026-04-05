FROM node:20-alpine

RUN npm install -g pnpm@9.15.0

WORKDIR /app

# Copy everything (monorepo)
COPY . .

# Install all deps
RUN pnpm install --no-frozen-lockfile

# Generate Prisma client
RUN cd packages/database && npx prisma generate

ENV PORT=4000
EXPOSE 4000

# Migrate DB and start
CMD sh -c "cd packages/database && npx prisma db push --skip-generate && npx prisma db seed || true && cd /app && pnpm --filter @studio/api dev"
