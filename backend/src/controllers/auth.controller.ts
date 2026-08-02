import { Response } from 'express';
import bcrypt from 'bcrypt';
import { JWT_SECRET, JWT_EXPIRES_IN } from '../lib/env';
import { normalizeEmail, validatePassword } from '../services/credentials.service';
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
        error: 'User already exists',
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
