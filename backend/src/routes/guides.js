const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { getTable, setTable } = require('../db');
const { UPLOAD_DIR } = require('../uploads');

const router = express.Router();

function nextId(rows) {
  return rows.length ? Math.max(...rows.map((r) => r.id)) + 1 : 1;
}

router.get('/', async (req, res) => {
  try {
    const guides = await getTable('guides');
    res.json(guides);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const GUIDES_DIR = path.join(UPLOAD_DIR, 'guides');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(GUIDES_DIR)) fs.mkdirSync(GUIDES_DIR, { recursive: true });
    cb(null, GUIDES_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.pdf';
    cb(null, `guide-${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files are allowed for guides'));
  },
});

router.post('/', upload.single('file'), async (req, res) => {
  try {
    const { title, level, duration, description } = req.body || {};
    const trimmedTitle = (title || '').trim();
    if (!trimmedTitle) {
      return res.status(400).json({ error: 'title is required' });
    }

    const rows = await getTable('guides');
    const newRow = {
      id: nextId(rows),
      title: trimmedTitle,
      level: (level || 'Beginner').trim(),
      duration: (duration || '').trim(),
      description: (description || '').trim(),
      fileUrl: req.file ? `/uploads/guides/${req.file.filename}` : null,
    };

    await setTable('guides', [...rows, newRow]);
    res.status(201).json(newRow);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/guides/:id - update guide (text fields only for now)
router.put('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { title, level, duration, description } = req.body || {};

    const rows = await getTable('guides');
    const idx = rows.findIndex((g) => g.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: 'guide not found' });
    }

    const existing = rows[idx];
    const nextGuide = {
      ...existing,
      title: (title !== undefined ? title : existing.title) || existing.title,
      level: level !== undefined ? level : existing.level,
      duration: duration !== undefined ? duration : existing.duration,
      description: description !== undefined ? description : existing.description,
    };

    const next = rows.slice();
    next[idx] = nextGuide;
    await setTable('guides', next);
    res.json(nextGuide);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/guides/:id
router.delete('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const rows = await getTable('guides');
    const exists = rows.some((g) => g.id === id);
    if (!exists) {
      return res.status(404).json({ error: 'guide not found' });
    }
    const next = rows.filter((g) => g.id !== id);
    await setTable('guides', next);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
