FROM node:22-alpine AS builder

WORKDIR /app

ENV NODE_OPTIONS=--max-old-space-size=768

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY --from=builder /app/build ./build

EXPOSE 3080

CMD ["node", "build"]
