const express = require('express');
const { getTable, setTable } = require('../db');

const router = express.Router();

function nextId(rows) {
  return rows.length ? Math.max(...rows.map((r) => r.id)) + 1 : 1;
}

// GET /api/knowledge/sessions?clientId=...
router.get('/sessions', async (req, res) => {
  try {
    const clientId = (req.query.clientId || '').trim();
    const sessions = await getTable('knowledge_sessions');
    const questions = await getTable('knowledge_questions');
    const subs = await getTable('knowledge_subscriptions');

    const enriched = sessions.map((s) => {
      const sessionQuestions = questions.filter((q) => q.sessionId === s.id);
      const sessionSubs = subs.filter((sub) => sub.sessionId === s.id);
      const isSubscribed = Boolean(
        clientId && sessionSubs.some((sub) => sub.clientId === clientId),
      );

      return {
        id: s.id,
        title: s.title,
        description: s.description || '',
        schedule: s.schedule || '',
        host: s.host || '',
        status: s.status || 'upcoming',
        guideId: s.guideId || null,
        questionCount: sessionQuestions.length,
        subscriberCount: sessionSubs.length,
        isSubscribed,
      };
    });

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/knowledge/sessions - create a new session (simple admin tool)
router.post('/sessions', async (req, res) => {
  try {
    const { title, description, schedule, host, status, guideId } = req.body || {};
    const trimmedTitle = (title || '').trim();
    if (!trimmedTitle) {
      return res.status(400).json({ error: 'title is required' });
    }

    const sessions = await getTable('knowledge_sessions');
    const newSession = {
      id: nextId(sessions),
      title: trimmedTitle,
      description: (description || '').trim(),
      schedule: (schedule || '').trim(),
      host: (host || '').trim(),
      status: (status || 'upcoming').trim(),
      guideId: guideId != null ? Number(guideId) : null,
    };
    await setTable('knowledge_sessions', [...sessions, newSession]);
    res.status(201).json(newSession);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/knowledge/sessions/:id - delete a session and its related data
router.delete('/sessions/:id', async (req, res) => {
  try {
    const sessionId = Number(req.params.id);
    if (!Number.isFinite(sessionId)) {
      return res.status(400).json({ error: 'invalid session id' });
    }

    const sessions = await getTable('knowledge_sessions');
    if (!sessions.some((s) => s.id === sessionId)) {
      return res.status(404).json({ error: 'session not found' });
    }

    const questions = await getTable('knowledge_questions');
    const subs = await getTable('knowledge_subscriptions');

    const nextSessions = sessions.filter((s) => s.id !== sessionId);
    const nextQuestions = questions.filter((q) => q.sessionId !== sessionId);
    const nextSubs = subs.filter((sub) => sub.sessionId !== sessionId);

    await setTable('knowledge_sessions', nextSessions);
    await setTable('knowledge_questions', nextQuestions);
    await setTable('knowledge_subscriptions', nextSubs);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/knowledge/sessions/:id/subscribe  { clientId }
router.post('/sessions/:id/subscribe', async (req, res) => {
  try {
    const sessionId = Number(req.params.id);
    const clientId = (req.body && req.body.clientId ? String(req.body.clientId) : '').trim();
    if (!clientId) {
      return res.status(400).json({ error: 'clientId is required' });
    }

    const sessions = await getTable('knowledge_sessions');
    if (!sessions.some((s) => s.id === sessionId)) {
      return res.status(404).json({ error: 'session not found' });
    }

    const subs = await getTable('knowledge_subscriptions');
    const existingIndex = subs.findIndex(
      (sub) => sub.sessionId === sessionId && sub.clientId === clientId,
    );
    let next;
    let subscribed;
    if (existingIndex >= 0) {
      // unsubscribe
      next = subs.filter((_, idx) => idx !== existingIndex);
      subscribed = false;
    } else {
      next = [...subs, { id: nextId(subs), sessionId, clientId }];
      subscribed = true;
    }
    await setTable('knowledge_subscriptions', next);
    const subscriberCount = next.filter((sub) => sub.sessionId === sessionId).length;
    res.json({ subscribed, subscriberCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/knowledge/sessions/:id/questions
router.get('/sessions/:id/questions', async (req, res) => {
  try {
    const sessionId = Number(req.params.id);
    const sessions = await getTable('knowledge_sessions');
    if (!sessions.some((s) => s.id === sessionId)) {
      return res.status(404).json({ error: 'session not found' });
    }
    const questions = await getTable('knowledge_questions');
    const list = questions
      .filter((q) => q.sessionId === sessionId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/knowledge/sessions/:id/questions  { author?, text }
router.post('/sessions/:id/questions', async (req, res) => {
  try {
    const sessionId = Number(req.params.id);
    const { author, text } = req.body || {};
    const trimmedText = (text || '').trim();
    if (!trimmedText) {
      return res.status(400).json({ error: 'text is required' });
    }
    const sessions = await getTable('knowledge_sessions');
    if (!sessions.some((s) => s.id === sessionId)) {
      return res.status(404).json({ error: 'session not found' });
    }
    const questions = await getTable('knowledge_questions');
    const newQuestion = {
      id: nextId(questions),
      sessionId,
      author: (author || 'Farmer').trim(),
      text: trimmedText,
      createdAt: new Date().toISOString(),
    };
    await setTable('knowledge_questions', [...questions, newQuestion]);
    res.status(201).json(newQuestion);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/knowledge/sessions/:sessionId/questions/:questionId
router.delete('/sessions/:sessionId/questions/:questionId', async (req, res) => {
  try {
    const sessionId = Number(req.params.sessionId);
    const questionId = Number(req.params.questionId);
    if (!Number.isFinite(sessionId) || !Number.isFinite(questionId)) {
      return res.status(400).json({ error: 'invalid id' });
    }

    const sessions = await getTable('knowledge_sessions');
    if (!sessions.some((s) => s.id === sessionId)) {
      return res.status(404).json({ error: 'session not found' });
    }

    const questions = await getTable('knowledge_questions');
    if (!questions.some((q) => q.id === questionId && q.sessionId === sessionId)) {
      return res.status(404).json({ error: 'question not found' });
    }

    const nextQuestions = questions.filter((q) => !(q.id === questionId && q.sessionId === sessionId));
    await setTable('knowledge_questions', nextQuestions);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

