const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { sync } = require('../src/controllers/syncController');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.get('/', (req, res) => {
  res.send('Granja Porcina API is running');
});

// Sync Endpoint
app.post('/api/sync', sync);

// Vercel Export
// If running locally
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
