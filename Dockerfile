# LabMaker — imagem de produção (Next.js + Prisma). Build: docker build -t labmaker .
FROM node:22-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# 1) Dependências (camada cacheada enquanto o package-lock não mudar)
FROM base AS deps
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

# 2) Build
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# o prisma.config exige a variável; o build não conecta no banco
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN npx prisma generate && npx next build

# 3) Execução — usuário sem privilégios
FROM base AS runner
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app ./
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
# Prepara o banco só se estiver vazio (nunca apaga dados) e sobe o servidor.
# Em nuvem (Render) isso dispensa rodar migrations à mão no primeiro deploy.
CMD ["sh", "-c", "npx tsx scripts/db-setup.ts && exec npx next start"]
