const express = require('express');
const { getTable, setTable } = require('../db');

const router = express.Router();

function nextId(rows) {
  return rows.length ? Math.max(...rows.map((r) => r.id)) + 1 : 1;
}

router.get('/', async (req, res) => {
  try {
    const jobs = await getTable('jobs');
    res.json(jobs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { title, location, type } = req.body;
    if (!title || !location || !type) {
      return res.status(400).json({ error: 'title, location, and type are required' });
    }
    const rows = await getTable('jobs');
    const newRow = {
      id: nextId(rows),
      title: title.trim(),
      location: location.trim(),
      type: type.trim(),
    };
    await setTable('jobs', [...rows, newRow]);
    res.status(201).json(newRow);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
