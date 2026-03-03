const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const multer = require('multer');
const { init, get, getTable, setTable } = require('./db');
const { UPLOAD_DIR } = require('./uploads');

const postsRouter = require('./routes/posts');
const guidesRouter = require('./routes/guides');
const equipmentRouter = require('./routes/equipment');
const workersRouter = require('./routes/workers');
const jobsRouter = require('./routes/jobs');
const productsRouter = require('./routes/products');
const salesRouter = require('./routes/sales');
const coursesRouter = require('./routes/courses');

const app = express();
const PORT = process.env.PORT || 5000;

const allowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'https://farming-frontend-git-main-mounikas-projects-76ff82b6.vercel.app/',
  
];

app.use(cors({ origin: allowedOrigins }));
// app.use(cors({ origin: ['http://localhost:3000', 'http://127.0.0.1:3000'] }));
app.use(express.json());
app.use('/uploads', express.static(UPLOAD_DIR));

init();

// POST /api/posts - create post (with optional file upload) - registered on app to avoid router path issues
const postUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      cb(null, UPLOAD_DIR);
    },
    filename: (req, file, cb) => {
      const ext = /video\/|\.mp4$/i.test(file.mimetype + file.originalname) ? '.mp4' : path.extname(file.originalname) || '.jpg';
      cb(null, 'media-' + Date.now() + ext);
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/image\/|video\//.test(file.mimetype)) cb(null, true);
    else cb(null, false);
  },
});
app.post('/api/posts', postUpload.single('media'), (req, res) => {
  try {
    const farmer = (req.body && req.body.farmer) ? String(req.body.farmer).trim() : 'My Farm';
    const location = (req.body && req.body.location) ? String(req.body.location).trim() : '';
    const type = (req.body && req.body.type) ? String(req.body.type).trim() : 'Photo';
    const title = (req.body && req.body.title) ? String(req.body.title).trim() : '';
    const description = (req.body && req.body.description) ? String(req.body.description).trim() : '';
    const tagsStr = (req.body && req.body.tags) ? String(req.body.tags).trim() : '';
    const tags = tagsStr ? tagsStr.split(',').map((s) => s.trim()).filter(Boolean) : [];
    if (!title) return res.status(400).json({ error: 'title is required' });
    let mediaUrl = null;
    if (req.file && req.file.filename) mediaUrl = '/uploads/' + req.file.filename;
    const posts = getTable('posts');
    const nextId = posts.length ? Math.max(...posts.map((r) => r.id)) + 1 : 1;
    const newPost = { id: nextId, farmer, location, type: type === 'Video' ? 'Video' : 'Photo', title, description, tags, mediaUrl };
    setTable('posts', [...posts, newPost]);
    res.status(201).json({ ...newPost, likeCount: 0, commentCount: 0, isLiked: false, isFollowing: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.use('/api/posts', postsRouter);
app.use('/api/guides', guidesRouter);
app.use('/api/equipment', equipmentRouter);
app.use('/api/workers', workersRouter);
app.use('/api/jobs', jobsRouter);
app.use('/api/products', productsRouter);
app.use('/api/sales', salesRouter);
app.use('/api/courses', coursesRouter);

app.get('/api/health', (req, res) => {
  try {
    get();
    res.json({ ok: true, db: 'connected' });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`AgroVibes API running at http://localhost:${PORT}`);
});
