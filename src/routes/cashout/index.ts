import { Router } from 'express';
import * as cashoutController from '../../controllers/cashout';
import { authMiddleware } from '../../middleware/auth';

const router = Router();

router.post('/', authMiddleware, cashoutController.create);
router.get('/status/:id_transaction', authMiddleware, cashoutController.getStatus);
router.get('/push/:id_transaction', authMiddleware, cashoutController.push);

export default router;
