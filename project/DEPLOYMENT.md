# Institute Schedule Manager
## Complete Deployment & Run Guide

---

## What's Included

```
institute-scheduler/
├── database/
│   ├── 001_schema.sql       PostgreSQL schema — 16 tables, enums, functions
│   └── 002_seed.sql         Sample data (3 teachers, 4 students, 3 courses)
│
├── backend/                 Node.js REST API
│   ├── src/
│   │   ├── server.js
│   │   ├── config/          database.js, logger.js
│   │   ├── middleware/       auth.js, validate.js, errorHandler.js
│   │   └── modules/
│   │       ├── auth/         Login, JWT, user creation
│   │       ├── teachers/     CRUD, expertise, workload
│   │       ├── students/     CRUD, groups, enrollments
│   │       ├── courses/      Courses + subjects
│   │       ├── classes/      Scheduling + conflict engine
│   │       ├── attendance/   Submit, view, pending
│   │       ├── leave/        Requests, approval, emergency
│   │       ├── dashboard/    KPIs, calendar, availability
│   │       ├── reports/      5 reports × PDF + Excel + CSV
│   │       └── notifications/
│   ├── Dockerfile
│   ├── package.json
│   └── .env.example
│
├── nginx/nginx.conf          Reverse proxy config
├── docker-compose.yml        Full stack in one command
└── docs/
    ├── api-reference.html    Interactive API docs
    └── er-diagram.html       Database diagram
```

---

## Option A — Docker (Recommended, Easiest)

### Prerequisites
- Docker Desktop (Windows/Mac) or Docker Engine (Linux)
- Download from: https://www.docker.com/get-started

### Steps

**1. Set secure secrets**

Open `docker-compose.yml` and change these three values:
```yaml
DB_PASSWORD:        your_database_password
JWT_SECRET:         a_random_string_minimum_32_characters_long
JWT_REFRESH_SECRET: another_random_string_minimum_32_characters
```

Generate secrets instantly:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**2. Generate password hashes for seed users**

```bash
node -e "const b=require('bcryptjs'); b.hash('Password123',12).then(console.log)"
```

Open `database/002_seed.sql` and replace every `$2b$12$placeholder_hash` with the output.

**3. Run everything**

```bash
docker-compose up -d
```

That's it. Docker will:
- Pull PostgreSQL 16
- Run the schema and seed SQL automatically
- Build and start the Node.js API
- Start Nginx on port 80

**4. Verify it's running**

```bash
curl http://localhost/health
# {"status":"ok","database":"connected"}
```

**5. Test login**

```bash
curl -X POST http://localhost/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@institute.com","password":"Password123"}'
```

**6. Stop the system**

```bash
docker-compose down        # Stop (keeps data)
docker-compose down -v     # Stop + delete database
```

---

## Option B — Manual Setup (No Docker)

### Prerequisites
- Node.js 18 or 20 — https://nodejs.org
- PostgreSQL 14+ — https://www.postgresql.org/download

---

### Step 1 — Create the PostgreSQL Database

**Connect to PostgreSQL:**
```bash
# Linux / Mac
psql -U postgres

# Windows (run as Administrator)
psql -U postgres
```

**Create database and user:**
```sql
CREATE DATABASE institute_scheduler;
CREATE USER ism_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE institute_scheduler TO ism_user;
\q
```

**Run the schema:**
```bash
psql -U ism_user -d institute_scheduler -f database/001_schema.sql
```

Expected output ends with:
```
CREATE FUNCTION
CREATE FUNCTION
```

**Run the seed data:**

First generate a password hash:
```bash
cd backend
npm install
node -e "const b=require('bcryptjs'); b.hash('Password123',12).then(console.log)"
```

Copy the output (starts with `$2b$12$...`), open `database/002_seed.sql`, and replace ALL occurrences of `$2b$12$placeholder_hash` with it.

Then run:
```bash
psql -U ism_user -d institute_scheduler -f database/002_seed.sql
```

---

### Step 2 — Configure the Backend

```bash
cd backend
cp .env.example .env
```

Open `.env` and fill in your values:

```env
NODE_ENV=development
PORT=5000

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=institute_scheduler
DB_USER=ism_user
DB_PASSWORD=your_password

# JWT — generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JWT_SECRET=generate_a_long_random_string_here
JWT_REFRESH_SECRET=generate_another_long_random_string

JWT_EXPIRES_IN=8h
JWT_REFRESH_EXPIRES_IN=7d

# Frontend URL (CORS)
CLIENT_URL=http://localhost:3000
```

---

### Step 3 — Install and Start

```bash
cd backend
npm install
npm run dev        # Development (auto-restarts on changes)
# OR
npm start          # Production
```

Server starts at: **http://localhost:5000**

Health check: **http://localhost:5000/health**

---

## Test Credentials (after seed)

| Role | Email | Password |
|------|-------|----------|
| Admin/Principal | admin@institute.com | Password123 |
| Teacher 1 | teacher1@institute.com | Password123 |
| Teacher 2 | teacher2@institute.com | Password123 |
| Student 1 | student1@institute.com | Password123 |

---

## Key API Endpoints

All endpoints start with: `http://localhost:5000/api/v1`

### Login (get your token)
```bash
curl -X POST http://localhost:5000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@institute.com","password":"Password123"}'
```

Save the `accessToken` from the response, then use it like:
```bash
-H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Create a Teacher
```bash
curl -X POST http://localhost:5000/api/v1/auth/users \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email":"teacher@school.com","password":"Pass1234","role":"teacher","fullName":"Mr. Smith"}'
```

### Schedule a Class
```bash
curl -X POST http://localhost:5000/api/v1/classes \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "teacherId": "TEACHER_UUID",
    "subjectId": "SUBJECT_UUID",
    "scheduledDate": "2025-03-10",
    "startTime": "09:00",
    "durationMinutes": 60,
    "platform": "google_meet",
    "meetingLink": "https://meet.google.com/abc-def"
  }'
```

### Schedule Recurring Classes
```bash
curl -X POST http://localhost:5000/api/v1/classes \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "teacherId": "TEACHER_UUID",
    "subjectId": "SUBJECT_UUID",
    "scheduledDate": "2025-03-10",
    "startTime": "09:00",
    "durationMinutes": 60,
    "platform": "google_meet",
    "recurrence": {
      "frequency": "weekly",
      "daysOfWeek": ["monday","wednesday","friday"],
      "endDate": "2025-06-30"
    }
  }'
```

### Get Dashboard KPIs (Admin)
```bash
curl http://localhost:5000/api/v1/dashboard/overview \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

### Teacher — Today's Schedule
```bash
curl http://localhost:5000/api/v1/classes/my/today \
  -H "Authorization: Bearer TEACHER_TOKEN"
```

### Download a Report (PDF)
```bash
curl "http://localhost:5000/api/v1/reports/teacher-workload?from=2025-01-01&to=2025-01-31&format=pdf" \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  --output workload.pdf
```

### Download a Report (Excel)
```bash
curl "http://localhost:5000/api/v1/reports/attendance?from=2025-01-01&to=2025-01-31&format=xlsx" \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  --output attendance.xlsx
```

---

## Production Deployment on Ubuntu VPS

### One-Time Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker

# Clone / upload your project
# (use scp, rsync, or git)
scp -r ./institute-scheduler user@your-server-ip:/home/user/
```

### Deploy

```bash
cd institute-scheduler

# Edit docker-compose.yml — set strong passwords and secrets
nano docker-compose.yml

# Start
docker-compose up -d

# Check logs
docker-compose logs -f api

# Check status
docker-compose ps
```

### Point your domain

1. Set your domain's DNS A record → your server IP
2. Update `nginx/nginx.conf` — change `server_name _` to `server_name yourdomain.com`
3. Add SSL with Let's Encrypt:

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

---

## Useful Commands

```bash
# View live logs
docker-compose logs -f api
docker-compose logs -f postgres

# Restart API only
docker-compose restart api

# Connect to database directly
docker exec -it ism_postgres psql -U ism_user -d institute_scheduler

# Run a SQL query
docker exec -it ism_postgres psql -U ism_user -d institute_scheduler \
  -c "SELECT COUNT(*) FROM users;"

# Backup database
docker exec ism_postgres pg_dump -U ism_user institute_scheduler > backup.sql

# Restore database
cat backup.sql | docker exec -i ism_postgres psql -U ism_user -d institute_scheduler
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `ECONNREFUSED` on DB | Check DB_HOST, DB_PORT in .env. With Docker, DB_HOST must be `postgres` not `localhost` |
| `JWT secret too short` | JWT_SECRET must be 32+ characters |
| `relation does not exist` | Schema not loaded — run 001_schema.sql first |
| Port 5000 already in use | Change PORT in .env or kill the process using the port |
| `permission denied for table` | Run: `GRANT ALL ON ALL TABLES IN SCHEMA public TO ism_user;` |
| Docker port 80 in use | Change `"80:80"` to `"8080:80"` in docker-compose.yml |

---

## Architecture Summary

```
Browser / Client
      ↓ HTTP
Nginx (port 80)  ←── Reverse proxy, static files
      ↓
Node.js API (port 5000)
  ├── JWT Auth middleware
  ├── Role-based authorization (admin / teacher)
  ├── 10 route modules
  ├── Conflict Engine (7 rules, runs in parallel)
  └── Report Engine (PDF + Excel + CSV streaming)
      ↓
PostgreSQL (port 5432)
  ├── 16 tables
  ├── Built-in conflict check functions
  └── Auto-timestamp triggers
```

---

## Full API Reference

Open `docs/api-reference.html` in your browser for the complete interactive API documentation.

Open `docs/er-diagram.html` for the full database entity-relationship diagram.
