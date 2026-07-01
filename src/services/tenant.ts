import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import prisma from '../config/database';
import { TenantCreateInput, TenantResponse } from '../types';

function generateApiKey(): string {
  const raw = uuidv4() + Date.now().toString();
  return `sp_${crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32)}`;
}

export async function createTenant(data: TenantCreateInput): Promise<TenantResponse> {
  const apiKey = generateApiKey();

  const existingEmail = await prisma.tenant.findUnique({ where: { email: data.email } });
  if (existingEmail) {
    throw new Error('Un utilisateur avec cet email existe déjà');
  }

  const existingPhone = await prisma.tenant.findUnique({ where: { telephone: data.telephone } });
  if (existingPhone) {
    throw new Error('Un utilisateur avec ce téléphone existe déjà');
  }

  const tenant = await prisma.tenant.create({
    data: {
      apiKey,
      nom: data.nom,
      prenom: data.prenom,
      telephone: data.telephone,
      email: data.email,
      wallet: {
        create: { solde: 0 },
      },
    },
    select: {
      id: true,
      apiKey: true,
      nom: true,
      prenom: true,
      telephone: true,
      email: true,
      createdAt: true,
    },
  });

  return tenant;
}

export async function getTenantByApiKey(apiKey: string) {
  return prisma.tenant.findUnique({
    where: { apiKey },
    select: {
      id: true,
      apiKey: true,
      nom: true,
      prenom: true,
      telephone: true,
      email: true,
      createdAt: true,
    },
  });
}

export async function getTenantById(id: string) {
  return prisma.tenant.findUnique({
    where: { id },
    select: {
      id: true,
      nom: true,
      prenom: true,
      telephone: true,
      email: true,
      createdAt: true,
    },
  });
}
