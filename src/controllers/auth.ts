import { Response } from 'express';
import jwt from 'jsonwebtoken';
import { AuthenticatedRequest } from '../types';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret';

export async function login(req: AuthenticatedRequest, res: Response): Promise<void> {
  const apiKey = req.headers['x-api-key'] as string;

  if (!apiKey) {
    res.status(401).json({ error: 'API key requise dans le header x-api-key' });
    return;
  }

  const tenant = req.tenant;

  const token = jwt.sign(
    {
      sub: tenant!.id,
      apiKey: tenant!.apiKey,
      nom: tenant!.nom,
      prenom: tenant!.prenom,
      email: tenant!.email,
      telephone: tenant!.telephone,
    },
    JWT_SECRET,
    { expiresIn: '3m' }
  );

  res.json({ token, expiresIn: 180 });
}
