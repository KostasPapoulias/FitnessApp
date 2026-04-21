import { Response } from 'express';
import { AuthRequest } from '../server.js';

export const getCalendarData = async (_req: AuthRequest, res: Response): Promise<void> => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
};

export const getDayDetail = async (_req: AuthRequest, res: Response): Promise<void> => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
};
