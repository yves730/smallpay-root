import { randomBytes } from 'crypto';

export const JWT_EXPIRES_IN_SECONDS = 180;
export const JWT_EXPIRES_IN = '3m';

export const JWT_SECRET = process.env.JWT_SECRET || randomBytes(64).toString('hex');

if (!process.env.JWT_SECRET) {
  console.warn('JWT_SECRET non defini. Un secret temporaire a ete genere pour cette instance.');
}
