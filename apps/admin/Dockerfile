FROM node:20-alpine

RUN npm install -g pnpm@9.15.0

WORKDIR /app

COPY . .

RUN pnpm install --no-frozen-lockfile

# NEXT_PUBLIC_ vars must be set at build time
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

RUN pnpm --filter @studio/admin build

ENV PORT=3000
EXPOSE 3000

CMD ["pnpm", "--filter", "@studio/admin", "start"]
