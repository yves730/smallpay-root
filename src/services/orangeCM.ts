import axios from 'axios';
import {
  OrangeCMTokenResponse,
  OrangeCMInitTokenResponse,
  OrangeCMCashinPayRequest,
  OrangeCMCashinPaymentResponse,
  OrangeCMPayRequest,
  OrangeCMPaymentResponse,
} from '../types';

const ORANGE_CM_API_BASE_URL = process.env.ORANGE_CM_API_BASE_URL || 'https://api-s1.orange.cm';
const ORANGE_CM_CLIENT_ID = process.env.ORANGE_CM_CLIENT_ID || '';
const ORANGE_CM_CLIENT_SECRET = process.env.ORANGE_CM_CLIENT_SECRET || '';
const ORANGE_CM_API_ORIGIN = new URL(ORANGE_CM_API_BASE_URL).origin;
const ORANGE_CM_X_AUTH_TOKEN = process.env.ORANGE_CM_X_AUTH_TOKEN || '';

let cachedToken: { token: string; expiresAt: number } | null = null;

export async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.token;
  }

  const response = await axios.post<OrangeCMTokenResponse>(
    `${ORANGE_CM_API_ORIGIN}/token`,
    'grant_type=client_credentials',
    {
      auth: {
        username: ORANGE_CM_CLIENT_ID,
        password: ORANGE_CM_CLIENT_SECRET,
      },
      headers: {
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

function checkFault(data: any): void {
  if (data && data.fault) {
    const err = new Error(data.fault.description || data.fault.message);
    (err as any).code = data.fault.code;
    (err as any).fault = data.fault;
    throw err;
  }
}

export async function initPayment(): Promise<OrangeCMInitTokenResponse> {
  const token = await getAccessToken();

  const response = await axios.post<OrangeCMInitTokenResponse>(
    `${ORANGE_CM_API_ORIGIN}/omcoreapis/1.0.2/mp/init`,
    null,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-AUTH-TOKEN': ORANGE_CM_X_AUTH_TOKEN,
        Accept: 'application/json',
      },
    }
  );

  checkFault(response.data);
  return response.data;
}

export async function makePayment(params: OrangeCMPayRequest): Promise<OrangeCMPaymentResponse> {
  const token = await getAccessToken();

  const response = await axios.post<OrangeCMPaymentResponse>(
    `${ORANGE_CM_API_ORIGIN}/omcoreapis/1.0.2/mp/pay`,
    params,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-AUTH-TOKEN': ORANGE_CM_X_AUTH_TOKEN,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    }
  );

  checkFault(response.data);
  return response.data;
}

export async function initAcashout(): Promise<{ payToken: string }> {
  const response = await initPayment();
  return response.data;
}

export async function pushPayment(payToken: string): Promise<OrangeCMPaymentResponse> {
  const token = await getAccessToken();
  const response = await axios.get(
    `${ORANGE_CM_API_ORIGIN}/omcoreapis/1.0.2/mp/push/${payToken}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-AUTH-TOKEN': ORANGE_CM_X_AUTH_TOKEN,
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
    `${ORANGE_CM_API_ORIGIN}/omcoreapis/1.0.2/mp/paymentstatus/${payToken}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-AUTH-TOKEN': ORANGE_CM_X_AUTH_TOKEN,
        Accept: 'application/json',
      },
    }
  );
  checkFault(response.data);
  return response.data;
}

export async function initCashout(): Promise<{ payToken: string }> {
  const token = await getAccessToken();

  const response = await axios.post<OrangeCMInitTokenResponse>(
    `${ORANGE_CM_API_ORIGIN}/omcoreapis/1.0.2/cashout/init`,
    null,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-AUTH-TOKEN': ORANGE_CM_X_AUTH_TOKEN,
        Accept: 'application/json',
      },
    }
  );

  checkFault(response.data);
  return response.data.data;
}

export async function initCashin(): Promise<{ payToken: string }> {
  const token = await getAccessToken();

  const response = await axios.post<OrangeCMInitTokenResponse>(
    `${ORANGE_CM_API_ORIGIN}/omcoreapis/1.0.2/cashin/init`,
    null,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-AUTH-TOKEN': ORANGE_CM_X_AUTH_TOKEN,
        Accept: 'application/json',
      },
    }
  );

  checkFault(response.data);
  return response.data.data;
}

export async function cashinPay(params: OrangeCMCashinPayRequest): Promise<OrangeCMCashinPaymentResponse> {
  const token = await getAccessToken();

  const response = await axios.post<OrangeCMCashinPaymentResponse>(
    `${ORANGE_CM_API_ORIGIN}/omcoreapis/1.0.2/cashin/pay`,
    params,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-AUTH-TOKEN': ORANGE_CM_X_AUTH_TOKEN,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    }
  );

  checkFault(response.data);
  return response.data;
}

export async function getCashinPaymentStatus(payToken: string): Promise<OrangeCMCashinPaymentResponse> {
  const token = await getAccessToken();

  const response = await axios.get<OrangeCMCashinPaymentResponse>(
    `${ORANGE_CM_API_ORIGIN}/omcoreapis/1.0.2/cashin/paymentstatus/${payToken}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-AUTH-TOKEN': ORANGE_CM_X_AUTH_TOKEN,
        Accept: 'application/json',
      },
    }
  );

  checkFault(response.data);
  return response.data;
}

export async function cashoutPay(params: OrangeCMPayRequest): Promise<OrangeCMPaymentResponse> {
  const token = await getAccessToken();
  const response = await axios.post(
    `${ORANGE_CM_API_ORIGIN}/omcoreapis/1.0.2/cashout/pay`,
    params,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-AUTH-TOKEN': ORANGE_CM_X_AUTH_TOKEN,
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
    `${ORANGE_CM_API_ORIGIN}/omcoreapis/1.0.2/cashout/paymentstatus/${payToken}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-AUTH-TOKEN': ORANGE_CM_X_AUTH_TOKEN,
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
    `${ORANGE_CM_API_ORIGIN}/omcoreapis/1.0.2/cashout/push/${payToken}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-AUTH-TOKEN': ORANGE_CM_X_AUTH_TOKEN,
        Accept: 'application/json',
      },
    }
  );
  checkFault(response.data);
  return response.data;
}
