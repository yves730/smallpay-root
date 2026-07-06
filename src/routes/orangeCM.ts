import { Router } from 'express';
import { getAccessToken } from '../services/orangeCM';

const router = Router();

router.get('/orange-cm/token', async (_req, res) => {
  try {
    const accessToken = await getAccessToken();

    res.json({
      token_type: 'Bearer',
      access_token: accessToken,
    });
  } catch (error: any) {
    res.status(error.response?.status || 500).json({
      error: 'Impossible de generer le token Orange CM',
      details: error.response?.data || error.message,
    });
  }
});

export default router;
