import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import {
  OrangeCMTokenResponse,
  OrangeCMInitResponse,
  OrangeCMPayRequest,
  OrangeCMPayResponse,
  OrangeCMPaymentResponse,
} from '../types';

const ORANGE_CM_API_BASE_URL = process.env.ORANGE_CM_API_BASE_URL || 'https://api-s1.orange.cm';
const ORANGE_CM_CLIENT_ID = process.env.ORANGE_CM_CLIENT_ID || '';
const ORANGE_CM_CLIENT_SECRET = process.env.ORANGE_CM_CLIENT_SECRET || '';
const ORANGE_CM_MERCHANT_KEY = process.env.ORANGE_CM_MERCHANT_KEY || '';
const ORANGE_CM_BEARER_TOKEN = process.env.ORANGE_CM_BEARER_TOKEN || '';

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (ORANGE_CM_BEARER_TOKEN) {
    return ORANGE_CM_BEARER_TOKEN;
  }

  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.token;
  }

  const auth = Buffer.from(`${ORANGE_CM_CLIENT_ID}:${ORANGE_CM_CLIENT_SECRET}`).toString('base64');

  const response = await axios.post<OrangeCMTokenResponse>(
    `${ORANGE_CM_API_BASE_URL}/omcoreapis/1.0.2/token`,
    'grant_type=client_credentials',
    {
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
    }
  );

  cachedToken = {
    token: response.data.access_token,
    expiresAt: Date.now() + (response.data.expires_in - 60) * 1000,
  };

  return cachedToken.token;
}

function generateReference(): string {
  return `SP-${Date.now()}-${uuidv4().slice(0, 8)}`;
}

function checkFault(data: any): void {
  if (data && data.fault) {
    const err = new Error(data.fault.description || data.fault.message);
    (err as any).code = data.fault.code;
    throw err;
  }
}

export async function initPayment(params: {
  amount: string;
  currency?: string;
  phone_number: string;
  description?: string;
  return_url: string;
  cancel_url: string;
  notif_url?: string;
}): Promise<OrangeCMInitResponse> {
  const token = await getAccessToken();
  const reference = generateReference();
  const orderId = `ORD-${Date.now()}-${uuidv4().slice(0, 6)}`;

  const payload = {
    merchant_key: ORANGE_CM_MERCHANT_KEY,
    amount: params.amount,
    currency: params.currency || 'XOF',
    order_id: orderId,
    phone_number: params.phone_number,
    description: params.description || 'Paiement SmallPay',
    return_url: params.return_url,
    cancel_url: params.cancel_url,
    notif_url: params.notif_url || params.return_url,
    lang: 'fr',
    reference,
  };

  const response = await axios.post<OrangeCMInitResponse>(
    `${ORANGE_CM_API_BASE_URL}/omcoreapis/1.0.2/mp/init`,
    payload,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    }
  );

  return response.data;
}

export async function makePayment(params: OrangeCMPayRequest): Promise<OrangeCMPaymentResponse> {
  const token = await getAccessToken();

  const response = await axios.post<OrangeCMPaymentResponse>(
    `${ORANGE_CM_API_BASE_URL}/omcoreapis/1.0.2/mp/pay`,
    params,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    }
  );

  checkFault(response.data);
  return response.data;
}

export async function initAcashout(): Promise<{ payToken: string }> {
  const token = await getAccessToken();
  const response = await axios.post(
    `${ORANGE_CM_API_BASE_URL}/omcoreapis/1.0.2/acashout/init`,
    {},
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    }
  );
  checkFault(response.data);
  return response.data.data;
}

export async function pushPayment(payToken: string, params?: OrangeCMPayRequest): Promise<OrangeCMPaymentResponse> {
  const token = await getAccessToken();
  const response = await axios.get(
    `${ORANGE_CM_API_BASE_URL}/omcoreapis/1.0.2/mp/push/${payToken}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    }
  );
  checkFault(response.data);
  return response.data;
}

export async function getPaymentStatus(payToken: string): Promise<OrangeCMPaymentResponse> {
  const token = await getAccessToken();
  const response = await axios.get(
    `${ORANGE_CM_API_BASE_URL}/omcoreapis/1.0.2/mp/paymentstatus/${payToken}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    }
  );
  checkFault(response.data);
  return response.data;
}

export async function initCashout(): Promise<{ payToken: string }> {
  const token = await getAccessToken();
  const response = await axios.post(
    `${ORANGE_CM_API_BASE_URL}/omcoreapis/1.0.2/cashout/init`,
    {},
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    }
  );
  checkFault(response.data);
  return response.data.data;
}

export async function cashoutPay(params: OrangeCMPayRequest): Promise<OrangeCMPaymentResponse> {
  const token = await getAccessToken();
  const response = await axios.post(
    `${ORANGE_CM_API_BASE_URL}/omcoreapis/1.0.2/cashout/pay`,
    params,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    }
  );
  checkFault(response.data);
  return response.data;
}

export async function getCashoutPaymentStatus(payToken: string): Promise<OrangeCMPaymentResponse> {
  const token = await getAccessToken();
  const response = await axios.get(
    `${ORANGE_CM_API_BASE_URL}/omcoreapis/1.0.2/cashout/paymentstatus/${payToken}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    }
  );
  checkFault(response.data);
  return response.data;
}

export async function cashoutPush(payToken: string): Promise<OrangeCMPaymentResponse> {
  const token = await getAccessToken();
  const response = await axios.get(
    `${ORANGE_CM_API_BASE_URL}/omcoreapis/1.0.2/cashout/push/${payToken}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    }
  );
  checkFault(response.data);
  return response.data;
}
