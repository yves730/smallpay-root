import { Router } from 'express';
import * as cashoutController from '../../controllers/cashout';
import { authMiddleware } from '../../middleware/auth';

const router = Router();

router.post('/', authMiddleware, cashoutController.create);
router.get('/status/:payToken', authMiddleware, cashoutController.getStatus);
router.get('/push/:payToken', authMiddleware, cashoutController.push);

export default router;
