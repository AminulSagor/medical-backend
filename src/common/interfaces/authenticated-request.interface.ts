import type { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    role: string;
    medicalEmail: string;
    [key: string]: unknown;
  };
}
