import { Router } from 'express';
import * as transactionController from '../controllers/transaction';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.get('/transactions/stats', authMiddleware, transactionController.getTransactionStats);
router.get('/transactions/tenant/:tenantId', authMiddleware, transactionController.getTenantTransactions);
router.get('/transactions', authMiddleware, transactionController.getTransactions);
router.get('/wallets', authMiddleware, transactionController.getWallets);
router.get('/wallets/tenant/:tenantId', authMiddleware, transactionController.getWalletByTenant);
router.post('/transactions/callback', transactionController.handleCallback);

export default router;
