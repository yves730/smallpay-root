import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import tenantRoutes from './routes/tenant';
import transactionRoutes from './routes/transaction';
import authRoutes from './routes/auth';
import cashinRoutes from './routes/cashin';
import cashoutRoutes from './routes/cashout';
import orangeCMRoutes from './routes/orangeCM';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.use('/api', authRoutes);
app.use('/api', tenantRoutes);
app.use('/api', transactionRoutes);
app.use('/api/cashin', cashinRoutes);
app.use('/api/cashout', cashoutRoutes);
app.use('/api', orangeCMRoutes);

app.use((_req, res) => {
  res.status(404).json({ error: 'Route non trouvée' });
});

app.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});

export default app;
