import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import 'dotenv/config';
import dotenv from 'dotenv';

dotenv.config();

// Observability, before anything that might fail. `errorReporting` reads
// SENTRY_DSN at import time, so a crash during route wiring is still reported.
import { log } from './lib/logger';
// Imported for its side effect as much as its export: it registers itself as
// the logger's error sink, which is what routes every log.error to Sentry.
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

// Opens the per-request log context. First in the chain on purpose: everything
// after it — including the error handler at the bottom of this file — logs with
// a request id attached, and a stack trace that cannot be tied to a request is
// most of the way to useless.
app.use(requestLogger);

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
// Where the frontend's error boundary sends a crash. See clientError.controller.
app.use('/api/client-errors', clientErrorRoutes);


// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
  });
});

// Error handler.
//
// The response stays deliberately vague in production — an error message can
// name a table, a column or a file path, and that is free reconnaissance. The
// detail goes to the logs and to Sentry instead, keyed by the request id, which
// IS returned so a report of "it broke" can be matched to the exact failure.
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  log.error('Unhandled error in request', err);

  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error',
  });
});

// A rejected promise nobody caught terminates the process on Node 15+, which
// would take the whole API down over one failed background send. The scheduler
// and planner both catch internally; this is the last line of defence.
process.on('unhandledRejection', (reason) => {
  // Normalised to an Error before logging: a rejection can carry any value, and
  // only a real Error is treated as reportable (see logger.setErrorSink). A
  // `reject('nope')` somewhere would otherwise be logged and never alerted on.
  const error = reason instanceof Error
    ? reason
    : new Error(`Unhandled rejection: ${String(reason)}`);
  log.error('Unhandled promise rejection', error, { source: 'unhandledRejection' });
});

// An uncaught exception is genuinely unrecoverable: the process is in an
// unknown state and Node's default is to exit. What is NOT acceptable is
// exiting silently, which is what happened before — the container restarted and
// the reason went with it. Report, give the report a moment to leave, then let
// the process die as it would have anyway.
process.on('uncaughtException', (error) => {
  log.error('Uncaught exception — shutting down', error, { source: 'uncaughtException' });
  void flushErrorReports().finally(() => process.exit(1));
});

// Railway sends SIGTERM before replacing a container. Without this, a deploy
// discards whatever reports were still buffered.
process.on('SIGTERM', () => {
  log.info('SIGTERM received — shutting down');
  void flushErrorReports().finally(() => process.exit(0));
});

// Start server
app.listen(port, () => {
  log.info('SomaTrack API listening', {
    port,
    env: process.env.NODE_ENV || 'development',
  });
  startNotificationScheduler();
  startSessionSweeper();
});

export default app;