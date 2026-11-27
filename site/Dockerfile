# Build with: docker build -f site/Dockerfile .
FROM node:26-alpine AS build
WORKDIR /app/site
COPY site/package.json site/package-lock.json ./
RUN npm ci

# League Markdown validates links to the rest of the repository at build time.
COPY . /app

# These values are public and compiled into the browser bundle, never secrets.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_REPO_URL
ARG VITE_AUTH_MODE=discord
RUN npm run build && npm run check:no-dev

FROM caddy:2.11.9-alpine AS runtime
ENV PORT=8080
COPY site/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/site/dist /srv
EXPOSE 8080
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
