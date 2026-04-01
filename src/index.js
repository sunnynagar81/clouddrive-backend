require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const routes = require('./routes');

const app = express();
const PORT = process.env.PORT || 8080;

// ─── CORS ────────────────────────────────────────────────────
app.use(cors({
  origin: function (origin, callback) {
    // Allow all vercel.app URLs and localhost
    if (!origin) return callback(null, true);
    if (
      origin.includes('vercel.app') ||
      origin.includes('localhost') ||
      origin === process.env.CORS_ORIGIN
    ) {
      return callback(null, true);
    }
    return callback(null, true); // Allow all for now
  },
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// ─── Rate Limiting ───────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 200,
});
app.use('/api', limiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// ─── Security Headers ────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});

// ─── Routes ──────────────────────────────────────────────────
app.use('/api', routes);
app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use((req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Internal server error' } });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});