import { Response } from 'express';
import prisma from '../config/database';
import * as orangeCMService from '../services/orangeCM';
import { AuthenticatedRequest } from '../types';

export async function create(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { type, notifUrl, channelUserMsisdn, amount, subscriberMsisdn, pin, orderId, description } = req.body;
    const tenantId = req.tenant!.id;

    if (!amount || amount <= 0) {
      res.status(400).json({ error: 'Le montant doit être un nombre positif' });
      return;
    }

    if (!subscriberMsisdn) {
      res.status(400).json({ error: 'Le numéro de téléphone est requis' });
      return;
    }

    if (!type || !['orange', 'mtn'].includes(type)) {
      res.status(400).json({ error: 'Le type doit être orange ou mtn' });
      return;
    }

    if (type === 'mtn') {
      res.status(501).json({ error: 'MTN pas encore implémenté' });
      return;
    }

    const commission = amount * 0.01;
    const creditedAmount = amount - commission;

    const transaction = await prisma.transaction.create({
      data: {
        tenantId,
        type: 'CASHIN',
        montant: amount,
        telephone: subscriberMsisdn,
        statut: 'PENDING',
      },
    });

    try {
      const { payToken } = await orangeCMService.initAcashout();

      const result = await orangeCMService.pushPayment(payToken, {
        notifUrl,
        channelUserMsisdn,
        amount,
        subscriberMsisdn,
        pin,
        orderId,
        description: description || 'Dépôt SmallPay',
        payToken,
      });

      await prisma.$transaction([
        prisma.tenant.update({
          where: { id: tenantId },
          data: { solde: { increment: creditedAmount } },
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
        message: 'Dépôt effectué avec succès',
        montant_demande: amount,
        commission,
        montant_credite: creditedAmount,
        reference_orange: {
          payToken: result.data?.payToken || payToken,
          txnid: result.data?.txnid,
          status: result.data?.status,
        },
        reference: transaction.id,
      });
    } catch (orangeError: any) {
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: { statut: 'FAILED' },
      });

      res.status(502).json({
        error: "Erreur lors de l'appel à l'API",
        details: orangeError.response?.data || orangeError.message,
      });
    }
  } catch (error: any) {
    res.status(500).json({ error: 'Erreur lors du dépôt' });
  }
}

export async function getStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { payToken } = req.params;
    const type = (req.query.type as string) || 'orange';

    if (!payToken) {
      res.status(400).json({ error: 'payToken requis' });
      return;
    }

    if (type === 'mtn') {
      res.status(501).json({ error: 'MTN pas encore implémenté' });
      return;
    }

    const result = await orangeCMService.getPaymentStatus(payToken);
    res.json({ success: true, reference_orange: result.data });
  } catch (error: any) {
    res.status(502).json({
      error: "Erreur lors de la vérification du statut",
      details: error.response?.data || error.message,
    });
  }
}
