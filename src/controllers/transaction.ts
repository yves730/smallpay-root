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
      res.status(400).json({ error: 'Le montant doit etre un nombre positif' });
      return;
    }

    if (!telephone) {
      res.status(400).json({ error: 'Le numero de telephone est requis' });
      return;
    }

    const log = await prisma.transaction.create({
      data: {
        tenantId,
        categorie: 'CASHIN',
        reseau: 'OM',
        type: 'CASHIN',
        montant,
        telephone,
        statut: 'PENDING',
      },
    });

    try {
      const result = await orangeService.cashin(montant, telephone);

      await prisma.transaction.update({
        where: { id: log.id },
        data: {
          statut: 'SUCCESS',
          payToken: result.pay_token,
          responseData: JSON.stringify(result),
        },
      });

      res.json({
        success: true,
        message: 'paiement initie',
        payment_url: result.payment_url,
        pay_token: result.pay_token,
        reference: log.id,
      });
    } catch (orangeError: any) {
      await prisma.transaction.update({
        where: { id: log.id },
        data: { statut: 'FAILED', responseData: JSON.stringify(orangeError.message) },
      });

      res.status(502).json({
        error: "Erreur lors de l'appel a l'API Orange",
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
      res.status(400).json({ error: 'Le montant doit etre un nombre positif' });
      return;
    }

    if (!telephone) {
      res.status(400).json({ error: 'Le numero de telephone est requis' });
      return;
    }

    const wallet = await prisma.wallet.findUnique({ where: { tenantId } });

    if (!wallet || wallet.solde < montant) {
      res.status(400).json({ error: 'Solde insuffisant' });
      return;
    }

    const log = await prisma.transaction.create({
      data: {
        tenantId,
        categorie: 'CASHOUT',
        reseau: 'OM',
        type: 'CASHOUT',
        montant,
        telephone,
        statut: 'PENDING',
      },
    });

    try {
      const result = await orangeService.cashout(montant, telephone);

      await prisma.$transaction([
        prisma.wallet.update({
          where: { id: wallet.id },
          data: { solde: { decrement: montant } },
        }),
        prisma.transaction.update({
          where: { id: log.id },
          data: {
            statut: 'SUCCESS',
            payToken: result.payToken,
            responseData: JSON.stringify(result),
          },
        }),
      ]);

      res.json({
        success: true,
        message: 'Retrait effectue avec succes',
        reference: log.id,
      });
    } catch (orangeError: any) {
      await prisma.transaction.update({
        where: { id: log.id },
        data: { statut: 'FAILED', responseData: JSON.stringify(orangeError.message) },
      });

      res.status(502).json({
        error: "Erreur lors de l'appel a l'API Orange",
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
    res.status(500).json({ error: 'Erreur lors de la recuperation des transactions' });
  }
}

export async function omInit(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const result = await orangeCMService.initPayment();

    res.json({
      success: true,
      message: result.message,
      data: result.data,
    });
  } catch (error: any) {
    res.status(502).json({
      error: "Erreur lors de l'appel a l'API Orange Cameroon",
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
      res.status(400).json({ error: 'Le montant doit etre un nombre positif' });
      return;
    }

    if (!payToken) {
      res.status(400).json({ error: 'payToken est requis' });
      return;
    }

    const commission = amount * 0.01;
    const totalDebit = amount + commission;

    const wallet = await prisma.wallet.findUnique({ where: { tenantId } });

    if (!wallet || wallet.solde < totalDebit) {
      res.status(400).json({
        error: 'Solde insuffisant',
        necessaire: totalDebit,
        disponible: wallet?.solde || 0,
      });
      return;
    }

    const log = await prisma.transaction.create({
      data: {
        tenantId,
        categorie: 'CASHOUT',
        reseau: 'OM',
        type: 'PAY',
        montant: amount,
        telephone: subscriberMsisdn,
        statut: 'PENDING',
        payToken,
      },
    });

    try {
      await prisma.$transaction([
        prisma.wallet.update({
          where: { id: wallet.id },
          data: { solde: { decrement: totalDebit } },
        }),
        prisma.transaction.update({
          where: { id: log.id },
          data: { responseData: JSON.stringify({ walletDebited: true, totalDebit }) },
        }),
      ]);

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

      await prisma.transaction.update({
        where: { id: log.id },
        data: {
          statut: 'SUCCESS',
          txnid: result.data?.txnid,
          responseData: JSON.stringify({ ...result.data, walletDebited: true, totalDebit }),
        },
      });

      res.json({
        success: true,
        message: 'Paiement effectue avec succes',
        montant_envoye: amount,
        commission,
        total_debite: totalDebit,
        txnid: result.data?.txnid,
        reference: log.id,
      });
    } catch (orangeError: any) {
      await prisma.transaction.update({
        where: { id: log.id },
        data: {
          statut: 'FAILED',
          responseData: JSON.stringify({ error: orangeError.response?.data || orangeError.message, walletDebited: true, totalDebit }),
        },
      });

      res.status(502).json({
        error: "Erreur lors de l'appel a l'API Orange Cameroon",
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
