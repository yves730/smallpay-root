import axios from 'axios';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import {
  OrangeTokenResponse,
  OrangeCashinResponse,
  OrangeCashoutResponse,
  OrangeCashoutRequest,
} from '../types';

const ORANGE_API_BASE_URL = process.env.ORANGE_API_BASE_URL || 'https://api.orange.com';
const ORANGE_CLIENT_ID = process.env.ORANGE_CLIENT_ID || '';
const ORANGE_CLIENT_SECRET = process.env.ORANGE_CLIENT_SECRET || '';
const ORANGE_MERCHANT_NUMBER = process.env.ORANGE_MERCHANT_NUMBER || '';

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.token;
  }

  const auth = Buffer.from(`${ORANGE_CLIENT_ID}:${ORANGE_CLIENT_SECRET}`).toString('base64');

  const response = await axios.post<OrangeTokenResponse>(
    `${ORANGE_API_BASE_URL}/oauth/v2/token`,
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

export async function cashin(
  montant: number,
  telephone: string
): Promise<OrangeCashinResponse> {
  const token = await getAccessToken();
  const reference = generateReference();

  const payload = {
    merchant_key: ORANGE_MERCHANT_NUMBER,
    currency: 'XOF',
    order_id: reference,
    amount: String(montant),
    return_url: process.env.ORANGE_CALLBACK_URL || '',
    cancel_url: process.env.ORANGE_CALLBACK_URL || '',
    notif_url: process.env.ORANGE_CALLBACK_URL || '',
    lang: 'fr',
    reference,
  };

  const response = await axios.post<OrangeCashinResponse>(
    `${ORANGE_API_BASE_URL}/orange-money-webpay/api/v1/webpayment`,
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

export async function cashout(
  montant: number,
  telephone: string,
  description: string = 'Retrait SmallPay'
): Promise<OrangeCashoutResponse> {
  const token = await getAccessToken();
  const reference = generateReference();

  const payload: OrangeCashoutRequest = {
    subscriber_number: telephone,
    amount: String(montant),
    description,
    reference,
  };

  const response = await axios.post<OrangeCashoutResponse>(
    `${ORANGE_API_BASE_URL}/orange-money-webpay/api/v1/transaction`,
    payload,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      }
    }
  );

  return response.data;
}

export async function checkTransactionStatus(referenceOrange: string): Promise<any> {
  const token = await getAccessToken();

  const response = await axios.get(
    `${ORANGE_API_BASE_URL}/orange-money-webpay/api/v1/transactionstatus`,
    {
      params: { reference: referenceOrange },
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    }
  );

  return response.data;
}
