const express = require('express');
const { getTable, setTable } = require('../db');

const router = express.Router();

function nextId(rows) {
  return rows.length ? Math.max(...rows.map((r) => r.id)) + 1 : 1;
}

router.get('/', async (req, res) => {
  try {
    const sales = await getTable('sales');
    res.json(sales);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, farm, price, location, tags } = req.body;
    if (!name || !farm || !price) {
      return res.status(400).json({ error: 'name, farm, and price are required' });
    }
    const rows = await getTable('sales');
    const tagList = Array.isArray(tags)
      ? tags
      : typeof tags === 'string' && tags
        ? tags.split(',').map((s) => s.trim()).filter(Boolean)
        : [];
    const newRow = {
      id: nextId(rows),
      name: name.trim(),
      farm: farm.trim(),
      price: price.trim(),
      location: (location || '').trim(),
      tags: tagList,
    };
    await setTable('sales', [...rows, newRow]);
    res.status(201).json(newRow);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
