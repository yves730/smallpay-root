import { Response } from 'express';
import prisma from '../config/database';
import * as orangeCMService from '../services/orangeCM';
import { AuthenticatedRequest } from '../types';

const SMALLPAY_MSISDN = process.env.SMALLPAY_MSISDN || '';
const SMALLPAY_PIN = process.env.SMALLPAY_PIN || '';
const SMALLPAY_NOTIF_URL = process.env.SMALLPAY_NOTIF_URL || '';

export async function create(req: AuthenticatedRequest, res: Response): Promise<void> {
  const tenantId = req.tenant!.id;

  const initLog = await prisma.transaction.create({
    data: {
      tenantId,
      categorie: 'CASHIN',
      reseau: 'OM',
      type: 'INIT',
      statut: 'PENDING',
    },
  });

  try {
    const { payToken } = await orangeCMService.initCashin();

    await prisma.transaction.update({
      where: { id: initLog.id },
      data: {
        statut: 'SUCCESS',
        payToken,
        responseData: JSON.stringify({ payToken }),
      },
    });

    res.json({ success: true, payToken, reference: initLog.id });
  } catch (error: any) {
    await prisma.transaction.update({
      where: { id: initLog.id },
      data: { statut: 'FAILED', responseData: JSON.stringify(error.response?.data || error.fault || error.message) },
    });

    res.status(502).json({
      error: "Erreur lors de l'initialisation du cashin",
      details: error.response?.data || error.fault || error.message,
    });
  }
}

export async function pay(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { amount, subscriberMsisdn, description } = req.body;
    const tenantId = req.tenant!.id;

    if (!amount || amount <= 0) {
      res.status(400).json({ error: 'Le montant doit être un nombre positif' });
      return;
    }

    if (!SMALLPAY_MSISDN) {
      res.status(500).json({ error: 'SMALLPAY_MSISDN non configure' });
      return;
    }

    if (!SMALLPAY_PIN) {
      res.status(500).json({ error: 'SMALLPAY_PIN non configure' });
      return;
    }

    if (!SMALLPAY_NOTIF_URL) {
      res.status(500).json({ error: 'SMALLPAY_NOTIF_URL non configure' });
      return;
    }

    if (!subscriberMsisdn) {
      res.status(400).json({ error: 'subscriberMsisdn est requis' });
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

    const initLog = await prisma.transaction.create({
      data: {
        tenantId,
        categorie: 'CASHIN',
        reseau: 'OM',
        type: 'INIT',
        statut: 'PENDING',
      },
    });

    let payLogId: string | undefined;

    try {
      const { payToken } = await orangeCMService.initCashin();

      await prisma.transaction.update({
        where: { id: initLog.id },
        data: {
          statut: 'SUCCESS',
          payToken,
          responseData: JSON.stringify({ payToken }),
        },
      });

      const payLog = await prisma.transaction.create({
        data: {
          tenantId,
          categorie: 'CASHIN',
          reseau: 'OM',
          type: 'PAY',
          montant: amount,
          telephone: subscriberMsisdn,
          statut: 'PENDING',
          payToken,
          reference: initLog.id,
        },
      });
      payLogId = payLog.id;

      await prisma.$transaction([
        prisma.wallet.update({
          where: { id: wallet.id },
          data: { solde: { decrement: totalDebit } },
        }),
        prisma.transaction.update({
          where: { id: payLog.id },
          data: { responseData: JSON.stringify({ walletDebited: true, totalDebit }) },
        }),
      ]);
      const orderId = `CI-${Date.now()}-${tenantId.slice(0,2)}`;

      const result = await orangeCMService.cashinPay({
        channelUserMsisdn: SMALLPAY_MSISDN,
        notifUrl: SMALLPAY_NOTIF_URL,
        amount,
        subscriberMsisdn,
        pin: SMALLPAY_PIN,
        orderId,
        description: description || 'Cashin SmallPay',
        payToken,
      });

      await prisma.transaction.update({
        where: { id: payLog.id },
        data: {
          statut: 'SUCCESS',
          txnid: result.data?.txnid,
          responseData: JSON.stringify({ ...result.data, walletDebited: true, totalDebit }),
        },
      });

      res.json({
        ...result,
        reference: payLog.id,
        montant_demande: amount,
        commission,
        total_debite: totalDebit,
      });
    } catch (error: any) {
      await prisma.transaction.update({
        where: { id: payLogId || initLog.id },
        data: {
          statut: 'FAILED',
          responseData: JSON.stringify({
            error: error.response?.data || error.fault || error.message,
            ...(payLogId ? { walletDebited: true, totalDebit } : {}),
          }),
        },
      });
      throw error;
    }
  } catch (error: any) {
    res.status(502).json({
      error: "Erreur lors du paiement cashin",
      details: error.response?.data || error.fault || error.message,
    });
  }
}

export async function getStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id_transaction } = req.params;
    const tenantId = req.tenant!.id;

    if (!id_transaction) {
      res.status(400).json({ error: 'id_transaction requis' });
      return;
    }

    const paymentTransaction = await prisma.transaction.findFirst({
      where: {
        id: id_transaction,
        tenantId,
        categorie: 'CASHIN',
        reseau: 'OM',
        payToken: { not: null },
      },
    });

    const payToken = paymentTransaction?.payToken;

    if (!payToken) {
      res.status(404).json({ error: 'Transaction cashin introuvable ou payToken manquant' });
      return;
    }

    const statusLog = await prisma.transaction.create({
      data: {
        tenantId,
        categorie: 'CASHIN',
        reseau: 'OM',
        type: 'PAYMENTSTATUS',
        payToken,
        statut: 'PENDING',
        reference: paymentTransaction.id,
      },
    });

    try {
      const result = await orangeCMService.getCashinPaymentStatus(payToken);

      await prisma.transaction.update({
        where: { id: statusLog.id },
        data: {
          statut: result.data?.status || 'SUCCESS',
          txnid: result.data?.txnid,
          responseData: JSON.stringify(result.data),
        },
      });

      res.json({ success: true, reference_orange: result.data, reference: statusLog.id });
    } catch (error: any) {
      await prisma.transaction.update({
        where: { id: statusLog.id },
        data: { statut: 'FAILED', responseData: JSON.stringify(error.response?.data || error.fault || error.message) },
      });
      throw error;
    }
  } catch (error: any) {
    res.status(502).json({
      error: "Erreur lors de la vérification du statut cashin",
      details: error.response?.data || error.fault || error.message,
    });
  }
}
