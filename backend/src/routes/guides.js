const express = require('express');
const { getTable, setTable } = require('../db');

const router = express.Router();

function nextId(rows) {
  return rows.length ? Math.max(...rows.map((r) => r.id)) + 1 : 1;
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

// POST /api/guides
router.post('/', async (req, res) => {
  try {
    const body = req.body || {};
    const title = (body.title || body.name || '').trim();
    const level = (body.level || body.difficulty || '').trim();
    const duration = (body.duration || body.time || '').trim();

    if (!title) {
      return res.status(400).json({ error: 'title is required' });
    }

    const rows = await getTable('guides');
    const newGuide = {
      id: nextId(rows),
      title,
      level: level || 'Beginner',
      duration: duration || '',
    };

    await setTable('guides', [...rows, newGuide]);
    res.status(201).json(newGuide);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
