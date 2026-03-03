const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getTable, setTable } = require('../db');
const { UPLOAD_DIR } = require('../uploads');

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const ext = (file.mimetype === 'video/mp4' || file.originalname.toLowerCase().endsWith('.mp4')) ? '.mp4' : path.extname(file.originalname) || '.jpg';
    cb(null, `media-${Date.now()}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /image\/|video\//;
    if (allowed.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only images and videos allowed'), false);
  },
});

function nextId(rows) {
  return rows.length ? Math.max(...rows.map((r) => r.id)) + 1 : 1;
}

router.get('/', async (req, res) => {
  try {
    const clientId = req.query.clientId || '';
    const posts = await getTable('posts');
    const likes = await getTable('post_likes');
    const comments = await getTable('post_comments');
    const follows = await getTable('follows');

    const result = posts.map((p) => {
      const likeCount = likes.filter((l) => l.postId === p.id).length;
      const commentCount = comments.filter((c) => c.postId === p.id).length;
      const isLiked = Boolean(clientId && likes.some((l) => l.postId === p.id && l.clientId === clientId));
      const isFollowing = Boolean(clientId && follows.some((f) => f.farmer === p.farmer && f.clientId === clientId));
      return {
        id: p.id,
        farmer: p.farmer,
        location: p.location,
        type: p.type,
        title: p.title,
        description: p.description,
        tags: Array.isArray(p.tags) ? p.tags : [],
        mediaUrl: p.mediaUrl || null,
        likeCount,
        commentCount,
        isLiked,
        isFollowing,
      };
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Match both '' and '/' (mount at /api/posts leaves path as '' for POST /api/posts)
const createPostHandler = async (req, res) => {
  try {
    const farmer = req.body.farmer || 'My Farm';
    const location = req.body.location || '';
    const type = (req.body.type || 'Photo').trim();
    const title = (req.body.title || '').trim();
    const description = (req.body.description || '').trim();
    const tagsStr = req.body.tags || '';
    const tags = tagsStr ? tagsStr.split(',').map((s) => s.trim()).filter(Boolean) : [];

    if (!title) {
      return res.status(400).json({ error: 'title is required' });
    }

    let mediaUrl = null;
    if (req.file && req.file.filename) {
      mediaUrl = `/uploads/${req.file.filename}`;
    }

    const posts = await getTable('posts');
    const newPost = {
      id: nextId(posts),
      farmer,
      location,
      type: type === 'Video' ? 'Video' : 'Photo',
      title,
      description,
      tags,
      mediaUrl,
    };
    await setTable('posts', [...posts, newPost]);

    res.status(201).json({
      ...newPost,
      likeCount: 0,
      commentCount: 0,
      isLiked: false,
      isFollowing: false,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
router.post('/', upload.single('media'), createPostHandler);
router.post('', upload.single('media'), createPostHandler);

router.post('/:id/like', express.json(), async (req, res) => {
  try {
    const postId = Number(req.params.id);
    const clientId = req.body.clientId;
    if (!clientId) return res.status(400).json({ error: 'clientId required' });

    const posts = await getTable('posts');
    if (!posts.some((p) => p.id === postId)) return res.status(404).json({ error: 'Post not found' });

    const likes = await getTable('post_likes');
    const key = { postId, clientId };
    const existing = likes.findIndex((l) => l.postId === postId && l.clientId === clientId);
    let next;
    if (existing >= 0) {
      next = likes.filter((_, i) => i !== existing);
    } else {
      next = [...likes, key];
    }
    await setTable('post_likes', next);
    const likeCount = next.filter((l) => l.postId === postId).length;
    res.json({ liked: existing < 0, likeCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/comments', async (req, res) => {
  try {
    const postId = Number(req.params.id);
    const comments = (await getTable('post_comments')).filter((c) => c.postId === postId);
    res.json(comments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/comments', express.json(), async (req, res) => {
  try {
    const postId = Number(req.params.id);
    const author = (req.body.author || 'Anonymous').trim();
    const text = (req.body.text || '').trim();
    if (!text) return res.status(400).json({ error: 'text required' });

    const posts = await getTable('posts');
    if (!posts.some((p) => p.id === postId)) return res.status(404).json({ error: 'Post not found' });

    const comments = await getTable('post_comments');
    const newComment = {
      id: nextId(comments),
      postId,
      author,
      text,
      createdAt: new Date().toISOString(),
    };
    await setTable('post_comments', [...comments, newComment]);
    res.status(201).json(newComment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/follow', express.json(), async (req, res) => {
  try {
    const postId = Number(req.params.id);
    const clientId = req.body.clientId;
    if (!clientId) return res.status(400).json({ error: 'clientId required' });

    const posts = await getTable('posts');
    const post = posts.find((p) => p.id === postId);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    const farmer = post.farmer;

    const follows = await getTable('follows');
    const existing = follows.findIndex((f) => f.farmer === farmer && f.clientId === clientId);
    let next;
    if (existing >= 0) {
      next = follows.filter((_, i) => i !== existing);
    } else {
      next = [...follows, { clientId, farmer }];
    }
    await setTable('follows', next);
    const isFollowing = next.some((f) => f.farmer === farmer && f.clientId === clientId);
    res.json({ following: isFollowing });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
