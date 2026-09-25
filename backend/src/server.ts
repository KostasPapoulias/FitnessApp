import express, { Express, Request, Response, NextFunction } from 'express';
import path from 'path';
import cors from 'cors';
import 'dotenv/config';
import dotenv from 'dotenv';

dotenv.config();

// Logging and error reporting first, so failures during route wiring are reported.
import { log } from './lib/logger';
// Imported for its side effect: registers the logger's Sentry sink
import { flushErrorReports } from './lib/errorReporting';
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
import clientErrorRoutes from './routes/clientError.routes';
import { startNotificationScheduler } from './lib/notificationScheduler';
import { startSessionSweeper } from './lib/sessionSweeper';
import { apiLimiter } from './middleware/rateLimit.middleware';
import { requestLogger } from './middleware/requestLog.middleware';
import { localizeResponses } from './middleware/locale.middleware';

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

// The shared PrismaClient
export { default as prisma } from './lib/prisma';

// Behind Railway's proxy: trust one hop so req.ip is the client (rate limits key on it).
// `1`, not `true` — trusting the whole chain would let clients spoof the header.
app.set('trust proxy', 1);

// First, so every later log line — including the error handler — carries a request id.
app.use(requestLogger);

// Before the limiters and routes, so every error message is translated
app.use(localizeResponses);

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? 'https://somatrack.netlify.app'
    : ['http://localhost:3000', 'http://localhost:5173']
}));
app.use(express.json());

// Exercise animations (public/exercises/<stem>.gif). Outside /api so they can
// be cached — the service worker never caches /api — and served as immutable.
// Thumbnails are served by the frontend itself.
app.use(
  '/exercise-media',
  express.static(path.join(__dirname, '..', 'public', 'exercises'), {
    maxAge: '365d',
    immutable: true,
    // Fallthrough stays on: a missing file becomes a normal 404, not a 500 alert
  })
);

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', message: 'SomaTrack API is running' });
});

// Backstop rate limit; mounted after /health so uptime checks are never throttled.
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
// Crash reports from the frontend error boundary
app.use('/api/client-errors', clientErrorRoutes);


// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
  });
});

// Error handler: vague message in production, details to logs and Sentry.
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  log.error('Unhandled error in request', err);

  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error',
  });
});

// Last line of defence against uncaught rejections (which would kill the process).
process.on('unhandledRejection', (reason) => {
  // Normalised to an Error so it is reported to Sentry
  const error = reason instanceof Error
    ? reason
    : new Error(`Unhandled rejection: ${String(reason)}`);
  log.error('Unhandled promise rejection', error, { source: 'unhandledRejection' });
});

// Unrecoverable: report, flush, then exit.
process.on('uncaughtException', (error) => {
  log.error('Uncaught exception — shutting down', error, { source: 'uncaughtException' });
  void flushErrorReports().finally(() => process.exit(1));
});

// Flush buffered reports before Railway replaces the container.
process.on('SIGTERM', () => {
  log.info('SIGTERM received — shutting down');
  void flushErrorReports().finally(() => process.exit(0));
});

// Start server
const server = app.listen(port, () => {
  log.info('SomaTrack API listening', {
    port,
    env: process.env.NODE_ENV || 'development',
  });
  startNotificationScheduler();
  startSessionSweeper();
});

/**
 * Listen errors. EADDRINUSE (usually a second dev server) is logged without an
 * Error so it is not sent to Sentry; anything else is reported.
 */
server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    log.error(`Port ${port} is already in use — the server is probably already running`, {
      port,
      code: error.code,
      fix: `Stop the other process (npx kill-port ${port}) or start this one with a different PORT.`,
    });
    process.exit(1);
  }

  log.error('Server could not start', error, { port, code: error.code ?? null });
  void flushErrorReports().finally(() => process.exit(1));
});

export default app;