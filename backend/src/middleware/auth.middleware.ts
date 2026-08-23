import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthRequest } from '../server';
import { touchLastSeen } from '../services/notification-window.service';
import { currentTokenVersion } from '../services/token-version.service';
import { JWT_SECRET } from '../lib/env';
import { enrichRequestContext } from '../lib/logger';

interface TokenPayload {
  userId: string;
  /** Token version at issue time — see token-version.service. */
  tv?: number;
}

export const verifyToken = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction): Promise<void> => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    res.status(401).json({
      success: false,
      error: 'No token provided',
    });
    return;
  }

  let decoded: TokenPayload;
  try {
    decoded = jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch (error) {
    res.status(401).json({
      success: false,
      error: 'Invalid token',
    });
    return;
  }

  // A valid signature only proves we issued the token, not that it is still
  // meant to work. Anything signed before a revocation is refused here.
  const expected = await currentTokenVersion(decoded.userId);
  if (expected === null || (decoded.tv ?? 0) !== expected) {
    res.status(401).json({
      success: false,
      error: 'Session expired. Please sign in again.',
    });
    return;
  }

  req.userId = decoded.userId;
  req.user = { id: decoded.userId, email: '' };
  // Every log line and error report from here down is attributable. This is
  // the earliest point the identity is known, and the request-log middleware
  // that opened the context ran before it.
  enrichRequestContext({ userId: decoded.userId });
  // Fire and forget, throttled internally: notifications are suppressed while
  // the user is in the app, and this is the only signal that they are.
  touchLastSeen(decoded.userId);
  next();
};

export const optionalAuth = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  const token = req.headers.authorization?.split(' ')[1];

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload;
      const expected = await currentTokenVersion(decoded.userId);
      if (expected !== null && (decoded.tv ?? 0) === expected) {
        req.userId = decoded.userId;
        req.user = { id: decoded.userId, email: '' };
        enrichRequestContext({ userId: decoded.userId });
      }
    } catch (error) {
      // Optional means optional: an unusable token is treated as no token,
      // rather than failing a request that never required one.
    }
  }

  next();
};
