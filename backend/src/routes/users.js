const express = require('express');
const { getTable, setTable } = require('../db');

const router = express.Router();

// Very lightweight \"profile\" and user listing API.

// GET /api/users/me/posts - return all posts (frontend filters by current user)
router.get('/me/posts', async (req, res) => {
  try {
    const posts = await getTable('posts');
    res.json(posts || []);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to load posts' });
  }
});

// GET /api/users - search users
// Optional query params:
// - q: search term (username/fullName/email)
// - clientId: to compute following state
router.get('/', async (req, res) => {
  try {
    const q = (req.query.q || '').toString().trim().toLowerCase();
    const clientId = (req.query.clientId || '').toString().trim();

    const users = await getTable('users');
    const follows = await getTable('follows');

    const filtered = users.filter((u) => {
      if (!q) return true;
      const username = (u.username || '').toLowerCase();
      const fullName = (u.fullName || '').toLowerCase();
      const email = (u.email || '').toLowerCase();
      return (
        username.includes(q) ||
        fullName.includes(q) ||
        email.includes(q)
      );
    });

    const result = filtered.map((u) => {
      const isFollowing =
        !!clientId &&
        follows.some((f) => f.userId === u.id && f.clientId === clientId);
      return {
        id: u.id,
        username: u.username,
        fullName: u.fullName,
        email: u.email,
        isFollowing,
      };
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to load users' });
  }
});

// POST /api/users/:id/follow - toggle following a user for a given clientId
router.post('/:id/follow', express.json(), async (req, res) => {
  try {
    const userId = Number(req.params.id);
    const clientId = (req.body.clientId || '').toString().trim();
    if (!Number.isFinite(userId)) {
      return res.status(400).json({ error: 'invalid user id' });
    }
    if (!clientId) {
      return res.status(400).json({ error: 'clientId required' });
    }

    const users = await getTable('users');
    const user = users.find((u) => u.id === userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const follows = await getTable('follows');
    const existingIndex = follows.findIndex(
      (f) => f.userId === userId && f.clientId === clientId,
    );

    let next;
    if (existingIndex >= 0) {
      next = follows.filter((_, i) => i !== existingIndex);
    } else {
      next = [...follows, { clientId, userId }];
    }

    await setTable('follows', next);

    const isFollowing = next.some(
      (f) => f.userId === userId && f.clientId === clientId,
    );

    res.json({ following: isFollowing });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to update follow' });
  }
});

module.exports = router;

