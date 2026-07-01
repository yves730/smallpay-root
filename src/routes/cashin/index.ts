import { Router } from 'express';
import * as cashinController from '../../controllers/cashin';
import { authMiddleware } from '../../middleware/auth';

const router = Router();

router.post('/', authMiddleware, cashinController.create);
router.get('/push/:payToken', authMiddleware, cashinController.push);
router.get('/status/:payToken', authMiddleware, cashinController.getStatus);

export default router;
