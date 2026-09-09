# DEPLOYMENT.md

## Environment Variables

### Backend (.env)

```env
# Server
PORT=3001
NODE_ENV=development

# Database (PostgreSQL)
DATABASE_URL="postgresql://user:password@localhost:5432/shm?schema=public"

# JWT
JWT_SECRET=<random-256-bit-hex>
JWT_REFRESH_SECRET=<random-256-bit-hex>
JWT_ACCESS_EXPIRY=24h
JWT_REFRESH_EXPIRY=7d

# MQTT
MQTT_BROKER_URL=ws://your-mqtt-broker:9001
MQTT_USERNAME=your-mqtt-username
MQTT_PASSWORD=your-mqtt-password

# Email (Gmail SMTP)
GMAIL_ACCOUNT=your-email@gmail.com
GMAIL_PASSWORD=<app-password>

# File Uploads
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=10485760

# CORS
ALLOWED_ORIGINS=http://localhost:3000,https://shm.example.com

# IoT (optional, for device authentication)
IOT_API_KEY=<random-key>
```

### Frontend (.env.local)

```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api
NEXT_PUBLIC_MQTT_URL=ws://your-mqtt-broker:9001
NEXT_PUBLIC_APP_NAME="Structural Health Monitoring"
```

## Development Setup

### Prerequisites

- Node.js 18+
- PostgreSQL 15+
- MQTT Broker (Mosquitto or cloud)

### Backend

```bash
cd backend
npm install
npx prisma migrate dev
npx prisma db seed
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Production Deployment

### Option 1: Single Server (AWS EC2)

```bash
# 1. Setup server
sudo apt update && sudo apt install -y nodejs npm postgresql nginx certbot

# 2. Configure PostgreSQL
sudo -u postgres createuser shm_user
sudo -u postgres createdb shm
sudo -u postgres psql -c "ALTER USER shm_user WITH PASSWORD 'secure_password';"

# 3. Deploy backend
cd /opt/backend
npm install --production
npx prisma migrate deploy
pm2 start ecosystem.config.js

# 4. Deploy frontend
cd /opt/frontend
npm install --production
npm run build
pm2 start npm --name "frontend" -- start

# 5. Configure nginx
server {
    listen 443 ssl;
    server_name shm.example.com;

    location /api {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location / {
        proxy_pass http://localhost:3000;
    }
}
```

### Option 2: Docker Compose

```yaml
version: "3.8"
services:
  db:
    image: postgres:15
    environment:
      POSTGRES_DB: shm
      POSTGRES_USER: shm_user
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  api:
    build: ./backend
    environment:
      DATABASE_URL: postgresql://shm_user:${DB_PASSWORD}@db:5432/shm
      JWT_SECRET: ${JWT_SECRET}
      MQTT_BROKER_URL: ${MQTT_BROKER_URL}
    ports:
      - "3001:3001"
    depends_on:
      - db

  web:
    build: ./frontend
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:3001/api
    ports:
      - "3000:3000"

volumes:
  postgres_data:
```

## Migration Cutover Plan

### Phase 1: Parallel Running (2 weeks)

1. Deploy Next.js app to staging
2. Deploy new backend to staging
3. Import MySQL data to PostgreSQL
4. Run validation scripts
5. Test all features against new stack

### Phase 2: Soft Cutover (1 week)

1. Deploy new backend to production (port 3001)
2. Deploy Next.js to production
3. Monitor both systems
4. Compare data between MySQL and PostgreSQL

### Phase 3: Full Cutover

1. Redirect all traffic to Next.js
2. Keep old MySQL data as read-only backup for 30 days
3. After 30 days, decommission old database
4. **NEVER delete the MySQL dump** (`database/structural_health_monitoring.sql`) or the backup archive

## Monitoring

### Health Checks

```typescript
// GET /api/health
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});
```

### Key Metrics to Monitor

- API response times
- Database connection pool
- MQTT connection status
- Error rates
- Memory usage
- Disk space (uploads directory)

### Logging

```typescript
// Use winston (already in dependencies)
import winston from "winston";
const logger = winston.createLogger({
  level: "info",
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: "error.log", level: "error" }),
    new winston.transports.File({ filename: "combined.log" }),
  ],
});
```
