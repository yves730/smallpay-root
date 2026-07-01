import { Response } from 'express';
import prisma from '../config/database';
import * as orangeService from '../services/orange';
import * as orangeCMService from '../services/orangeCM';
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

export async function omInit(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { montant, telephone, return_url, cancel_url, description } = req.body;

    if (!montant || montant <= 0) {
      res.status(400).json({ error: 'Le montant doit être un nombre positif' });
      return;
    }

    if (!telephone) {
      res.status(400).json({ error: 'Le numéro de téléphone est requis' });
      return;
    }

    if (!return_url) {
      res.status(400).json({ error: 'return_url est requis' });
      return;
    }

    const result = await orangeCMService.initPayment({
      amount: String(montant),
      phone_number: telephone,
      return_url,
      cancel_url: cancel_url || return_url,
      description,
    });

    res.json({
      success: true,
      message: 'Paiement initié via Orange Money Cameroon',
      data: result.data,
    });
  } catch (error: any) {
    res.status(502).json({
      error: "Erreur lors de l'appel à l'API Orange Cameroon",
      details: error.response?.data || error.message,
    });
  }
}

export async function omPay(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const {
      notifUrl,
      channelUserMsisdn,
      amount,
      subscriberMsisdn,
      pin,
      orderId,
      description,
      payToken,
    } = req.body;

    const tenantId = req.tenant!.id;

    if (!amount || amount <= 0) {
      res.status(400).json({ error: 'Le montant doit être un nombre positif' });
      return;
    }

    if (!payToken) {
      res.status(400).json({ error: 'payToken est requis' });
      return;
    }

    const commission = amount * 0.01;
    const totalDebit = amount + commission;

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });

    if (!tenant || tenant.solde < totalDebit) {
      res.status(400).json({
        error: 'Solde insuffisant',
        necessaire: totalDebit,
        disponible: tenant?.solde || 0,
      });
      return;
    }

    const transaction = await prisma.transaction.create({
      data: {
        tenantId,
        type: 'CASHOUT',
        montant: amount,
        telephone: subscriberMsisdn,
        statut: 'PENDING',
      },
    });

    try {
      const result = await orangeCMService.makePayment({
        notifUrl,
        channelUserMsisdn,
        amount,
        subscriberMsisdn,
        pin,
        orderId,
        description: description || 'Retrait SmallPay',
        payToken,
      });

      await prisma.$transaction([
        prisma.tenant.update({
          where: { id: tenantId },
          data: { solde: { decrement: totalDebit } },
        }),
        prisma.transaction.update({
          where: { id: transaction.id },
          data: {
            statut: 'SUCCESS',
            referenceExterne: result.data?.payToken || payToken,
            referenceOrange: result.data?.txnid || orderId,
          },
        }),
      ]);

      res.json({
        success: true,
        message: 'Paiement effectué avec succès',
        montant_envoye: amount,
        commission,
        total_debite: totalDebit,
        txnid: result.data?.txnid,
        reference: transaction.id,
      });
    } catch (orangeError: any) {
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: { statut: 'FAILED' },
      });

      res.status(502).json({
        error: "Erreur lors de l'appel à l'API Orange Cameroon",
        details: orangeError.response?.data || orangeError.message,
      });
    }
  } catch (error: any) {
    res.status(500).json({ error: 'Erreur lors du paiement Orange Cameroon' });
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
