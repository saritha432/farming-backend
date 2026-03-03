const express = require('express');
const { getTable, setTable } = require('../db');

const router = express.Router();

function nextId(rows) {
  return rows.length ? Math.max(...rows.map((r) => r.id)) + 1 : 1;
}

router.get('/', async (req, res) => {
  try {
    const rows = await getTable('equipment');
    const items = rows.map((r) => ({
      id: r.id,
      name: r.name,
      mode: r.mode,
      modeKey: r.mode,
      price: r.price,
      location: r.location || '',
      includesOperator: Boolean(r.includesOperator),
    }));
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, mode, price, location, includesOperator } = req.body;
    if (!name || !mode || !price) {
      return res.status(400).json({ error: 'name, mode, and price are required' });
    }
    const rows = await getTable('equipment');
    const newRow = {
      id: nextId(rows),
      name,
      mode,
      price: price || '',
      location: location || '',
      includesOperator: Boolean(includesOperator),
    };
    await setTable('equipment', [...rows, newRow]);
    res.status(201).json({
      ...newRow,
      modeKey: newRow.mode,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
