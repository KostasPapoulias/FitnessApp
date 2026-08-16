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

interface RegisterBody {
  email: string;
  password: string;
  name?: string;
}

interface LoginBody {
  email: string;
  password: string;
}

/**
 * Tokens carry the user's tokenVersion at issue time. The middleware compares
 * it against the stored value, so incrementing that column revokes every token
 * outstanding for the user — the only way to retire a stateless JWT early.
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
    const { email: rawEmail, password, name } = req.body as RegisterBody;

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

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      res.status(409).json({
        success: false,
        // Says what to do next. The client shows this verbatim, and "user
        // already exists" left people re-typing an address that was never the
        // problem.
        error: 'That email is already registered. Sign in instead.',
      });
      return;
    }

    // Hash password
    // salt 10 rounds
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
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
          create: {},
        },
      },
      select: {
        id: true,
        email: true,
        profile: true,
        tokenVersion: true,
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
    console.error('Register error:', error);
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

    // Look up normalised first. Accounts created before normalisation may hold
    // a mixed-case address, so fall back to the raw value rather than locking
    // those people out of their own accounts.
    const normalized = normalizeEmail(rawEmail);
    const select = {
      id: true,
      email: true,
      password: true,
      profile: true,
      tokenVersion: true,
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

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      res.status(401).json({
        success: false,
        error: 'Invalid credentials',
      });
      return;
    }

    const token = signToken(user.id, user.tokenVersion);

    // Neither the hash nor the token version belongs in a response
    const { password: _, tokenVersion: _tv, ...userWithoutPassword } = user;

    res.json({
      success: true,
      data: {
        user: userWithoutPassword,
        token,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
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
        settings: true,
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
    console.error('Me error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user',
    });
  }
};

/**
 * POST /api/auth/forgot-password
 *
 * Always answers the same way, whether or not the address is registered.
 * Anything else turns this into an account-existence oracle — and for a
 * fitness app, "does this person have an account here" is personal.
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
      // Said out loud rather than silently accepted. A deployment with no mail
      // key would otherwise tell every user their link was sent and leave them
      // waiting for a message that was never going to arrive.
      res.status(503).json({
        success: false,
        error: 'Password reset is unavailable right now. Contact support.',
      });
      return;
    }

    const email = normalizeEmail(req.body?.email);
    if (!email) {
      // A malformed address cannot belong to an account, so the honest answer
      // and the safe answer are the same one.
      res.json(accepted);
      return;
    }

    await requestPasswordReset(email, {
      baseUrl: APP_BASE_URL,
      requestIp: req.ip,
    });

    res.json(accepted);
  } catch (error) {
    // Logged, but never surfaced: which addresses fail to send is itself a
    // signal about which addresses exist.
    console.error('forgotPassword error:', error);
    res.json(accepted);
  }
};

/**
 * POST /api/auth/reset-password
 *
 * Consumes the token from the email and sets a new password. Every outstanding
 * session and every other pending link for the account dies with it.
 */
export const resetPassword = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { token, password } = req.body as { token?: string; password?: string };

    if (typeof token !== 'string' || !token.trim()) {
      res.status(400).json({ success: false, error: 'That reset link is invalid or has expired. Request a new one.' });
      return;
    }

    // The same rules registration applies. A reset is not a back door around
    // the password policy.
    const passwordCheck = validatePassword(password);
    if (!passwordCheck.ok) {
      res.status(400).json({ success: false, error: passwordCheck.error });
      return;
    }

    await completePasswordReset(token.trim(), password as string);

    // Deliberately no token in the response. Signing them in off the back of a
    // link in an inbox skips the one thing that proves they know the new
    // password — which is the whole point of having just set it.
    res.json({
      success: true,
      data: { message: 'Password updated. Sign in with your new password.' },
    });
  } catch (error) {
    if (error instanceof ResetError) {
      res.status(400).json({ success: false, error: error.message });
      return;
    }
    console.error('resetPassword error:', error);
    res.status(500).json({ success: false, error: 'Could not reset the password.' });
  }
};
