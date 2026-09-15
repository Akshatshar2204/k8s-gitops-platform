FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json ./
COPY package-lock.json* ./

RUN npm config set fetch-retries 10 \
    && npm config set fetch-retry-mintimeout 30000 \
    && npm config set fetch-retry-maxtimeout 180000 \
    && npm config set fetch-timeout 180000 \
    && npm install --no-audit --no-fund

COPY . .

ENV NODE_OPTIONS=--openssl-legacy-provider

RUN npm run build

FROM nginx:alpine

COPY --from=builder /app/build /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
