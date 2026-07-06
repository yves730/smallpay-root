import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../config/database';
import * as orangeCMService from '../services/orangeCM';
import { AuthenticatedRequest } from '../types';
import { amountAfterOnePercentFee } from '../utils/amount';

const SMALLPAY_MSISDN = process.env.SMALLPAY_MSISDN || '';
const SMALLPAY_PIN = process.env.SMALLPAY_PIN || '';
const SMALLPAY_NOTIF_URL = process.env.SMALLPAY_NOTIF_URL || '';

function getCashinStatusFromOrangeResponse(data: any): string {
  return String(
    data?.data?.status ||
    data?.status ||
    data?.data?.confirmtxnstatus ||
    data?.confirmtxnstatus ||
    'PENDING'
  ).toUpperCase();
}

function isCashinSuccessStatus(status: string): boolean {
  return ['SUCCESS', 'SUCCESSFUL', 'SUCCEEDED', 'COMPLETED', 'CONFIRMED'].includes(status.toUpperCase());
}

function getCashinPayTokenFromPayload(payload: any): string | undefined {
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
  const status = getCashinStatusFromOrangeResponse(statusPayload);
  const responseData = paymentTransaction.responseData ? JSON.parse(paymentTransaction.responseData) : null;
  const wasWalletUpdated = Boolean(responseData?.walletUpdated);
  const shouldCreditWallet = isCashinSuccessStatus(status) && paymentTransaction.statut !== 'SUCCESS' && !wasWalletUpdated;
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
    const { reseau, amount, subscriberMsisdn, description } = req.body;
    const tenantId = req.tenant!.id;

    if (!amount || amount <= 0) {
      res.status(400).json({ error: 'Le montant doit être un nombre positif' });
      return;
    }

    if (!subscriberMsisdn) {
      res.status(400).json({ error: 'Le numéro de téléphone est requis' });
      return;
    }

     if (!SMALLPAY_NOTIF_URL) {
      res.status(500).json({ error: 'SMALLPAY_NOTIF_URL non configure' });
      return;
    }
     if (!SMALLPAY_PIN) {
      res.status(500).json({ error: 'SMALLPAY_PIN non configure' });
      return;
    }
    if (!SMALLPAY_MSISDN) {
      res.status(500).json({ error: 'SMALLPAY_MSISDN non configure' });
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

    const creditedAmount = amountAfterOnePercentFee(amount);

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

    let payLogId: string | undefined;

    try {
      const { payToken } = await orangeCMService.initCashout();
      console.log('==> ' ,payToken);

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
      payLogId = payLog.id;

      await prisma.$transaction([
        prisma.wallet.upsert({
          where: { tenantId },
          create: { tenantId, solde: creditedAmount },
          update: { solde: { increment: creditedAmount } },
        }),
        prisma.transaction.update({
          where: { id: payLog.id },
          data: { responseData: JSON.stringify({ walletUpdated: true, creditedAmount }) },
        }),
      ]);

      const notifUrl = SMALLPAY_NOTIF_URL;
      const pin = SMALLPAY_PIN;
       const orderId = `CO-${Date.now()}-${tenantId.slice(0,2)}`;
      const result = await orangeCMService.cashoutPay({
        notifUrl,
        channelUserMsisdn: SMALLPAY_MSISDN,
        amount,
        subscriberMsisdn,
        pin,
        orderId,
        description: description || 'Cashout SmallPay',
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

      res.json({
        success: true,
        message: 'Cashout effectué avec succès',
        montant_demande: amount,
        commission: amount - creditedAmount,
        montant_credite: creditedAmount,
        reference: payLog.id,
        reference_group: reference,
        reference_orange: {
          payToken: result.data?.payToken || payToken,
          txnid: result.data?.txnid,
          status: result.data?.status,
          response: result,
        },
      });
    } catch (orangeError: any) {
      await prisma.transaction.update({
        where: { id: payLogId || initLog.id },
        data: {
          statut: 'FAILED',
          responseData: JSON.stringify({
            error: orangeError.response?.data || orangeError.message,
            ...(payLogId ? { walletUpdated: true, creditedAmount } : {}),
          }),
        },
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
    const { id_transaction } = req.params;
    const tenantId = req.tenant!.id;
    const reseau = (req.query.reseau as string) || 'orange';

    if (!id_transaction) {
      res.status(400).json({ error: 'id_transaction requis' });
      return;
    }

    if (reseau === 'mtn') {
      res.status(501).json({ error: 'MTN pas encore implémenté' });
      return;
    }

    const paymentTransaction = await prisma.transaction.findFirst({
      where: {
        id: id_transaction,
        tenantId,
        categorie: 'CASHOUT',
        reseau: 'OM',
        payToken: { not: null },
      },
    });

    const payToken = paymentTransaction?.payToken;

    if (!payToken) {
      res.status(404).json({ error: 'Transaction cashout introuvable ou payToken manquant' });
      return;
    }

    const statusLog = await prisma.transaction.create({
      data: {
        tenantId,
        categorie: 'CASHOUT',
        reseau: 'OM',
        type: 'PAYMENTSTATUS',
        payToken,
        statut: 'PENDING',
        reference: paymentTransaction.id,
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
    const { id_transaction } = req.params;
    const tenantId = req.tenant!.id;
    const reseau = (req.query.reseau as string) || 'orange';

    if (!id_transaction) {
      res.status(400).json({ error: 'id_transaction requis' });
      return;
    }

    if (reseau === 'mtn') {
      res.status(501).json({ error: 'MTN pas encore implémenté' });
      return;
    }

    const paymentTransaction = await prisma.transaction.findFirst({
      where: {
        id: id_transaction,
        tenantId,
        categorie: 'CASHOUT',
        reseau: 'OM',
        payToken: { not: null },
      },
    });

    const payToken = paymentTransaction?.payToken;

    if (!payToken) {
      res.status(404).json({ error: 'Transaction cashout introuvable ou payToken manquant' });
      return;
    }

    const pushLog = await prisma.transaction.create({
      data: {
        tenantId,
        categorie: 'CASHOUT',
        reseau: 'OM',
        type: 'CASHOUT_PUSH',
        payToken,
        statut: 'PENDING',
        reference: paymentTransaction.id,
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

export async function cashinCreate(req: AuthenticatedRequest, res: Response): Promise<void> {
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

export async function cashinPay(req: AuthenticatedRequest, res: Response): Promise<void> {
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

export async function cashinPush(req: AuthenticatedRequest, res: Response): Promise<void> {
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

export async function cashinGetStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
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

export async function cashinCallback(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const payToken = getCashinPayTokenFromPayload(req.body) || getCashinPayTokenFromPayload(req.query);

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
