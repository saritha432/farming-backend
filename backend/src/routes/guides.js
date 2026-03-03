const express = require('express');
const { getTable } = require('../db');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const guides = await getTable('guides');
    res.json(guides);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
