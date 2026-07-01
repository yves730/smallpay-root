import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../types';
import * as tenantService from '../services/tenant';

export async function createTenant(req: Request, res: Response): Promise<void> {
  try {
    const { nom, prenom, telephone, email } = req.body;

    if (!nom || !prenom || !telephone || !email) {
      res.status(400).json({ error: 'Tous les champs sont requis : nom, prenom, telephone, email' });
      return;
    }

    const tenant = await tenantService.createTenant({ nom, prenom, telephone, email });
    res.status(201).json(tenant);
  } catch (error: any) {
    if (error.message?.includes('existe déjà')) {
      res.status(409).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Erreur lors de la création du tenant' });
  }
}

export async function getProfile(req: AuthenticatedRequest, res: Response): Promise<void> {
  const tenant = req.tenant!;
  const wallet = req.wallet!;
  res.json({
    id: tenant.id,
    nom: tenant.nom,
    prenom: tenant.prenom,
    telephone: tenant.telephone,
    email: tenant.email,
    solde: wallet.solde,
  });
}
