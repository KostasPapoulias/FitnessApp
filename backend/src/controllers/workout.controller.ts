import { Response } from 'express';
import { AuthRequest } from '../server';

// Placeholder controllers for workout routes
export const startSession = async (req: AuthRequest, res: Response): Promise<void> => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
};

export const updateSession = async (req: AuthRequest, res: Response): Promise<void> => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
};

export const finishSession = async (req: AuthRequest, res: Response): Promise<void> => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
};

export const getSessions = async (req: AuthRequest, res: Response): Promise<void> => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
};

export const getSession = async (req: AuthRequest, res: Response): Promise<void> => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
};
