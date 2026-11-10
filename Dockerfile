FROM node:20-slim

# ffmpeg from apt (no download at build time) + a font for timestamp overlays
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core \
 && rm -rf /var/lib/apt/lists/*

ENV FFMPEG_PATH=/usr/bin/ffmpeg \
    FFPROBE_PATH=/usr/bin/ffprobe \
    FONT_PATH=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf \
    NODE_ENV=production \
    PORT=3000

WORKDIR /app
COPY package*.json ./
# --ignore-scripts: skip ffmpeg-static's binary download, we use apt ffmpeg
RUN npm ci --omit=dev --ignore-scripts
COPY src ./src
COPY public ./public

RUN mkdir -p /app/data && chown -R node:node /app
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/server.js"]
