import { Router } from 'express';
import * as tenantController from '../controllers/tenant';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.post('/tenants', tenantController.createTenant);
router.get('/tenants/me', authMiddleware, tenantController.getProfile);

export default router;
