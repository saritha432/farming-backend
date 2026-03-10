const express = require('express');
const multer = require('multer');
const { getTable, setTable } = require('../db');
const cloudinary = require('../cloudinary');

const router = express.Router();

const guideUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB
  fileFilter: (req, file, cb) => {
    const allowed = /^application\/pdf$/i;
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

// POST /api/guides — accepts JSON or multipart/form-data (optional file)
router.post('/', (req, res, next) => {
  const isMultipart = (req.headers['content-type'] || '').includes('multipart/form-data');
  if (isMultipart) {
    return guideUpload.single('file')(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message || 'File upload failed' });
      next();
    });
  }
  next();
}, async (req, res) => {
  try {
    const { title, level, duration, description } = readBody(req);
    if (!title) {
      return res.status(400).json({ error: 'title is required' });
    }

    const rows = await getTable('guides');
    let fileUrl = null;
    if (req.file && req.file.buffer) {
      const uploadResult = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: 'agrovibes_guides',
            resource_type: 'raw',
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          },
        );
        stream.end(req.file.buffer);
      });
      fileUrl = uploadResult.secure_url;
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
