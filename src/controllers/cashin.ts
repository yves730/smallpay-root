import { Response } from 'express';
import prisma from '../config/database';
import * as orangeCMService from '../services/orangeCM';
import { AuthenticatedRequest } from '../types';
import { amountAfterOnePercentFee } from '../utils/amount';

const SMALLPAY_MSISDN = process.env.SMALLPAY_MSISDN || '';
const SMALLPAY_PIN = process.env.SMALLPAY_PIN || '';
const SMALLPAY_NOTIF_URL = process.env.SMALLPAY_NOTIF_URL || '';

function getStatusFromOrangeResponse(data: any): string {
  return String(
    data?.data?.status ||
    data?.status ||
    data?.data?.confirmtxnstatus ||
    data?.confirmtxnstatus ||
    'PENDING'
  ).toUpperCase();
}

function isSuccessStatus(status: string): boolean {
  return ['SUCCESS', 'SUCCESSFUL', 'SUCCEEDED', 'COMPLETED', 'CONFIRMED'].includes(status.toUpperCase());
}

function getPayTokenFromPayload(payload: any): string | undefined {
  return payload?.payToken || payload?.pay_token || payload?.data?.payToken || payload?.data?.pay_token;
}

async function updateCashinPaymentStatus(
  payToken: string,
  payload?: any
): Promise<{ status: string; transactionId: string; creditedAmount: number; walletUpdated: boolean }> {
  const paymentTransaction = await prisma.transaction.findFirst({
    where: {
      categorie: 'CASHIN',
      reseau: 'OM',
      type: 'PAY',
      payToken,
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!paymentTransaction) {
    throw new Error('Transaction cashin introuvable pour ce payToken');
  }

  const statusPayload = payload?.data || payload?.status || payload?.confirmtxnstatus
    ? payload
    : await orangeCMService.getPaymentStatus(payToken);
  const status = getStatusFromOrangeResponse(statusPayload);
  const responseData = paymentTransaction.responseData ? JSON.parse(paymentTransaction.responseData) : null;
  const wasWalletUpdated = Boolean(responseData?.walletUpdated);
  const shouldCreditWallet = isSuccessStatus(status) && paymentTransaction.statut !== 'SUCCESS' && !wasWalletUpdated;
  const creditedAmount = amountAfterOnePercentFee(paymentTransaction.montant || 0);

  if (shouldCreditWallet) {
    await prisma.$transaction([
      prisma.transaction.update({
        where: { id: paymentTransaction.id },
        data: {
          statut: 'SUCCESS',
          txnid: statusPayload?.data?.txnid || paymentTransaction.txnid,
          responseData: JSON.stringify({ ...statusPayload, walletUpdated: true, creditedAmount }),
        },
      }),
      prisma.wallet.upsert({
        where: { tenantId: paymentTransaction.tenantId },
        create: { tenantId: paymentTransaction.tenantId, solde: creditedAmount },
        update: { solde: { increment: creditedAmount } },
      }),
    ]);
  } else {
    await prisma.transaction.update({
      where: { id: paymentTransaction.id },
      data: {
        statut: status,
        txnid: statusPayload?.data?.txnid || paymentTransaction.txnid,
        responseData: JSON.stringify({ ...statusPayload, walletUpdated: wasWalletUpdated, creditedAmount }),
      },
    });
  }

  return { status, transactionId: paymentTransaction.id, creditedAmount, walletUpdated: shouldCreditWallet };
}

async function getLatestCashinPayToken(tenantId: string): Promise<{ payToken: string; initTransactionId: string } | null> {
  const initTransaction = await prisma.transaction.findFirst({
    where: {
      tenantId,
      categorie: 'CASHIN',
      reseau: 'OM',
      type: 'INIT',
      statut: 'SUCCESS',
      payToken: { not: null },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!initTransaction?.payToken) {
    return null;
  }

  return { payToken: initTransaction.payToken, initTransactionId: initTransaction.id };
}

async function getCashinPayTokenFromPayment(
  tenantId: string,
  reference?: string
): Promise<{ payToken: string; paymentTransactionId: string } | null> {
  const paymentTransaction = await prisma.transaction.findFirst({
    where: {
      tenantId,
      categorie: 'CASHIN',
      reseau: 'OM',
      type: 'PAY',
      payToken: { not: null },
      ...(reference ? { id: reference } : {}),
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!paymentTransaction?.payToken) {
    return null;
  }

  return { payToken: paymentTransaction.payToken, paymentTransactionId: paymentTransaction.id };
}

async function initializeCashinTransaction(tenantId: string): Promise<{ payToken: string; initTransactionId: string; result: Awaited<ReturnType<typeof orangeCMService.initPayment>> }> {
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
    const result = await orangeCMService.initPayment();
    const payToken = result.data?.payToken;

    if (!payToken) {
      throw new Error('payToken manquant dans la reponse Orange CM');
    }

    await prisma.transaction.update({
      where: { id: initLog.id },
      data: {
        statut: 'SUCCESS',
        payToken,
        responseData: JSON.stringify(result),
      },
    });

    return { payToken, initTransactionId: initLog.id, result };
  } catch (error: any) {
    await prisma.transaction.update({
      where: { id: initLog.id },
      data: { statut: 'FAILED', responseData: JSON.stringify(error.response?.data || error.fault || error.message) },
    });

    throw error;
  }
}

export async function create(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const init = await initializeCashinTransaction(req.tenant!.id);
    res.json(init.result);
  } catch (error: any) {
    res.status(502).json({
      error: "Erreur lors de l'initialisation du cashin",
      details: error.response?.data || error.fault || error.message,
    });
  }
}

export async function pay(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { amount, description } = req.body;
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

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });

    if (!tenant?.telephone) {
      res.status(400).json({ error: 'Numero de telephone du tenant introuvable' });
      return;
    }

    const subscriberMsisdn = tenant.telephone;
    const channelUserMsisdn = SMALLPAY_MSISDN;
    const pin = SMALLPAY_PIN;
    const notifUrl = SMALLPAY_NOTIF_URL;
    const orderId = `CH-${Date.now()}-${tenantId.slice(0,2)}`;
    const creditedAmount = amountAfterOnePercentFee(amount);

    const init = await initializeCashinTransaction(tenantId);
    const { payToken } = init;

    const payLog = await prisma.transaction.create({
      data: {
        tenantId,
        categorie: 'CASHIN',
        reseau: 'OM',
        type: 'PAY',
        montant: creditedAmount,
        telephone: subscriberMsisdn,
        statut: 'PENDING',
        payToken,
        reference: init.initTransactionId,
      },
    });

    try {
      await prisma.wallet.upsert({
        where: { tenantId },
        create: { tenantId, solde: creditedAmount },
        update: { solde: { increment: creditedAmount } },
      });

      await prisma.transaction.update({
        where: { id: payLog.id },
        data: { responseData: JSON.stringify({ walletUpdated: true, creditedAmount }) },
      });

      const result = await orangeCMService.makePayment({
        subscriberMsisdn,
        notifUrl,
        channelUserMsisdn,
        amount: creditedAmount,
        pin,
        orderId,
        description,
        payToken,
      });

      await prisma.transaction.update({
        where: { id: payLog.id },
        data: {
          statut: 'SUCCESS',
          txnid: result.data?.txnid,
          responseData: JSON.stringify({ ...result.data, walletUpdated: true, creditedAmount }),
        },
      });

      res.json({ ...result, reference: payLog.id, creditedAmount, walletUpdated: true });
    } catch (error: any) {
      await prisma.transaction.update({
        where: { id: payLog.id },
        data: {
          statut: 'FAILED',
          responseData: JSON.stringify({ error: error.response?.data || error.fault || error.message, walletUpdated: true, creditedAmount }),
        },
      });
      throw error;
    }
  } catch (error: any) {
    res.status(502).json({
      error: "Erreur lors du paiement",
      details: error.response?.data || error.fault || error.message,
    });
  }
}

export async function push(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenant!.id;
    const { reference } = req.params;
    const reseau = (req.query.reseau as string) || 'orange';

    if (reseau === 'mtn') {
      res.status(501).json({ error: 'MTN pas encore implémenté' });
      return;
    }

    const payment = await getCashinPayTokenFromPayment(tenantId, reference);

    if (!payment) {
      res.status(400).json({ error: 'Aucun paiement cashin trouvé. Lancez d’abord /api/cashin/pay.' });
      return;
    }

    const { payToken } = payment;

    const pushLog = await prisma.transaction.create({
      data: {
        tenantId,
        categorie: 'CASHIN',
        reseau: 'OM',
        type: 'PUSH',
        payToken,
        statut: 'PENDING',
        reference: payment.paymentTransactionId,
      },
    });

    try {
      const result = await orangeCMService.pushPayment(payToken);

      await prisma.transaction.update({
        where: { id: pushLog.id },
        data: {
          statut: result.data?.status || 'SUCCESS',
          txnid: result.data?.txnid,
          responseData: JSON.stringify(result),
        },
      });

      res.json(result);
    } catch (error: any) {
      await prisma.transaction.update({
        where: { id: pushLog.id },
        data: { statut: 'FAILED', responseData: JSON.stringify(error.response?.data || error.fault || error.message) },
      });
      throw error;
    }
  } catch (error: any) {
    res.status(502).json({
      error: "Erreur lors du push",
      details: error.response?.data || error.fault || error.message,
    });
  }
}

export async function getStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenant!.id;
    const { reference } = req.params;
    const reseau = (req.query.reseau as string) || 'orange';

    if (reseau === 'mtn') {
      res.status(501).json({ error: 'MTN pas encore implémenté' });
      return;
    }

    const payment = await getCashinPayTokenFromPayment(tenantId, reference);

    if (!payment) {
      res.status(400).json({ error: 'Aucun paiement cashin trouvé. Lancez d’abord /api/cashin/pay.' });
      return;
    }

    const { payToken } = payment;

    const statusLog = await prisma.transaction.create({
      data: {
        tenantId,
        categorie: 'CASHIN',
        reseau: 'OM',
        type: 'PAYMENTSTATUS',
        payToken,
        statut: 'PENDING',
        reference: payment.paymentTransactionId,
      },
    });

    try {
      const result = await orangeCMService.getPaymentStatus(payToken);
      await updateCashinPaymentStatus(payToken, result);

      await prisma.transaction.update({
        where: { id: statusLog.id },
        data: {
          statut: result.data?.status || 'SUCCESS',
          txnid: result.data?.txnid,
          responseData: JSON.stringify(result),
        },
      });

      res.json(result);
    } catch (error: any) {
      await prisma.transaction.update({
        where: { id: statusLog.id },
        data: { statut: 'FAILED', responseData: JSON.stringify(error.response?.data || error.fault || error.message) },
      });
      throw error;
    }
  } catch (error: any) {
    res.status(502).json({
      error: "Erreur lors de la vérification du statut",
      details: error.response?.data || error.fault || error.message,
    });
  }
}

export async function callback(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const payToken = getPayTokenFromPayload(req.body) || getPayTokenFromPayload(req.query);

    if (!payToken) {
      res.status(400).json({ error: 'payToken requis' });
      return;
    }

    const result = await updateCashinPaymentStatus(payToken, req.body);

    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({
      error: 'Erreur lors du traitement du callback cashin',
      details: error.response?.data || error.fault || error.message,
    });
  }
}
