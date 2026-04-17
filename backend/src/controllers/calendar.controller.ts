import { Response } from 'express';
import { AuthRequest } from '../server';

export const getCalendarData = async (req: AuthRequest, res: Response): Promise<void> => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
};

export const getDayDetail = async (req: AuthRequest, res: Response): Promise<void> => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
};
