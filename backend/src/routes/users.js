const express = require('express');
const multer = require('multer');
const cloudinary = require('../cloudinary');
const { getTable, setTable } = require('../db');

const router = express.Router();

// Very lightweight \"profile\" and user listing API.

// Profile photo uploads (image only)
const uploadAvatar = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const m = (file.mimetype || '').toLowerCase();
    // Camera capture on mobile often sends empty mimetype or octet-stream.
    const ok =
      /^image\//.test(m) ||
      m === 'application/octet-stream' ||
      m === '';
    if (ok) cb(null, true);
    else cb(new Error('Only images allowed'), false);
  },
});

// POST /api/users/:id/avatar
// Accepts:
// - multipart/form-data with image file fields (avatar/image/file/photo)
// - JSON body with data URI/base64 in avatar/image/imageData/file
router.post('/:id/avatar', uploadAvatar.any(), async (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isFinite(userId)) {
      return res.status(400).json({ error: 'invalid user id' });
    }
    const files = Array.isArray(req.files) ? req.files : [];
    const preferredFieldNames = ['avatar', 'image', 'file', 'photo'];
    const pickedFile =
      preferredFieldNames
        .map((field) => files.find((f) => f.fieldname === field && f.buffer))
        .find(Boolean) || files.find((f) => f && f.buffer);

    const jsonImage =
      (req.body && (req.body.avatar || req.body.image || req.body.imageData || req.body.file)) ||
      null;

    let uploadResult = null;

    if (pickedFile && pickedFile.buffer) {
      uploadResult = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: 'agrovibes_avatars',
            resource_type: 'image',
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          },
        );
        stream.end(pickedFile.buffer);
      });
    } else if (typeof jsonImage === 'string' && jsonImage.trim()) {
      // Supports both data URI and plain base64 payloads from camera capture flows.
      const payload = jsonImage.trim();
      const normalized = payload.startsWith('data:image/')
        ? payload
        : `data:image/jpeg;base64,${payload}`;
      uploadResult = await cloudinary.uploader.upload(normalized, {
        folder: 'agrovibes_avatars',
        resource_type: 'image',
      });
    } else {
      return res
        .status(400)
        .json({ error: 'avatar image required (file or base64 payload)' });
    }

    const avatarUrl = uploadResult.secure_url;

    const users = await getTable('users');
    const idx = users.findIndex((u) => u.id === userId);
    if (idx === -1) {
      return res.status(404).json({ error: 'User not found' });
    }

    const updatedUser = { ...users[idx], avatar: avatarUrl };
    const nextUsers = [...users];
    nextUsers[idx] = updatedUser;
    await setTable('users', nextUsers);

    res.json({ avatar: avatarUrl });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to upload avatar' });
  }
});

// GET /api/users/me/posts - return all posts (frontend filters by current user)
router.get('/me/posts', async (req, res) => {
  try {
    const posts = await getTable('posts');
    const sorted = Array.isArray(posts) ? [...posts].sort((a, b) => b.id - a.id) : [];
    res.json(sorted);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to load posts' });
  }
});

// GET /api/users - search users
// Optional query params:
// - q: search term (username/fullName/email)
// - currentUserId: logged-in user id to compute following state
router.get('/', async (req, res) => {
  try {
    const q = (req.query.q || '').toString().trim().toLowerCase();
    const currentUserId = Number(req.query.currentUserId);

    const users = await getTable('users');
    const userFollows = await getTable('user_follows');

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
        Number.isFinite(currentUserId) &&
        userFollows.some(
          (f) =>
            f.followerUserId === currentUserId &&
            f.followingUserId === u.id,
        );
      return {
        id: u.id,
        username: u.username,
        fullName: u.fullName,
        email: u.email,
        avatar: u.avatar || null,
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

// -------- Simple follow request system (for cross-device "requests") --------

// POST /api/users/:id/follow-request
// Body: { fromUserId, fromName }
router.post('/:id/follow-request', express.json(), async (req, res) => {
  try {
    const toUserId = Number(req.params.id);
    const { fromUserId, fromName } = req.body || {};

    if (!Number.isFinite(toUserId)) {
      return res.status(400).json({ error: 'invalid target user id' });
    }
    if (!Number.isFinite(Number(fromUserId))) {
      return res.status(400).json({ error: 'invalid from user id' });
    }

    const users = await getTable('users');
    const toUser = users.find((u) => u.id === toUserId);
    const fromUser = users.find((u) => u.id === Number(fromUserId));
    if (!toUser || !fromUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    const followRequests = await getTable('follow_requests');
    const existing = followRequests.find(
      (r) =>
        r.fromUserId === Number(fromUserId) &&
        r.toUserId === toUserId &&
        r.status === 'pending',
    );
    if (existing) {
      return res.json(existing);
    }

    const nextId =
      followRequests.reduce((max, r) => (r.id > max ? r.id : max), 0) + 1;

    const request = {
      id: nextId,
      fromUserId: Number(fromUserId),
      fromName: fromName || fromUser.username || fromUser.fullName || fromUser.email || 'User',
      toUserId,
      toName: toUser.username || toUser.fullName || toUser.email || 'User',
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    const updated = [...followRequests, request];
    await setTable('follow_requests', updated);

    res.json(request);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to create follow request' });
  }
});

// GET /api/users/follow-requests?toUserId=123&status=pending
router.get('/follow-requests', async (req, res) => {
  try {
    const toUserId = Number(req.query.toUserId);
    const status = (req.query.status || 'pending').toString();

    if (!Number.isFinite(toUserId)) {
      return res.status(400).json({ error: 'toUserId required' });
    }

    const followRequests = await getTable('follow_requests');
    const filtered = followRequests.filter(
      (r) => r.toUserId === toUserId && (!status || r.status === status),
    );

    res.json(filtered);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to load follow requests' });
  }
});

// POST /api/users/follow-requests/:id/:action  (action = accept | reject)
router.post('/follow-requests/:id/:action', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const action = req.params.action;
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'invalid request id' });
    }
    if (action !== 'accept' && action !== 'reject') {
      return res.status(400).json({ error: 'invalid action' });
    }

    const followRequests = await getTable('follow_requests');
    const idx = followRequests.findIndex((r) => r.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const updatedReq = {
      ...followRequests[idx],
      status: action === 'accept' ? 'accepted' : 'rejected',
    };
    const updated = [...followRequests];
    updated[idx] = updatedReq;
    await setTable('follow_requests', updated);

    // When a request is accepted, also create a user-to-user follow relation
    if (action === 'accept') {
      const userFollows = await getTable('user_follows');
      const exists = userFollows.some(
        (f) =>
          f.followerUserId === updatedReq.fromUserId &&
          f.followingUserId === updatedReq.toUserId,
      );
      if (!exists) {
        const nextUserFollows = [
          ...userFollows,
          {
            followerUserId: updatedReq.fromUserId,
            followingUserId: updatedReq.toUserId,
          },
        ];
        await setTable('user_follows', nextUserFollows);
      }
    }

    res.json(updatedReq);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to update follow request' });
  }
});

// --- Followers / Following lists for Instagram-style profile counts ---

// GET /api/users/:id/followers - users who follow this user (via accepted requests)
router.get('/:id/followers', async (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isFinite(userId)) {
      return res.status(400).json({ error: 'invalid user id' });
    }

    const users = await getTable('users');
    const userFollows = await getTable('user_follows');

    const followerLinks = userFollows.filter((f) => f.followingUserId === userId);
    const followerIds = followerLinks.map((f) => f.followerUserId);

    const followers = users.filter((u) => followerIds.includes(u.id));

    res.json(
      followers.map((u) => ({
        id: u.id,
        username: u.username,
        fullName: u.fullName,
        email: u.email,
        avatar: u.avatar || null,
      })),
    );
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to load followers' });
  }
});

// GET /api/users/:id/following - users this user is following
router.get('/:id/following', async (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isFinite(userId)) {
      return res.status(400).json({ error: 'invalid user id' });
    }

    const users = await getTable('users');
    const userFollows = await getTable('user_follows');

    const followingLinks = userFollows.filter((f) => f.followerUserId === userId);
    const followingIds = followingLinks.map((f) => f.followingUserId);

    const following = users.filter((u) => followingIds.includes(u.id));

    res.json(
      following.map((u) => ({
        id: u.id,
        username: u.username,
        fullName: u.fullName,
        email: u.email,
        avatar: u.avatar || null,
      })),
    );
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to load following users' });
  }
});

module.exports = router;

