import { Response } from 'express';
import bcrypt from 'bcrypt';
import { JWT_SECRET, JWT_EXPIRES_IN, APP_BASE_URL } from '../lib/env';
import { normalizeEmail, validatePassword } from '../services/credentials.service';
import {
  ResetError, completePasswordReset, isMailConfigured, requestPasswordReset,
} from '../services/password-reset.service';
import jwt from 'jsonwebtoken';
import { prisma } from '../server';
import { AuthRequest } from '../server';
import { log } from '../lib/logger';
import { isLocale, localeOf } from '../lib/locale';
import { CLIENT_SETTINGS_SELECT } from './settings.controller';

interface RegisterBody {
  email: string;
  password: string;
  name?: string;
  /** 'en' | 'el', picked on the Register screen. */
  language?: string;
}

interface LoginBody {
  email: string;
  password: string;
}

/**
 * Tokens carry the user's tokenVersion at issue time; bumping the stored
 * version revokes them all (see token-version.service).
 */
const signToken = (userId: string, tokenVersion: number): string =>
  jwt.sign(
    { userId, tv: tokenVersion },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions
  );

// POST /api/auth/register
export const register = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { email: rawEmail, password, name, language } = req.body as RegisterBody;

    // Normalised so one address cannot become several accounts
    const email = normalizeEmail(rawEmail);
    if (!email) {
      res.status(400).json({ success: false, error: 'Enter a valid email address.' });
      return;
    }

    const passwordCheck = validatePassword(password);
    if (!passwordCheck.ok) {
      res.status(400).json({ success: false, error: passwordCheck.error });
      return;
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      res.status(409).json({
        success: false,
        // Tells the user what to do next
        error: 'That email is already registered. Sign in instead.',
      });
      return;
    }

    // bcrypt, 10 rounds
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        profile: {
          create: {
            name: name || email.split('@')[0],
          },
        },
        settings: {
          // The explicit choice, else the language of the Register screen
          create: { language: isLocale(language) ? language : localeOf(res) },
        },
      },
      select: {
        id: true,
        email: true,
        profile: true,
        tokenVersion: true,
        settings: { select: { language: true } },
      },
    });

    const token = signToken(user.id, user.tokenVersion);
    const { tokenVersion: _tv, ...safeUser } = user;

    res.status(201).json({
      success: true,
      data: {
        user: safeUser,
        token,
      },
    });
  } catch (error) {
    log.error('Register failed', error);
    res.status(500).json({
      success: false,
      error: 'Failed to register user',
    });
  }
};

// POST /api/auth/login
export const login = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { email: rawEmail, password } = req.body as LoginBody;

    if (!rawEmail || !password) {
      res.status(400).json({
        success: false,
        error: 'Email and password are required',
      });
      return;
    }

    // Normalised lookup first, then the raw address for pre-normalisation accounts
    const normalized = normalizeEmail(rawEmail);
    const select = {
      id: true,
      email: true,
      password: true,
      profile: true,
      tokenVersion: true,
      // So a new device switches to the account's language on sign-in
      settings: { select: { language: true } },
    };

    const user =
      (normalized && await prisma.user.findUnique({ where: { email: normalized }, select })) ||
      await prisma.user.findUnique({ where: { email: String(rawEmail).trim() }, select });

    if (!user) {
      res.status(401).json({
        success: false,
        error: 'Invalid credentials',
      });
      return;
    }

    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      res.status(401).json({
        success: false,
        error: 'Invalid credentials',
      });
      return;
    }

    const token = signToken(user.id, user.tokenVersion);

    // Neither the hash nor the token version is returned
    const { password: _, tokenVersion: _tv, ...userWithoutPassword } = user;

    res.json({
      success: true,
      data: {
        user: userWithoutPassword,
        token,
      },
    });
  } catch (error) {
    log.error('Login failed', error);
    res.status(500).json({
      success: false,
      error: 'Failed to login',
    });
  }
};

// GET /api/auth/me
export const me = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({
        success: false,
        error: 'Not authenticated',
      });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        id: true,
        email: true,
        createdAt: true,
        profile: true,
        // Allowlisted settings — never the PIN hash
        settings: { select: CLIENT_SETTINGS_SELECT },
      },
    });

    if (!user) {
      res.status(404).json({
        success: false,
        error: 'User not found',
      });
      return;
    }

    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    log.error('Me failed', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user',
    });
  }
};

/**
 * POST /api/auth/forgot-password
 * Always the same answer, so the endpoint cannot reveal who has an account.
 */
export const forgotPassword = async (req: AuthRequest, res: Response): Promise<void> => {
  const accepted = {
    success: true,
    data: {
      message: 'If that address has an account, a reset link is on its way.',
    },
  };

  try {
    if (!isMailConfigured) {
      // Refuse openly rather than claim a link was sent
      res.status(503).json({
        success: false,
        error: 'Password reset is unavailable right now. Contact support.',
      });
      return;
    }

    const email = normalizeEmail(req.body?.email);
    if (!email) {
      // A malformed address cannot have an account — same answer
      res.json(accepted);
      return;
    }

    await requestPasswordReset(email, {
      baseUrl: APP_BASE_URL,
      requestIp: req.ip,
      // Email in the language of the screen they asked from
      locale: localeOf(res),
    });

    res.json(accepted);
  } catch (error) {
    // Logged, never surfaced — failures would reveal which addresses exist
    log.error('forgotPassword failed', error);
    res.json(accepted);
  }
};

/**
 * POST /api/auth/reset-password
 * Sets a new password from an emailed token; revokes all sessions and other links.
 */
export const resetPassword = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { token, password } = req.body as { token?: string; password?: string };

    if (typeof token !== 'string' || !token.trim()) {
      res.status(400).json({ success: false, error: 'That reset link is invalid or has expired. Request a new one.' });
      return;
    }

    // Same password rules as registration
    const passwordCheck = validatePassword(password);
    if (!passwordCheck.ok) {
      res.status(400).json({ success: false, error: passwordCheck.error });
      return;
    }

    await completePasswordReset(token.trim(), password as string);

    // No token returned: the user signs in with the new password
    res.json({
      success: true,
      data: { message: 'Password updated. Sign in with your new password.' },
    });
  } catch (error) {
    if (error instanceof ResetError) {
      res.status(400).json({ success: false, error: error.message });
      return;
    }
    log.error('resetPassword failed', error);
    res.status(500).json({ success: false, error: 'Could not reset the password.' });
  }
};
