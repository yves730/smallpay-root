import { Response } from 'express';
import prisma from '../config/database';
import * as orangeService from '../services/orange';
import * as orangeCMService from '../services/orangeCM';
import { AuthenticatedRequest, TransactionRequest } from '../types';

function buildTransactionFilters(query: any, tenantId?: string): any {
  const { categorie, reseau, dateDebut, dateFin } = query;
  const statut = query.statut || query.status;
  const where: any = {};

  if (tenantId) {
    where.tenantId = tenantId;
  }

  if (categorie) {
    where.categorie = String(categorie).toUpperCase();
  }

  if (statut) {
    where.statut = String(statut).toUpperCase();
  }

  if (reseau) {
    where.reseau = String(reseau).toUpperCase();
  }

  if (dateDebut || dateFin) {
    where.createdAt = {};

    if (dateDebut) {
      where.createdAt.gte = new Date(String(dateDebut));
    }

    if (dateFin) {
      where.createdAt.lte = new Date(String(dateFin));
    }
  }

  return where;
}

function getPagination(query: any): { skip: number; take: number; page: number; limit: number } {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 200);

  return { page, limit, skip: (page - 1) * limit, take: limit };
}


export async function getTransactions(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const where = buildTransactionFilters(req.query);
    const { skip, take, page, limit } = getPagination(req.query);

    const [transactions, total] = await prisma.$transaction([
      prisma.transaction.findMany({
        where,
        include: {
          tenant: {
            select: { id: true, nom: true, prenom: true, telephone: true, email: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.transaction.count({ where }),
    ]);

    res.json({ transactions, pagination: { total, page, limit } });
  } catch (error: any) {
    res.status(500).json({ error: 'Erreur lors de la recuperation des transactions' });
  }
}

export async function getTenantTransactions(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { tenantId } = req.params;

    if (!tenantId) {
      res.status(400).json({ error: 'tenantId requis' });
      return;
    }

    const where = buildTransactionFilters(req.query, tenantId);
    const { skip, take, page, limit } = getPagination(req.query);

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        nom: true,
        prenom: true,
        telephone: true,
        email: true,
        wallet: true,
      },
    });

    if (!tenant) {
      res.status(404).json({ error: 'Tenant introuvable' });
      return;
    }

    const [transactions, total] = await prisma.$transaction([
      prisma.transaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.transaction.count({ where }),
    ]);

    res.json({ tenant, transactions, pagination: { total, page, limit } });
  } catch (error: any) {
    res.status(500).json({ error: 'Erreur lors de la recuperation des transactions du tenant' });
  }
}

export async function getWallets(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const wallets = await prisma.wallet.findMany({
      include: {
        tenant: {
          select: { id: true, nom: true, prenom: true, telephone: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ wallets });
  } catch (error: any) {
    res.status(500).json({ error: 'Erreur lors de la recuperation des wallets' });
  }
}

export async function getWalletByTenant(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { tenantId } = req.params;

    if (!tenantId) {
      res.status(400).json({ error: 'tenantId requis' });
      return;
    }

    const wallet = await prisma.wallet.findUnique({
      where: { tenantId },
      include: {
        tenant: {
          select: { id: true, nom: true, prenom: true, telephone: true, email: true },
        },
      },
    });

    if (!wallet) {
      res.status(404).json({ error: 'Wallet introuvable pour ce tenant' });
      return;
    }

    res.json({ wallet });
  } catch (error: any) {
    res.status(500).json({ error: 'Erreur lors de la recuperation du wallet' });
  }
}

export async function getTransactionStats(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const where = buildTransactionFilters(req.query);
    const [grouped, totalAmount] = await prisma.$transaction([
      prisma.transaction.groupBy({
        by: ['statut'],
        where,
        _count: { _all: true },
        _sum: { montant: true },
      }),
      prisma.transaction.aggregate({
        where,
        _count: { _all: true },
        _sum: { montant: true },
      }),
    ]);

    const statsByStatus = grouped.reduce((acc: any, item) => {
      acc[item.statut] = {
        count: item._count._all,
        montant: item._sum.montant || 0,
      };
      return acc;
    }, {});

    res.json({
      filters: {
        categorie: req.query.categorie || null,
        status: req.query.status || req.query.statut || null,
        reseau: req.query.reseau || null,
        dateDebut: req.query.dateDebut || null,
        dateFin: req.query.dateFin || null,
      },
      total: {
        count: totalAmount._count._all,
        montant: totalAmount._sum.montant || 0,
      },
      statuts: statsByStatus,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Erreur lors du calcul des statistiques' });
  }
}


export async function handleCallback(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { status, reference, pay_token } = req.body;

    if (!reference && !pay_token) {
      res.status(400).json({ error: 'Reference manquante' });
      return;
    }

    const transaction = await prisma.transaction.findFirst({
      where: {
        OR: [
          { payToken: pay_token },
          { id: reference },
        ],
      },
    });

    if (!transaction) {
      res.status(404).json({ error: 'Transaction introuvable' });
      return;
    }

    const newStatus = status === 'SUCCESS' ? 'SUCCESS' : 'FAILED';

    await prisma.transaction.update({
      where: { id: transaction.id },
      data: { statut: newStatus },
    });

    if (newStatus === 'SUCCESS' && transaction.categorie === 'CASHIN' && transaction.montant) {
      const wallet = await prisma.wallet.findUnique({ where: { tenantId: transaction.tenantId } });
      if (wallet) {
        await prisma.wallet.update({
          where: { id: wallet.id },
          data: { solde: { increment: transaction.montant } },
        });
      }
    }

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: 'Erreur lors du traitement du callback' });
  }
}
