import { Response } from 'express';
import { AuthRequest } from '../server';

export const getCurrentFatigue = async (req: AuthRequest, res: Response): Promise<void> => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
};

export const updateFatigue = async (req: AuthRequest, res: Response): Promise<void> => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
};

export const recalculateFatigue = async (req: AuthRequest, res: Response): Promise<void> => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
};
