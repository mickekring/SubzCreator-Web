# SubzCreator Dockerfile
# Next.js app with FFmpeg for media processing

FROM node:22-alpine AS base

# Install FFmpeg with subtitle support and fonts
# - ffmpeg: video processing
# - libass: ASS subtitle rendering (required for subtitles filter)
# - fontconfig: font configuration
# - ttf-freefont: fonts for subtitle rendering
# - harfbuzz: text shaping for proper font rendering
RUN apk add --no-cache \
    ffmpeg \
    libass \
    fontconfig \
    ttf-freefont \
    harfbuzz \
    && fc-cache -f

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build the application
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built application
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Create temp directory for FFmpeg processing
RUN mkdir -p /tmp/subzcreator && chown nextjs:nodejs /tmp/subzcreator

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
