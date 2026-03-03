const express = require('express');
const { getTable } = require('../db');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const workers = await getTable('workers');
    res.json(workers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
