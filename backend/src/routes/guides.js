const express = require('express');
const { getTable, setTable } = require('../db');

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

router.post('/', async (req, res) => {
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
    };

    await setTable('guides', [...rows, newRow]);
    res.status(201).json(newRow);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
