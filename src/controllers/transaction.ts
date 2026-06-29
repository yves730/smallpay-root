import { Response } from 'express';
import prisma from '../config/database';
import * as orangeService from '../services/orange';
import { AuthenticatedRequest, TransactionRequest } from '../types';

export async function cashin(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { montant, telephone } = req.body as TransactionRequest;
    const tenantId = req.tenant!.id;

    if (!montant || montant <= 0) {
      res.status(400).json({ error: 'Le montant doit être un nombre positif' });
      return;
    }

    if (!telephone) {
      res.status(400).json({ error: 'Le numéro de téléphone est requis' });
      return;
    }

    const transaction = await prisma.transaction.create({
      data: {
        tenantId,
        type: 'CASHIN',
        montant,
        telephone,
        statut: 'PENDING',
      },
    });

    try {
      const result = await orangeService.cashin(montant, telephone);

      await prisma.transaction.update({
        where: { id: transaction.id },
        data: {
          statut: 'SUCCESS',
          referenceExterne: result.pay_token,
          referenceOrange: result.payment_url,
        },
      });

      res.json({
        success: true,
        message: ' paiement initié',
        payment_url: result.payment_url,
        pay_token: result.pay_token,
        reference: transaction.id,
      });
    } catch (orangeError: any) {
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: { statut: 'FAILED' },
      });

      res.status(502).json({
        error: 'Erreur lors de l\'appel à l\'API Orange',
        details: orangeError.message,
      });
    }
  } catch (error: any) {
    res.status(500).json({ error: 'Erreur lors du cashin' });
  }
}

export async function cashout(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { montant, telephone } = req.body as TransactionRequest;
    const tenantId = req.tenant!.id;

    if (!montant || montant <= 0) {
      res.status(400).json({ error: 'Le montant doit être un nombre positif' });
      return;
    }

    if (!telephone) {
      res.status(400).json({ error: 'Le numéro de téléphone est requis' });
      return;
    }

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });

    if (!tenant || tenant.solde < montant) {
      res.status(400).json({ error: 'Solde insuffisant' });
      return;
    }

    const transaction = await prisma.transaction.create({
      data: {
        tenantId,
        type: 'CASHOUT',
        montant,
        telephone,
        statut: 'PENDING',
      },
    });

    try {
      const result = await orangeService.cashout(montant, telephone);

      await prisma.$transaction([
        prisma.tenant.update({
          where: { id: tenantId },
          data: { solde: { decrement: montant } },
        }),
        prisma.transaction.update({
          where: { id: transaction.id },
          data: {
            statut: 'SUCCESS',
            referenceExterne: result.reference,
            referenceOrange: result.payToken,
          },
        }),
      ]);

      res.json({
        success: true,
        message: 'Retrait effectué avec succès',
        reference: transaction.id,
      });
    } catch (orangeError: any) {
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: { statut: 'FAILED' },
      });

      res.status(502).json({
        error: 'Erreur lors de l\'appel à l\'API Orange',
        details: orangeError.message,
      });
    }
  } catch (error: any) {
    res.status(500).json({ error: 'Erreur lors du cashout' });
  }
}

export async function getTransactions(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenant!.id;

    const transactions = await prisma.transaction.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    res.json({ transactions });
  } catch (error: any) {
    res.status(500).json({ error: 'Erreur lors de la récupération des transactions' });
  }
}

export async function handleCallback(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { status, reference, pay_token } = req.body;

    if (!reference && !pay_token) {
      res.status(400).json({ error: 'Référence manquante' });
      return;
    }

    const transaction = await prisma.transaction.findFirst({
      where: {
        OR: [
          { referenceExterne: pay_token },
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

    if (newStatus === 'SUCCESS' && transaction.type === 'CASHIN') {
      await prisma.tenant.update({
        where: { id: transaction.tenantId },
        data: { solde: { increment: transaction.montant } },
      });
    }

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: 'Erreur lors du traitement du callback' });
  }
}
