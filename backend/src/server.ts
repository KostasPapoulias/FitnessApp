import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import 'dotenv/config';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config();
// Routes
import authRoutes from './routes/auth.routes';
import exerciseRoutes from './routes/exercise.routes';
import workoutRoutes from './routes/workout.routes';
import fatigueRoutes from './routes/fatigue.routes';
import aiRoutes from './routes/ai.routes';
import calendarRoutes from './routes/calendar.routes';
import profileRoutes from './routes/profile.routes';
import pushRoutes from './routes/push.routes';
import { startPushReminder } from './lib/pushReminder';

// Types
export interface AuthRequest extends Request {
  userId?: string;
  user?: {
    id: string;
    email: string;
  };
}

const app: Express = express();
const port = process.env.PORT || 3001;

export const prisma = new PrismaClient();

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? 'https://somatrack.netlify.app'
    : ['http://localhost:3000', 'http://localhost:5173']
}));
app.use(express.json());
//app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', message: 'SomaTrack API is running' });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/exercises', exerciseRoutes);
app.use('/api/workout', workoutRoutes);
app.use('/api/fatigue', fatigueRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/push', pushRoutes);


// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
  });
});

// Error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error',
  });
});

// Start server
app.listen(port, () => {
  console.log(`✅ SomaTrack API listening on http://localhost:${port}`);
  console.log(`   Health check: http://localhost:${port}/health`);
  startPushReminder();
});

export default app;