# API Zuimó – ảnh nhỏ, chạy bằng user không phải root
FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

# Cài phụ thuộc trước để tận dụng cache khi chỉ mã nguồn thay đổi
# ffmpeg (cắt băng), python3 + PyMuPDF (đọc PDF đề thi); pip cần --break-system-packages trên Alpine 3.20+
RUN apk add --no-cache ffmpeg python3 py3-pip && pip install --no-cache-dir --break-system-packages pymupdf

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

COPY src ./src
COPY migrations ./migrations
COPY tools ./tools
# emoji-map.json cho bộ sinh đề thi (COPY không nhận chú thích cùng dòng)
COPY data ./data

# node:alpine đã có sẵn user "node"
USER node
EXPOSE 3000

# Healthcheck gọi đúng endpoint /api/health để Compose biết khi nào API sẵn sàng
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/index.js"]
