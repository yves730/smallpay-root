import { Router } from 'express';
import * as cashinController from '../../controllers/cashin';
import { authMiddleware } from '../../middleware/auth';

const router = Router();

router.post('/', authMiddleware, cashinController.create);
router.post('/pay', authMiddleware, cashinController.pay);
router.get('/paymentstatus/:id_transaction', authMiddleware, cashinController.getStatus);

export default router;
