const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');

const DB_DIR = process.env.DB_PATH || path.join(__dirname, '..', '..', 'database');
const DB_FILE = path.join(DB_DIR, 'data.json');

const defaultData = {
  posts: [],
  guides: [],
  equipment: [],
  workers: [],
  jobs: [],
  products: [],
  sales_items: [],
  courses: [],
  post_likes: [],
  post_comments: [],
  follows: [],
  // Knowledge / live Q&A data
  knowledge_sessions: [],
  knowledge_questions: [],
  knowledge_subscriptions: [],
};

// ---------- File-based implementation (fallback if DATABASE_URL not set) ----------

function ensureDir() {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
}

function loadFile() {
  ensureDir();
  if (!fs.existsSync(DB_FILE)) {
    return JSON.parse(JSON.stringify(defaultData));
  }
  try {
    const loaded = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    Object.keys(defaultData).forEach((k) => {
      if (loaded[k] === undefined) loaded[k] = defaultData[k];
    });
    return loaded;
  } catch {
    return JSON.parse(JSON.stringify(defaultData));
  }
}

function saveFile(data) {
  ensureDir();
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// ---------- Postgres (Neon) implementation ----------

const usePostgres = !!process.env.DATABASE_URL;
let pool = null;
let cache = null;
let initPromise = null;

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
  }
  return pool;
}

async function ensurePgSchema() {
  const client = await getPool().connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS agrovibes_state (
        id INT PRIMARY KEY,
        data JSONB NOT NULL
      );
    `);
    await client.query(
      'INSERT INTO agrovibes_state (id, data) VALUES (1, $1) ON CONFLICT (id) DO NOTHING',
      [defaultData],
    );
  } finally {
    client.release();
  }
}

async function loadPg() {
  await ensurePgSchema();
  const { rows } = await getPool().query('SELECT data FROM agrovibes_state WHERE id = 1');
  const loaded = rows[0]?.data || {};
  const data = { ...defaultData, ...loaded };
  Object.keys(defaultData).forEach((k) => {
    if (data[k] === undefined) data[k] = defaultData[k];
  });
  return data;
}

async function savePg(data) {
  await ensurePgSchema();
  await getPool().query('UPDATE agrovibes_state SET data = $1 WHERE id = 1', [data]);
}

// ---------- Public API (async for Neon, sync for file) ----------

async function init() {
  if (!usePostgres) {
    cache = loadFile();
    const hasData = cache.posts && cache.posts.length > 0;
    if (!hasData) {
      const seed = require('./seedData');
      cache = seed();
      saveFile(cache);
    }
    return cache;
  }

  if (!initPromise) {
    initPromise = (async () => {
      try {
        cache = await loadPg();
        const hasData = cache.posts && cache.posts.length > 0;
        if (!hasData) {
          const seed = require('./seedData');
          cache = seed();
          await savePg(cache);
        }
        return cache;
      } catch (err) {
        console.error('Failed to init Neon DB, falling back to in-memory:', err);
        cache = JSON.parse(JSON.stringify(defaultData));
        return cache;
      }
    })();
  }
  return initPromise;
}

async function get() {
  if (!cache) {
    await init();
  }
  return cache;
}

async function getTable(name) {
  const key = name === 'sales' ? 'sales_items' : name;
  const data = await get();
  return data[key] || [];
}

async function setTable(name, rows) {
  const key = name === 'sales' ? 'sales_items' : name;
  const data = await get();
  data[key] = rows;
  cache = data;

  if (!usePostgres) {
    saveFile(data);
  } else {
    try {
      await savePg(data);
    } catch (err) {
      console.error('Failed to persist data to Neon:', err);
    }
  }
}

module.exports = {
  get,
  getTable,
  setTable,
  init,
  // export file helpers for any tooling that still uses them
  load: loadFile,
  save: saveFile,
  DB_FILE,
};
