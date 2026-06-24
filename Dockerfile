# ============================================
# 阶段1：依赖安装和构建
# ============================================
FROM node:20-alpine AS builder

WORKDIR /app

# 安装构建依赖
RUN apk add --no-cache libc6-compat openssl

# 复制package文件
COPY package.json package-lock.json* ./

# 安装依赖
RUN npm ci

# 复制源代码
COPY . .

# 生成Prisma客户端
RUN npx prisma generate

# 构建应用
RUN npm run build

# ============================================
# 阶段2：生产镜像
# ============================================
FROM node:20-alpine AS runner

WORKDIR /app

# 设置生产环境
ENV NODE_ENV=production

# 安装运行时依赖
RUN apk add --no-cache openssl tini

# 创建非root用户
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# 复制构建产物
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json

# 复制Next.js构建产物（standalone模式）
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# 复制Prisma schema（用于运行时）
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# 复制迁移脚本
COPY --from=builder /app/src/lib/migrations ./src/lib/migrations
COPY --from=builder /app/scripts ./scripts

# 创建数据目录
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data

# 切换到非root用户
USER nextjs

# 暴露端口
EXPOSE 3000

# 环境变量
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV DATABASE_URL="file:/app/data/db.sqlite"

# 使用tini作为init进程
ENTRYPOINT ["/sbin/tini", "--"]

# 启动命令
CMD ["node", "server.js"]
