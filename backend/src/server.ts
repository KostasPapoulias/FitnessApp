import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import 'dotenv/config';
import dotenv from 'dotenv';

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
import notificationRoutes from './routes/notification.routes';
import securityRoutes from './routes/security.routes';
import configRoutes from './routes/config.routes';
import templateRoutes from './routes/template.routes';
import settingsRoutes from './routes/settings.routes';
import progressRoutes from './routes/progress.routes';
import { startNotificationScheduler } from './lib/notificationScheduler';
import { startSessionSweeper } from './lib/sessionSweeper';
import { apiLimiter } from './middleware/rateLimit.middleware';

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

// Single shared PrismaClient instance (one connection pool for the whole
// process) — see src/lib/prisma.ts.
export { default as prisma } from './lib/prisma';

// Railway terminates TLS at its proxy, so req.ip is the proxy's address unless
// Express is told to read X-Forwarded-For. Without this every rate limit keys
// on one IP and a single noisy client locks out everyone. Set to 1 rather than
// `true`: trusting the whole chain lets a client spoof the header and sidestep
// the limits entirely.
app.set('trust proxy', 1);

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

// Backstop against a runaway client or a scraper. Mounted after /health so
// uptime checks are never throttled.
app.use('/api', apiLimiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/exercises', exerciseRoutes);
app.use('/api/workout', workoutRoutes);
app.use('/api/fatigue', fatigueRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/security', securityRoutes);
app.use('/api/config', configRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/progress', progressRoutes);


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

// A rejected promise nobody caught terminates the process on Node 15+, which
// would take the whole API down over one failed background send. The scheduler
// and planner both catch internally; this is the last line of defence.
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});

// Start server
app.listen(port, () => {
  console.log(`✅ SomaTrack API listening on http://localhost:${port}`);
  console.log(`   Health check: http://localhost:${port}/health`);
  startNotificationScheduler();
  startSessionSweeper();
});

export default app;