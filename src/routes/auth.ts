import { Router } from 'express';
import * as authController from '../controllers/auth';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.post('/auth/login', authMiddleware, authController.login);
router.post('/auth/token', authMiddleware, authController.login);

export default router;
