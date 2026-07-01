import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../config/database';
import * as orangeCMService from '../services/orangeCM';
import { AuthenticatedRequest } from '../types';

export async function create(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { reseau, notifUrl, channelUserMsisdn, amount, subscriberMsisdn, pin, orderId, description } = req.body;
    const tenantId = req.tenant!.id;

    if (!amount || amount <= 0) {
      res.status(400).json({ error: 'Le montant doit être un nombre positif' });
      return;
    }

    if (!subscriberMsisdn) {
      res.status(400).json({ error: 'Le numéro de téléphone est requis' });
      return;
    }

    if (!reseau || !['orange', 'mtn'].includes(reseau)) {
      res.status(400).json({ error: 'Le reseau doit être orange ou mtn' });
      return;
    }

    if (reseau === 'mtn') {
      res.status(501).json({ error: 'MTN pas encore implémenté' });
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

    const reference = uuidv4();

    const initLog = await prisma.transaction.create({
      data: {
        tenantId,
        categorie: 'CASHOUT',
        reseau: 'OM',
        type: 'INIT',
        montant: amount,
        telephone: subscriberMsisdn,
        statut: 'PENDING',
        reference,
      },
    });

    try {
      const { payToken } = await orangeCMService.initCashout();

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
          categorie: 'CASHOUT',
          reseau: 'OM',
          type: 'PAY',
          montant: amount,
          telephone: subscriberMsisdn,
          statut: 'PENDING',
          payToken,
          reference,
        },
      });

      const result = await orangeCMService.cashoutPay({
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
        prisma.wallet.update({
          where: { id: wallet.id },
          data: { solde: { decrement: totalDebit } },
        }),
        prisma.transaction.update({
          where: { id: payLog.id },
          data: {
            statut: 'SUCCESS',
            txnid: result.data?.txnid,
            responseData: JSON.stringify(result.data),
          },
        }),
      ]);

      res.json({
        success: true,
        message: 'Retrait effectué avec succès',
        montant_demande: amount,
        commission,
        total_debite: totalDebit,
        reference: payLog.id,
        reference_group: reference,
        reference_orange: {
          payToken: result.data?.payToken || payToken,
          txnid: result.data?.txnid,
          status: result.data?.status,
        },
      });
    } catch (orangeError: any) {
      await prisma.transaction.update({
        where: { id: initLog.id },
        data: { statut: 'FAILED', responseData: JSON.stringify(orangeError.response?.data || orangeError.message) },
      });

      res.status(502).json({
        error: "Erreur lors de l'appel à l'API",
        details: orangeError.response?.data || orangeError.message,
      });
    }
  } catch (error: any) {
    res.status(500).json({ error: 'Erreur lors du retrait' });
  }
}

export async function getStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { payToken } = req.params;
    const reseau = (req.query.reseau as string) || 'orange';

    if (!payToken) {
      res.status(400).json({ error: 'payToken requis' });
      return;
    }

    if (reseau === 'mtn') {
      res.status(501).json({ error: 'MTN pas encore implémenté' });
      return;
    }

    const statusLog = await prisma.transaction.create({
      data: {
        tenantId: req.tenant!.id,
        categorie: 'CASHOUT',
        reseau: 'OM',
        type: 'PAYMENTSTATUS',
        payToken,
        statut: 'PENDING',
      },
    });

    try {
      const result = await orangeCMService.getCashoutPaymentStatus(payToken);

      await prisma.transaction.update({
        where: { id: statusLog.id },
        data: {
          statut: 'SUCCESS',
          responseData: JSON.stringify(result.data),
        },
      });

      res.json({ success: true, reference_orange: result.data, reference: statusLog.id });
    } catch (error: any) {
      await prisma.transaction.update({
        where: { id: statusLog.id },
        data: { statut: 'FAILED', responseData: JSON.stringify(error.response?.data || error.message) },
      });
      throw error;
    }
  } catch (error: any) {
    res.status(502).json({
      error: "Erreur lors de la vérification du statut",
      details: error.response?.data || error.message,
    });
  }
}

export async function push(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { payToken } = req.params;
    const reseau = (req.query.reseau as string) || 'orange';

    if (!payToken) {
      res.status(400).json({ error: 'payToken requis' });
      return;
    }

    if (reseau === 'mtn') {
      res.status(501).json({ error: 'MTN pas encore implémenté' });
      return;
    }

    const pushLog = await prisma.transaction.create({
      data: {
        tenantId: req.tenant!.id,
        categorie: 'CASHOUT',
        reseau: 'OM',
        type: 'CASHOUT_PUSH',
        payToken,
        statut: 'PENDING',
      },
    });

    try {
      const result = await orangeCMService.cashoutPush(payToken);

      await prisma.transaction.update({
        where: { id: pushLog.id },
        data: {
          statut: 'SUCCESS',
          responseData: JSON.stringify(result.data),
        },
      });

      res.json({ success: true, reference_orange: result.data, reference: pushLog.id });
    } catch (error: any) {
      await prisma.transaction.update({
        where: { id: pushLog.id },
        data: { statut: 'FAILED', responseData: JSON.stringify(error.response?.data || error.message) },
      });
      throw error;
    }
  } catch (error: any) {
    res.status(502).json({
      error: "Erreur lors du push",
      details: error.response?.data || error.message,
    });
  }
}
