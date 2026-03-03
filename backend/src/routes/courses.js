const express = require('express');
const { getTable } = require('../db');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const courses = await getTable('courses');
    res.json(courses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
