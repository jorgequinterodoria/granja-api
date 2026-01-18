const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

// Controllers
const authController = require('../controllers/authController');
const syncController = require('../controllers/syncController');
const farmController = require('../controllers/farmController');
const breedingController = require('../controllers/breedingController');
const dashboardController = require('../controllers/dashboardController');

// Routes
const userRoutes = require('../routes/userRoutes');

// Middleware
const { authenticateToken, requirePermission } = require('../middleware/saasMiddleware');

const app = express();

// Security & Parsing
app.use(helmet());
app.use(cors());
app.use(express.json());

// --- ROUTES ---

// Health Check
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));

// Auth
app.post('/api/auth/login', authController.login);

// Admin / SaaS
app.post('/api/admin/create-farm', authenticateToken, requirePermission('admin.manage'), farmController.createFarm);
app.get('/api/admin/farms', authenticateToken, requirePermission('admin.manage'), farmController.listFarms);

// Advanced Modules (Admin Only)
app.get('/api/pigs/check-breeding', authenticateToken, requirePermission('admin.manage'), breedingController.checkBreeding);
app.get('/api/dashboard/tasks', authenticateToken, requirePermission('admin.manage'), dashboardController.getTasks);

// Sync (Offline-First Core)
// Unified endpoint (handles both push and pull)
app.post('/api/sync', authenticateToken, syncController.sync);

// Separate endpoints (kept for compatibility)
app.post('/api/sync/push', authenticateToken, syncController.pushChanges);
app.get('/api/sync/pull', authenticateToken, syncController.pullChanges);

// Users Management
app.use('/api/users', authenticateToken, userRoutes);

// Export for Vercel
module.exports = app;

// Local Development
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}
