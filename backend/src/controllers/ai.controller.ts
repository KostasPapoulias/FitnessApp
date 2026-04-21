import { Response } from 'express';
import { AuthRequest } from '../server';

export const sendMessage = async (_req: AuthRequest, res: Response): Promise<void> => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
};

export const getWorkoutSuggestion = async (_req: AuthRequest, res: Response): Promise<void> => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
};
