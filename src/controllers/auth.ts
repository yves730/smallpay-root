import { Response } from 'express';
import jwt from 'jsonwebtoken';
import { AuthenticatedRequest } from '../types';
import { JWT_EXPIRES_IN, JWT_EXPIRES_IN_SECONDS, JWT_SECRET } from '../config/jwt';

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
    { expiresIn: JWT_EXPIRES_IN }
  );

  res.json({ token, tokenType: 'Bearer', expiresIn: JWT_EXPIRES_IN_SECONDS });
}
