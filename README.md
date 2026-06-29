# SmallPay Root — API Orange Money

API de paiement Orange Money avec gestion multi-tenants, authentification par API Key et JWT.

---

## Configuration

1. Copier `.env.example` vers `.env` et renseigner les valeurs :

```env
PORT=3000
DATABASE_URL="postgresql://postgres:password@localhost:5432/smallpay?schema=public"
JWT_SECRET=une-cle-secrete-aleatoire

ORANGE_API_BASE_URL=https://api.orange.com
ORANGE_CLIENT_ID=your_client_id
ORANGE_CLIENT_SECRET=your_client_secret
ORANGE_MERCHANT_NUMBER=your_merchant_number
ORANGE_CALLBACK_URL=http://localhost:3000/api/transactions/callback
```

2. Créer la base PostgreSQL et pousser le schéma :

```bash
npm run db:push
```

3. Démarrer le serveur :

```bash
npm run dev
```

---

## Authentification

Deux modes disponibles (un ou l'autre, sur les mêmes routes sécurisées) :

| Mode | Header | Exemple |
|---|---|---|
| **API Key** | `x-api-key` | `x-api-key: sp_a1b2c3d4...` |
| **JWT** (expire 3 min) | `Authorization: Bearer` | `Authorization: Bearer eyJhbGci...` |

### Obtenir un API Key

`POST /api/tenants` → retourne l'`apiKey`.

### Échanger l'API Key contre un JWT

`POST /api/auth/login` avec header `x-api-key` → retourne un `token` JWT valable 3 minutes (180s).

---

## Routes

### Tenants

| Méthode | Route | Auth | Description |
|---|---|---|---|
| `POST` | `/api/tenants` | ❌ | Créer un nouveau tenant |
| `GET` | `/api/tenants/me` | ✅ | Profil du tenant connecté |

**POST /api/tenants**

```json
{
  "nom": "Dupont",
  "prenom": "Jean",
  "telephone": "+2250101020304",
  "email": "jean@example.com"
}
```

**Réponse (201)**

```json
{
  "id": "uuid",
  "apiKey": "sp_a1b2c3d4...",
  "nom": "Dupont",
  "prenom": "Jean",
  "telephone": "+2250101020304",
  "email": "jean@example.com",
  "solde": 0,
  "createdAt": "2025-01-01T00:00:00.000Z"
}
```

### Authentification JWT

| Méthode | Route | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/login` | ✅ API Key | Génère un JWT valable 3 minutes |

**Réponse (200)**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "expiresIn": 180
}
```

### Transactions

| Méthode | Route | Auth | Description |
|---|---|---|---|
| `POST` | `/api/transactions/cashin` | ✅ | Initier un dépôt Orange Money |
| `POST` | `/api/transactions/cashout` | ✅ | Initier un retrait (vérifie solde) |
| `GET` | `/api/transactions` | ✅ | Historique des 50 dernières transactions |
| `POST` | `/api/transactions/callback` | ❌ | Callback de notification Orange Money |

**POST /api/transactions/cashin**

```json
{
  "montant": 5000,
  "telephone": "+2250101020304"
}
```

**POST /api/transactions/cashout**

```json
{
  "montant": 2000,
  "telephone": "+2250101020304"
}
```

### Santé

| Méthode | Route | Description |
|---|---|---|
| `GET` | `/health` | Vérification du serveur |

**Réponse**

```json
{
  "status": "OK",
  "timestamp": "2025-01-01T00:00:00.000Z"
}
```

---

## Schéma de la base (PostgreSQL)

### Tenant

| Champ | Type | Contraintes |
|---|---|---|
| `id` | UUID | PK, généré |
| `apiKey` | String | Unique, générée |
| `nom` | String | Requis |
| `prenom` | String | Requis |
| `telephone` | String | Unique, requis |
| `email` | String | Unique, requis |
| `solde` | Float | Défaut 0 |
| `createdAt` | DateTime | Généré |
| `updatedAt` | DateTime | Généré |

### Transaction

| Champ | Type | Contraintes |
|---|---|---|
| `id` | UUID | PK, généré |
| `tenantId` | UUID | FK → Tenant |
| `type` | String | CASHIN / CASHOUT |
| `montant` | Float | Requis |
| `telephone` | String | Requis |
| `statut` | String | PENDING / SUCCESS / FAILED |
| `referenceExterne` | String? | Réf. Orange |
| `referenceOrange` | String? | URL ou token |
| `createdAt` | DateTime | Généré |
| `updatedAt` | DateTime | Généré |

---

## Commandes npm

| Commande | Description |
|---|---|
| `npm run dev` | Lance le serveur en mode développement (nodemon + tsx) |
| `npm run build` | Compile TypeScript vers `dist/` |
| `npm start` | Lance le serveur compilé |
| `npm run db:generate` | Génère le client Prisma |
| `npm run db:push` | Pousse le schéma vers PostgreSQL |
| `npm run db:migrate` | Crée une migration Prisma |
| `npm run db:studio` | Ouvre Prisma Studio (UI base de données) |

---

## Structure du projet

```
smallpay-root/
├── prisma/
│   └── schema.prisma          # Modèles de données
├── src/
│   ├── config/
│   │   └── database.ts        # Client Prisma
│   ├── middleware/
│   │   └── auth.ts            # Auth API Key + JWT
│   ├── controllers/
│   │   ├── auth.ts            # Login JWT
│   │   ├── tenant.ts          # Création & profil tenant
│   │   └── transaction.ts     # Cashin, cashout, historique
│   ├── routes/
│   │   ├── auth.ts            # Route /api/auth/login
│   │   ├── tenant.ts          # Routes /api/tenants
│   │   └── transaction.ts     # Routes /api/transactions
│   ├── services/
│   │   ├── orange.ts          # Appels API Orange Money
│   │   └── tenant.ts          # Logique métier tenant
│   ├── types/
│   │   └── index.ts           # Types TypeScript
│   └── index.ts               # Point d'entrée Express
├── .env                       # Variables d'environnement
├── .env.example               # Exemple de configuration
├── tsconfig.json
└── package.json
```