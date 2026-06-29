import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../config/database';
import { AuthenticatedRequest } from '../types';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret';

export const authMiddleware = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const apiKey = req.headers['x-api-key'] as string;
  const authHeader = req.headers.authorization as string | undefined;

  if (apiKey) {
    const tenant = await prisma.tenant.findUnique({ where: { apiKey } });

    if (!tenant) {
      res.status(401).json({ error: 'API key invalide' });
      return;
    }

    req.tenant = {
      id: tenant.id,
      apiKey: tenant.apiKey,
      nom: tenant.nom,
      prenom: tenant.prenom,
      email: tenant.email,
      telephone: tenant.telephone,
      solde: tenant.solde,
    };

    next();
    return;
  }

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as {
        sub: string;
        apiKey: string;
        nom: string;
        prenom: string;
        email: string;
        telephone: string;
      };

      const tenant = await prisma.tenant.findUnique({
        where: { id: decoded.sub },
      });

      if (!tenant) {
        res.status(401).json({ error: 'Tenant introuvable' });
        return;
      }

      req.tenant = {
        id: tenant.id,
        apiKey: tenant.apiKey,
        nom: tenant.nom,
        prenom: tenant.prenom,
        email: tenant.email,
        telephone: tenant.telephone,
        solde: tenant.solde,
      };

      next();
      return;
    } catch {
      res.status(401).json({ error: 'Token invalide ou expiré' });
      return;
    }
  }

  res.status(401).json({ error: 'Authentification requise (x-api-key ou Bearer token)' });
};
