const express = require('express');
const { getTable } = require('../db');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const products = await getTable('products');
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
