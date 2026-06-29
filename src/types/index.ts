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
  solde: number;
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
