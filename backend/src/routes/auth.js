const express = require('express');
const { getTable, setTable } = require('../db');
const bcrypt = require('bcrypt');

const router = express.Router();

const SALT_ROUNDS = 10;

function nextId(rows) {
  return rows.length ? Math.max(...rows.map((r) => r.id)) + 1 : 1;
}

// POST /api/auth/signup - register new user
router.post('/signup', express.json(), async (req, res) => {
  try {
    const { username, fullName, email, password } = req.body || {};
    const u = (v) => (v && typeof v === 'string' ? v.trim() : '');
    const usernameTrim = u(username);
    const fullNameTrim = u(fullName);
    const emailTrim = u(email).toLowerCase();

    if (!usernameTrim || !fullNameTrim || !emailTrim || !password) {
      return res.status(400).json({ error: 'Username, full name, email and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const users = await getTable('users');
    if (users.some((u) => (u.username || '').toLowerCase() === usernameTrim.toLowerCase())) {
      return res.status(409).json({ error: 'Username already taken' });
    }
    if (users.some((u) => (u.email || '').toLowerCase() === emailTrim)) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    const newUser = {
      id: nextId(users),
      username: usernameTrim,
      fullName: fullNameTrim,
      email: emailTrim,
      passwordHash: hashedPassword,
      createdAt: new Date().toISOString(),
    };

    await setTable('users', [...users, newUser]);

    res.status(201).json({
      id: newUser.id,
      username: newUser.username,
      fullName: newUser.fullName,
      email: newUser.email,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Sign up failed' });
  }
});

module.exports = router;
