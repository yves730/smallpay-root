import { Request } from 'express';

export interface TenantCreateInput {
  nom: string;
  prenom: string;
  telephone: string;
  email: string;
}

export interface TenantResponse {
  id: string;
  apiKey: string;
  nom: string;
  prenom: string;
  telephone: string;
  email: string;
  createdAt: Date;
}

export interface TransactionRequest {
  montant: number;
  telephone: string;
}

export interface AuthenticatedRequest extends Request {
  tenant?: {
    id: string;
    apiKey: string;
    nom: string;
    prenom: string;
    email: string;
    telephone: string;
  };
  wallet?: {
    id: string;
    solde: number;
  };
}

export interface OrangeTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface OrangeCashinRequest {
  merchant_key: string;
  currency: string;
  order_id: string;
  amount: string;
  return_url: string;
  cancel_url: string;
  notif_url: string;
  lang: string;
  reference: string;
}

export interface OrangeCashoutRequest {
  subscriber_number: string;
  amount: string;
  description: string;
  reference: string;
}

export interface OrangeCashoutResponse {
  status: string;
  message: string;
  reference: string;
  payToken?: string;
}

export interface OrangeCashinResponse {
  status: string;
  message: string;
  pay_token: string;
  payment_url: string;
}

export interface OrangeCMTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

export interface OrangeCMInitRequest {
  merchant_key: string;
  amount: string;
  currency: string;
  order_id: string;
  phone_number: string;
  description: string;
  return_url: string;
  cancel_url: string;
  notif_url: string;
  lang: string;
  reference: string;
}

export interface OrangeCMInitResponse {
  status: number;
  message: string;
  data?: {
    pay_token: string;
    payment_url: string;
    payment_ref: string;
  };
}

export interface OrangeCMPayRequest {
  notifUrl: string;
  channelUserMsisdn: string;
  amount: number;
  subscriberMsisdn: string;
  pin: string;
  orderId: string;
  description: string;
  payToken: string;
}

export interface OrangeCMCashinPayRequest {
  channelUserMsisdn: string;
  notifUrl: string;
  amount: number;
  subscriberMsisdn: string;
  pin: string;
  orderId: string;
  description: string;
  payToken: string;
}

export interface OrangeCMPayResponse {
  status: number;
  message: string;
  data?: {
    amount: number;
    description: string;
    orderId: string;
    subscriberMsisdn: string;
    payToken: string;
    status: string;
    transactionId: string;
  };
}

export interface OrangeCMInitTokenResponse {
  data: {
    payToken: string;
  };
  message: string;
}

export interface OrangeCMPaymentData {
  createtime: number | string;
  amount: number;
  channelUserMsisdn: string;
  inittxnmessage: string;
  confirmtxnmessage: string;
  confirmtxnstatus: string;
  subscriberMsisdn: string;
  txnmode: string;
  notifyUrl: string;
  inittxnstatus: string;
  payToken: string;
  txnid: string;
  status: string;
}

export interface OrangeCMCashinPaymentData {
  createtime: number | string;
  amount: number;
  channelUserMsisdn: string;
  subscriberMsisdn: string;
  txnmode: string;
  txnstatus: number;
  txnmessage: string;
  payToken: string;
  txnid: string;
  status: string;
}

export interface OrangeCMPaymentResponse {
  data: OrangeCMPaymentData;
  message: string;
}

export interface OrangeCMCashinPaymentResponse {
  data: OrangeCMCashinPaymentData;
  message: string;
}

export interface OrangeCMFaultResponse {
  fault: {
    code: number;
    message: string;
    description: string;
  };
}
