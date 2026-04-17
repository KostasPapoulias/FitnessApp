import { Response } from 'express';
import { AuthRequest } from '../server';

export const getProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
};

export const updateProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
};

export const logSleep = async (req: AuthRequest, res: Response): Promise<void> => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
};

export const logNutrition = async (req: AuthRequest, res: Response): Promise<void> => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
};

export const deleteAccount = async (req: AuthRequest, res: Response): Promise<void> => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
};
