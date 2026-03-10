// backend/src/index.js
const express = require('express');
const cors = require('cors');
const { init, get } = require('./db');
const { UPLOAD_DIR } = require('./uploads');

const authRouter = require('./routes/auth');
const postsRouter = require('./routes/posts');
const guidesRouter = require('./routes/guides');
const equipmentRouter = require('./routes/equipment');
const workersRouter = require('./routes/workers');
const jobsRouter = require('./routes/jobs');
const productsRouter = require('./routes/products');
const salesRouter = require('./routes/sales');
const coursesRouter = require('./routes/courses');
const knowledgeRouter = require('./routes/knowledge');
const usersRouter = require('./routes/users');

const app = express();
const PORT = process.env.PORT || 5000;

const allowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'https://farming-frontend-two.vercel.app',
];

app.use(cors({ origin: allowedOrigins }));
app.use(express.json());
app.use('/uploads', express.static(UPLOAD_DIR));

// Warm up DB cache (file or Neon). Don't block startup if it fails.
init().catch((err) => {
  console.error('DB init failed:', err);
});

// Mount routes
app.use('/api/auth', authRouter);
app.use('/api/posts', postsRouter);
app.use('/api/users', usersRouter);
app.use('/api/guides', guidesRouter);
app.use('/api/equipment', equipmentRouter);
app.use('/api/workers', workersRouter);
app.use('/api/jobs', jobsRouter);
app.use('/api/products', productsRouter);
app.use('/api/sales', salesRouter);
app.use('/api/courses', coursesRouter);
app.use('/api/knowledge', knowledgeRouter);

app.get('/api/health', async (req, res) => {
  try {
    await get();
    res.json({ ok: true, db: 'connected' });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`AgroVibes API running at http://localhost:${PORT}`);
});