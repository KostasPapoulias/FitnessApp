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

  // Reject tokens issued before a revocation
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
  // Attach the user to the log context as early as possible
  enrichRequestContext({ userId: decoded.userId });
  // Throttled internally; notifications are suppressed while the user is active
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
      // An unusable token is treated as no token
    }
  }

  next();
};
