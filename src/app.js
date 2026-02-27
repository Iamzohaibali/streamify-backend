import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth.routes.js';
import fileRoutes from './routes/file.routes.js';

const app = express();

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:4173',
  process.env.CLIENT_URL,
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.options('/{*path}', cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

app.use('/api/auth', authRoutes);
app.use('/api/files', fileRoutes);
app.get('/api/health', (_req, res) => res.json({ status: 'OK', env: process.env.NODE_ENV }));

app.use((_req, res, _next) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('❌ Full error:', err);
  if (err.code === 'LIMIT_FILE_SIZE')       return res.status(400).json({ success: false, message: 'File too large. Max 5MB.' });
  if (err.code === 'LIMIT_UNEXPECTED_FILE') return res.status(400).json({ success: false, message: 'Unexpected file field.' });
  if (err.message?.includes('Only image'))  return res.status(400).json({ success: false, message: err.message });
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({ success: false, message: errors[0] });
  }
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] ?? 'field';
    return res.status(409).json({ success: false, message: `${field} already in use` });
  }
  if (err.name === 'JsonWebTokenError')  return res.status(401).json({ success: false, message: 'Invalid token' });
  if (err.name === 'TokenExpiredError')  return res.status(401).json({ success: false, message: 'Token expired' });
  if (err.name === 'CastError')          return res.status(400).json({ success: false, message: 'Invalid ID' });
  res.status(err.statusCode || 500).json({ success: false, message: err.message || 'Internal server error' });
});

export default app;