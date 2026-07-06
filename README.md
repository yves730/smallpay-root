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

`POST /api/auth/token` avec header `x-api-key` → retourne un `token` JWT valable 3 minutes (180s). Le frontend doit appeler cette route avant les routes protégées, puis envoyer le token dans `Authorization: Bearer <token>`.

`JWT_SECRET` reste toujours côté serveur. S'il n'est pas défini dans l'environnement, l'API génère automatiquement un secret temporaire au démarrage, mais il n'est jamais exposé au navigateur.

---

## Routes

### Liste complète des endpoints

| Méthode | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | ❌ | Vérification du serveur |
| `POST` | `/api/tenants` | ❌ | Créer un tenant et générer son API key |
| `GET` | `/api/tenants/me` | ✅ | Récupérer le profil du tenant connecté |
| `POST` | `/api/auth/login` | ✅ API Key | Générer un JWT valable 3 minutes |
| `POST` | `/api/auth/token` | ✅ API Key | Générer un JWT valable 3 minutes |
| `GET` | `/api/orange-cm/token` | ❌ | Générer un access token Orange Money Cameroon |
| `GET` | `/api/transactions` | ✅ | Historique des 50 dernières transactions |
| `POST` | `/api/transactions/cashin` | ✅ | Initier un dépôt Orange Money classique |
| `POST` | `/api/transactions/cashout` | ✅ | Initier un retrait Orange Money classique |
| `POST` | `/api/transactions/om-init` | ✅ | Initialiser un paiement Orange Money Cameroon |
| `POST` | `/api/transactions/om-pay` | ✅ | Exécuter un paiement Orange Money Cameroon |
| `POST` | `/api/transactions/callback` | ❌ | Callback de notification Orange Money |
| `POST` | `/api/cashin/pay` | ✅ | Initialise automatiquement le cashin puis fait le paiement |
| `POST` | `/api/cashin/callback` | ❌ | Callback appele par Orange CM apres validation utilisateur |
| `GET` | `/api/cashin/push/:reference` | ✅ | Relancer un push avec le `payToken` du paiement demandé |
| `GET` | `/api/cashin/paymentstatus/:reference` | ✅ | Vérifier le statut avec le `payToken` du paiement demandé |
| `POST` | `/api/cashout` | ✅ | Créer un retrait Orange Money Cameroon |
| `GET` | `/api/cashout/status/:payToken` | ✅ | Vérifier le statut d'un retrait par `payToken` |
| `GET` | `/api/cashout/push/:payToken` | ✅ | Relancer un push de retrait par `payToken` |

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
| `POST` | `/api/auth/token` | ✅ API Key | Génère un JWT valable 3 minutes |

**Réponse (200)**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "tokenType": "Bearer",
  "expiresIn": 180
}
```

### Transactions

| Méthode | Route | Auth | Description |
|---|---|---|---|
| `POST` | `/api/transactions/cashin` | ✅ | Initier un dépôt Orange Money |
| `POST` | `/api/transactions/cashout` | ✅ | Initier un retrait (vérifie solde) |
| `GET` | `/api/transactions` | ✅ | Historique des 50 dernières transactions |
| `POST` | `/api/transactions/om-init` | ✅ | Initialiser un paiement Orange Money Cameroon |
| `POST` | `/api/transactions/om-pay` | ✅ | Exécuter un paiement Orange Money Cameroon |
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

### Cashin Orange Money Cameroon

| Méthode | Route | Auth | Description |
|---|---|---|---|
| `POST` | `/api/cashin/pay` | ✅ | Appelle automatiquement `mp/init`, récupère le `payToken`, puis appelle `mp/pay` |
| `POST` | `/api/cashin/callback` | ❌ | Recoit le callback Orange, retrouve la transaction par `payToken`, met a jour le statut et credite le wallet si succes |
| `GET` | `/api/cashin/paymentstatus/:reference` | ✅ | Appelle `mp/paymentstatus/{payToken}` avec le `payToken` stocké pour ce paiement |
| `GET` | `/api/cashin/push/:reference` | ✅ | Appelle `mp/push/{payToken}` avec le `payToken` stocké pour ce paiement |

Ordre d'appel recommande:

1. `POST /api/cashin/pay`, le backend appelle automatiquement `mp/init` puis `mp/pay` et retourne `reference`
2. `GET /api/cashin/paymentstatus/:reference` pour connaitre le statut final de ce paiement
3. `GET /api/cashin/push/:reference` si le push doit etre relance pour ce paiement

**POST /api/cashin/pay**

Cette route appelle d'abord Orange CM avec seulement le bearer token Orange:

```http
POST /omcoreapis/1.0.2/mp/init
Accept: application/json
Authorization: Bearer <access_token>
```

Puis elle utilise automatiquement le `payToken` retourne pour appeler `mp/pay` avec le body suivant:

```json
{
  "amount": 0,
  "description": "string"
}
```

Le backend remplit automatiquement:

| Champ Orange CM | Source |
|---|---|
| `subscriberMsisdn` | `telephone` du tenant en base de donnees |
| `channelUserMsisdn` | variable d'environnement `SMALLPAY_MSISDN` |
| `pin` | variable d'environnement `SMALLPAY_PIN` |
| `notifUrl` | variable d'environnement `SMALLPAY_NOTIF_URL` |
| `orderId` | genere automatiquement par le backend |

Les appels Orange Money Cameroon envoient aussi le header `X-AUTH-TOKEN` avec la valeur de `ORANGE_CM_X_AUTH_TOKEN` depuis `.env`.

La réponse contient aussi une `reference` interne. Cette `reference` permet au backend de retrouver en base le `payToken` de cette transaction pour `paymentstatus` et `push`.

**POST /api/cashin/callback**

Cette URL doit etre configuree dans `.env` via `SMALLPAY_NOTIF_URL`. Orange CM l'appelle apres validation utilisateur. Le callback doit contenir le `payToken` directement ou dans `data.payToken`; si le statut n'est pas fourni, l'API interroge Orange CM via `mp/paymentstatus/{payToken}`.

Les routes cashin renvoient la réponse Orange CM au format:

```json
{
  "data": {
    "payToken": "string"
  },
  "message": "string"
}
```

ou, pour `pay`, `push` et `paymentstatus`:

```json
{
  "data": {
    "createtime": 0,
    "amount": 0,
    "channelUserMsisdn": "string",
    "inittxnmessage": "string",
    "confirmtxnmessage": "string",
    "confirmtxnstatus": "string",
    "subscriberMsisdn": "string",
    "txnmode": "string",
    "notifyUrl": "string",
    "inittxnstatus": "string",
    "payToken": "string",
    "txnid": "string",
    "status": "string"
  },
  "message": "string"
}
```

### Cashout Orange Money Cameroon

| Méthode | Route | Auth | Description |
|---|---|---|---|
| `POST` | `/api/cashout` | ✅ | Créer un retrait |
| `GET` | `/api/cashout/status/:payToken` | ✅ | Vérifier le statut du retrait |
| `GET` | `/api/cashout/push/:payToken` | ✅ | Relancer un push de retrait |

### Orange Money Cameroon

| Méthode | Route | Auth | Description |
|---|---|---|---|
| `GET` | `/api/orange-cm/token` | ❌ | Générer un access token Orange Money Cameroon |

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
