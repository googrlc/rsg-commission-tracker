# RSG Commission Tracker — container image for Elestio (replaces Cloud Run).
# The Supabase URL + PUBLISHABLE key are browser-safe and are baked into the
# client bundle at build time. Do NOT pass the service_role key here.

# ---- build stage ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY
# Optional silent auto-sign-in for the PRIVATE (Tailscale-only) build. When set,
# the app signs in as this shared allowlisted account and shows no login screen;
# RLS still enforces access. NEVER pass these to a public build.
ARG VITE_AUTOLOGIN_EMAIL
ARG VITE_AUTOLOGIN_PASSWORD
ENV VITE_AUTOLOGIN_EMAIL=$VITE_AUTOLOGIN_EMAIL
ENV VITE_AUTOLOGIN_PASSWORD=$VITE_AUTOLOGIN_PASSWORD
RUN npm run build

# ---- runtime stage ----
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/server.cjs"]
