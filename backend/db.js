const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.PGSSLMODE === "require" || process.env.PGSSL === "true"
      ? { rejectUnauthorized: false }
      : undefined,
});

const ensureSchema = async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS journal_entries (
        id BIGSERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        entry_date DATE NOT NULL,
        image_path TEXT NOT NULL,
        original_filename TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'processing',
        error_message TEXT,
        raw_text TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS insights (
        id BIGSERIAL PRIMARY KEY,
        entry_id BIGINT REFERENCES journal_entries(id) ON DELETE CASCADE,
        sentiment_label TEXT,
        sentiment_score NUMERIC,
        emotions JSONB,
        tasks JSONB,
        goals JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(entry_id)
      );
    `);

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Schema initialization error:", error);
    throw error;
  } finally {
    client.release();
  }
};

module.exports = { pool, ensureSchema };
