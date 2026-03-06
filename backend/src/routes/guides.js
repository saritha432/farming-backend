const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { getTable, setTable } = require('../db');
const { UPLOAD_DIR } = require('../uploads');

const router = express.Router();

const GUIDES_DIR = path.join(UPLOAD_DIR, 'guides');

const guideUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      if (!fs.existsSync(GUIDES_DIR)) fs.mkdirSync(GUIDES_DIR, { recursive: true });
      cb(null, GUIDES_DIR);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '.pdf';
      cb(null, `guide-${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB
  fileFilter: (req, file, cb) => {
    const allowed = /^application\/pdf$|^image\//i;
    if (allowed.test(file.mimetype)) cb(null, true);
    else cb(null, false); // skip file but don't error so title/description still work
  },
});

function nextId(rows) {
  return rows.length ? Math.max(...rows.map((r) => r.id)) + 1 : 1;
}

function readBody(req) {
  const body = req.body || {};
  return {
    title: (body.title || body.name || '').trim(),
    level: (body.level || body.difficulty || 'Beginner').trim(),
    duration: (body.duration || body.time || '').trim(),
    description: (body.description || '').trim(),
  };
}

// GET /api/guides
router.get('/', async (req, res) => {
  try {
    const guides = await getTable('guides');
    res.json(guides);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/guides — use multer for every POST so multipart is always parsed (JSON body is set by express.json() before route)
router.post('/', guideUpload.single('file'), async (req, res) => {
  try {
    const { title, level, duration, description } = readBody(req);
    if (!title) {
      return res.status(400).json({
        error: 'title is required',
        hint: 'For file uploads use multipart/form-data with a "title" field.',
      });
    }

    const rows = await getTable('guides');
    let fileUrl = null;
    if (req.file && req.file.filename) {
      fileUrl = `/uploads/guides/${req.file.filename}`;
    }
    const newGuide = {
      id: nextId(rows),
      title,
      level: level || 'Beginner',
      duration: duration || '',
      description: description || '',
      fileUrl,
    };

    await setTable('guides', [...rows, newGuide]);
    res.status(201).json(newGuide);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/guides/:id
router.put('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { title, level, duration, description } = req.body || {};
    const rows = await getTable('guides');
    const idx = rows.findIndex((g) => g.id === id);
    if (idx === -1) return res.status(404).json({ error: 'guide not found' });
    const existing = rows[idx];
    const nextGuide = {
      ...existing,
      title: title !== undefined ? String(title).trim() : existing.title,
      level: level !== undefined ? String(level).trim() : existing.level,
      duration: duration !== undefined ? String(duration).trim() : existing.duration,
      description: description !== undefined ? String(description).trim() : existing.description,
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
    if (!rows.some((g) => g.id === id)) return res.status(404).json({ error: 'guide not found' });
    await setTable('guides', rows.filter((g) => g.id !== id));
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
