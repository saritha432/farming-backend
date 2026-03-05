const express = require('express');
const { getTable, setTable } = require('../db');

const router = express.Router();

function nextId(rows) {
  return rows.length ? Math.max(...rows.map((r) => r.id)) + 1 : 1;
}

// GET /api/products
router.get('/', async (req, res) => {
  try {
    const products = await getTable('products');
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/products
router.post('/', async (req, res) => {
  try {
    const { name, type, crops, benefits, risk } = req.body;
    if (!name || !type) {
      return res.status(400).json({ error: 'name and type are required' });
    }

    const rows = await getTable('products');
    const newProduct = {
      id: nextId(rows),
      name: name.trim(),
      type: type.trim(),
      type_key: type.trim(), // keep simple; can be customized later
      crops: (crops || '').trim(),
      benefits: (benefits || '').trim(),
      risk: (risk || '').trim(),
    };

    await setTable('products', [...rows, newProduct]);
    res.status(201).json(newProduct);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
