require('dotenv').config();
const express = require('express');
const cors = require('cors');

// Import routes
const userRoutes = require('./routes/users.routes');
const postRoutes = require('./routes/posts.routes');
const connectionRoutes = require('./routes/connections.routes');
const webhookRoutes = require('./routes/webhooks.routes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// ── Request Logger ────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  const hasAuth = !!req.headers.authorization;
  console.log(`\n→ [${new Date().toISOString()}] ${req.method} ${req.url}`);
  if (Object.keys(req.body || {}).length) {
    console.log('  Body:', JSON.stringify(req.body));
  }
  if (!hasAuth && req.url !== '/health') {
    console.log('  ⚠️  No Authorization header');
  }
  res.on('finish', () => {
    const ms = Date.now() - start;
    const emoji = res.statusCode < 300 ? '✅' : res.statusCode < 500 ? '⚠️ ' : '❌';
    console.log(`← ${emoji} ${res.statusCode} [${ms}ms] ${req.method} ${req.url}`);
  });
  next();
});

// Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'NorthFourth API is running' });
});

// API Routes
app.use('/api/users', userRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/connections', connectionRoutes);
app.use('/api/webhooks', webhookRoutes);

// ── Global Error Handler ──────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('💥 Unhandled error:', err.message, err.stack);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log('✅ Connected to Supabase via modular routes');
});
