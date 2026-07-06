import { Router } from 'express';
import * as cashinController from '../../controllers/cashin';
import { authMiddleware } from '../../middleware/auth';

const router = Router();

router.post('/callback', cashinController.callback);
router.post('/pay', authMiddleware, cashinController.pay);
router.get('/push/:reference', authMiddleware, cashinController.push);
router.get('/push', authMiddleware, cashinController.push);
router.get('/paymentstatus/:reference', authMiddleware, cashinController.getStatus);
router.get('/paymentstatus', authMiddleware, cashinController.getStatus);

export default router;
