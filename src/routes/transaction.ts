import { Router } from 'express';
import * as transactionController from '../controllers/transaction';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.post('/transactions/cashin', authMiddleware, transactionController.cashin);
router.post('/transactions/cashout', authMiddleware, transactionController.cashout);
router.get('/transactions', authMiddleware, transactionController.getTransactions);
router.post('/transactions/om-init', authMiddleware, transactionController.omInit);
router.post('/transactions/om-pay', authMiddleware, transactionController.omPay);
router.post('/transactions/callback', transactionController.handleCallback);

export default router;
