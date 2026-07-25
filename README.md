# SomaTrack

Fitness tracking app — Express/Prisma/PostgreSQL backend + React/Vite frontend.

## Requirements

- Node.js 18+ and npm
- A PostgreSQL database (local install or a hosted one like Neon/Supabase/Railway)

## 1. Install dependencies

```bash
cd backend && npm install
cd ../frontend && npm install
```

## 2. Configure environment variables

Create `backend/.env`:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/somatrack"
JWT_SECRET="replace-with-a-long-random-string"
PORT=3001

# Optional — enables the AI chat feature
GEMINI_API_KEY=""

# Optional — enables push notifications (generate with: npx web-push generate-vapid-keys)
VAPID_PUBLIC_KEY=""
VAPID_PRIVATE_KEY=""
VAPID_SUBJECT="mailto:you@example.com"
```

Create `frontend/.env` (only needed if the backend isn't on `http://localhost:3001`):

```env
VITE_API_URL="http://localhost:3001/api"
```

## 3. Set up the database

```bash
cd backend
npx prisma migrate dev
npx prisma db seed
```

## 4. Run

```bash
# backend (from backend/)
npm run dev

# frontend (from frontend/, in a separate terminal)
npm run dev
```

Backend runs on `http://localhost:3001`, frontend on `http://localhost:5173`.
