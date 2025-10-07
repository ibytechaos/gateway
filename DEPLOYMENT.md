# Portkey Gateway with Langfuse - 部署指南

## 镜像信息

- **Docker Hub**: `wuzhipeng/portkey-gateway`
- **最新版本**: `latest` / `1.12.3-langfuse`
- **镜像大小**: ~193MB

## 快速开始

### 1. 使用 Docker Run

```bash
docker run -d \
  --name portkey-gateway \
  -p 8787:8787 \
  -e LANGFUSE_PUBLIC_KEY=pk-lf-your-public-key \
  -e LANGFUSE_SECRET_KEY=sk-lf-your-secret-key \
  -e LANGFUSE_BASE_URL=https://cloud.langfuse.com \
  wuzhipeng/portkey-gateway:latest
```

### 2. 使用 Docker Compose

创建 `docker-compose.yml`：

```yaml
version: '3.8'

services:
  gateway:
    image: wuzhipeng/portkey-gateway:latest
    container_name: portkey-gateway
    ports:
      - "8787:8787"
    environment:
      - LANGFUSE_PUBLIC_KEY=${LANGFUSE_PUBLIC_KEY}
      - LANGFUSE_SECRET_KEY=${LANGFUSE_SECRET_KEY}
      - LANGFUSE_BASE_URL=${LANGFUSE_BASE_URL:-https://cloud.langfuse.com}
    restart: unless-stopped
```

创建 `.env` 文件：

```bash
LANGFUSE_PUBLIC_KEY=pk-lf-your-public-key
LANGFUSE_SECRET_KEY=sk-lf-your-secret-key
LANGFUSE_BASE_URL=https://cloud.langfuse.com
```

启动：

```bash
docker-compose up -d
```

## 环境变量说明

| 变量名 | 必填 | 默认值 | 说明 |
|--------|------|--------|------|
| `LANGFUSE_PUBLIC_KEY` | ✅ | - | Langfuse 公钥，从 https://cloud.langfuse.com 获取 |
| `LANGFUSE_SECRET_KEY` | ✅ | - | Langfuse 密钥 |
| `LANGFUSE_BASE_URL` | ❌ | `https://cloud.langfuse.com` | Langfuse 服务地址，自部署时修改 |

## 验证部署

### 1. 检查容器状态

```bash
docker ps | grep portkey-gateway
```

### 2. 查看启动日志

```bash
docker logs portkey-gateway
```

**成功启动的日志示例**：
```
[Langfuse] ✅ Successfully initialized
[Langfuse] 🔗 Base URL: https://cloud.langfuse.com
[Langfuse] 🔑 Public Key: pk-lf-123...
[Langfuse] 📊 Tracing enabled for: /v1/chat/completions, /v1/completions, /v1/messages, /v1/embeddings
```

**未配置的日志示例**：
```
[Langfuse] ❌ Not configured - missing LANGFUSE_PUBLIC_KEY or LANGFUSE_SECRET_KEY
[Langfuse] ℹ️  Set environment variables to enable tracing:
[Langfuse]    - LANGFUSE_PUBLIC_KEY
[Langfuse]    - LANGFUSE_SECRET_KEY
[Langfuse]    - LANGFUSE_BASE_URL (optional, defaults to https://cloud.langfuse.com)
```

### 3. 测试 Gateway

```bash
curl http://localhost:8787
```

期望响应：
```
AI Gateway says hey!
```

### 4. 测试 Langfuse 追踪

发送一个聊天请求：

```bash
curl http://localhost:8787/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

然后访问 Langfuse 控制台查看追踪记录。

## 常见问题

### Q1: 日志显示"Not configured"但环境变量已设置

**原因**: 容器内环境变量未正确传递

**解决方法**:
```bash
# 验证环境变量
docker exec portkey-gateway env | grep LANGFUSE

# 如果没有输出，重新运行容器并确保 -e 参数正确
docker rm -f portkey-gateway
docker run -d \
  --name portkey-gateway \
  -p 8787:8787 \
  -e LANGFUSE_PUBLIC_KEY=your-key \
  -e LANGFUSE_SECRET_KEY=your-secret \
  wuzhipeng/portkey-gateway:latest
```

### Q2: 追踪数据未出现在 Langfuse

**可能原因**:
1. 环境变量配置错误
2. Langfuse 服务不可达
3. 网络问题

**排查步骤**:
```bash
# 1. 检查日志中是否有 flush 错误
docker logs portkey-gateway | grep Langfuse

# 2. 测试网络连接
docker exec portkey-gateway wget -O- https://cloud.langfuse.com

# 3. 验证密钥是否正确（去 Langfuse 控制台确认）
```

### Q3: 如何使用自部署的 Langfuse

设置 `LANGFUSE_BASE_URL` 为你的实例地址：

```bash
docker run -d \
  --name portkey-gateway \
  -p 8787:8787 \
  -e LANGFUSE_PUBLIC_KEY=pk-lf-your-key \
  -e LANGFUSE_SECRET_KEY=sk-lf-your-secret \
  -e LANGFUSE_BASE_URL=https://your-langfuse.com \
  wuzhipeng/portkey-gateway:latest
```

## 性能调优

### 资源限制

```yaml
services:
  gateway:
    image: wuzhipeng/portkey-gateway:latest
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '1'
          memory: 512M
```

### 健康检查

```yaml
services:
  gateway:
    image: wuzhipeng/portkey-gateway:latest
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:8787/"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

## 生产环境建议

1. **使用特定版本标签**
   ```bash
   docker pull wuzhipeng/portkey-gateway:1.12.3-langfuse
   ```

2. **使用 Docker Secrets**（Docker Swarm）
   ```yaml
   services:
     gateway:
       image: wuzhipeng/portkey-gateway:latest
       secrets:
         - langfuse_public_key
         - langfuse_secret_key
       environment:
         - LANGFUSE_PUBLIC_KEY_FILE=/run/secrets/langfuse_public_key
         - LANGFUSE_SECRET_KEY_FILE=/run/secrets/langfuse_secret_key

   secrets:
     langfuse_public_key:
       external: true
     langfuse_secret_key:
       external: true
   ```

3. **启用日志轮转**
   ```yaml
   services:
     gateway:
       image: wuzhipeng/portkey-gateway:latest
       logging:
         driver: "json-file"
         options:
           max-size: "10m"
           max-file: "3"
   ```

4. **反向代理配置**（Nginx 示例）
   ```nginx
   upstream gateway {
       server localhost:8787;
   }

   server {
       listen 80;
       server_name gateway.yourdomain.com;

       location / {
           proxy_pass http://gateway;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

## Kubernetes 部署

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: portkey-gateway
spec:
  replicas: 3
  selector:
    matchLabels:
      app: portkey-gateway
  template:
    metadata:
      labels:
        app: portkey-gateway
    spec:
      containers:
      - name: gateway
        image: wuzhipeng/portkey-gateway:1.12.3-langfuse
        ports:
        - containerPort: 8787
        env:
        - name: LANGFUSE_PUBLIC_KEY
          valueFrom:
            secretKeyRef:
              name: langfuse-credentials
              key: public-key
        - name: LANGFUSE_SECRET_KEY
          valueFrom:
            secretKeyRef:
              name: langfuse-credentials
              key: secret-key
        - name: LANGFUSE_BASE_URL
          value: "https://cloud.langfuse.com"
        resources:
          limits:
            memory: "2Gi"
            cpu: "2000m"
          requests:
            memory: "512Mi"
            cpu: "500m"
---
apiVersion: v1
kind: Service
metadata:
  name: portkey-gateway
spec:
  selector:
    app: portkey-gateway
  ports:
  - port: 80
    targetPort: 8787
  type: LoadBalancer
```

## 监控和日志

### 查看实时日志

```bash
docker logs -f portkey-gateway
```

### 过滤 Langfuse 日志

```bash
docker logs portkey-gateway 2>&1 | grep Langfuse
```

### 导出日志到文件

```bash
docker logs portkey-gateway > gateway.log 2>&1
```

## 更新镜像

```bash
# 拉取最新版本
docker pull wuzhipeng/portkey-gateway:latest

# 停止并删除旧容器
docker stop portkey-gateway
docker rm portkey-gateway

# 启动新容器
docker run -d \
  --name portkey-gateway \
  -p 8787:8787 \
  -e LANGFUSE_PUBLIC_KEY=pk-lf-your-key \
  -e LANGFUSE_SECRET_KEY=sk-lf-your-secret \
  wuzhipeng/portkey-gateway:latest

# 或使用 Docker Compose
docker-compose pull
docker-compose up -d
```

## 获取帮助

- **Langfuse 文档**: https://langfuse.com/docs
- **Portkey 文档**: https://portkey.ai/docs
- **镜像仓库**: https://hub.docker.com/r/wuzhipeng/portkey-gateway

## License

MIT
