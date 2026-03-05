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
    const body = req.body || {};
    const name = (body.name || body.productName || '').trim();
    // Allow type to be optional and accept a few common aliases
    const rawType = body.type || body.productType || body.category || 'Other';
    const type = String(rawType).trim();
    const crops = (body.crops || '').trim();
    const benefits = (body.benefits || '').trim();
    const risk = (body.risk || '').trim();

    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }

    const rows = await getTable('products');
    const newProduct = {
      id: nextId(rows),
      name: name.trim(),
      type: type.trim(),
      type_key: type.trim(), // keep simple; can be customized later
      crops,
      benefits,
      risk,
    };

    await setTable('products', [...rows, newProduct]);
    res.status(201).json(newProduct);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
