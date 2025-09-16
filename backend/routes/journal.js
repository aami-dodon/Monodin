const express = require("express");
const path = require("path");
const fsPromises = require("fs/promises");
const multer = require("multer");
const dayjs = require("dayjs");
const { v4: uuid } = require("uuid");
const { pool } = require("../db");
const { processEntry } = require("../services/processing");

const router = express.Router();

const uploadsDir = path.join(__dirname, "..", "uploads");

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadsDir),
  filename: (_, file, cb) => {
    const ext = path.extname(file.originalname) || ".jpg";
    cb(null, `${uuid()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      cb(new Error("Only image uploads are allowed"));
    } else {
      cb(null, true);
    }
  },
});

const parseDate = (value) => {
  if (!value) return dayjs();
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed : dayjs();
};

const formatEntry = (row) => ({
  id: row.id,
  user_id: row.user_id,
  entry_date: row.entry_date,
  original_filename: row.original_filename,
  image_path: row.image_path,
  status: row.status,
  error_message: row.error_message,
  raw_text: row.raw_text,
  created_at: row.created_at,
  updated_at: row.updated_at,
  insight: row.sentiment_label
    ? {
        sentiment_label: row.sentiment_label,
        sentiment_score: row.sentiment_score,
        emotions: row.emotions || {},
        tasks: row.tasks || [],
        goals: row.goals || [],
      }
    : null,
});

router.post("/", upload.single("image"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "Image is required" });
  }

  const journalDate = parseDate(req.body.entryDate).format("YYYY-MM-DD");

  const storedFilename = req.file.filename;
  const absolutePath = path.join(uploadsDir, storedFilename);
  const relativePath = path.posix.join("uploads", storedFilename);

  const client = await pool.connect();
  try {
    const result = await client.query(
      `INSERT INTO journal_entries
        (user_id, entry_date, image_path, original_filename, status)
       VALUES ($1, $2, $3, $4, 'processing')
       RETURNING id, user_id, entry_date, image_path, original_filename,
                 status, error_message, raw_text, created_at, updated_at`,
      [
        req.user.id,
        journalDate,
        relativePath,
        req.file.originalname,
      ]
    );

    const entry = formatEntry(result.rows[0]);
    res.status(201).json({ entry });

    processEntry({
      entryId: entry.id,
      imagePath: absolutePath,
      relativeImagePath: relativePath,
      userId: req.user.id,
    }).catch((error) => {
      console.error("Failed to queue journal entry processing", error);
    });
  } catch (error) {
    console.error("Journal upload error", error);
    res.status(500).json({ message: "Failed to save journal entry" });
  } finally {
    client.release();
  }
});

router.get("/", async (req, res) => {
  const { from, to, status } = req.query;
  const conditions = ["je.user_id = $1"];
  const values = [req.user.id];
  let index = 2;

  if (from) {
    conditions.push(`je.entry_date >= $${index}`);
    values.push(from);
    index += 1;
  }

  if (to) {
    conditions.push(`je.entry_date <= $${index}`);
    values.push(to);
    index += 1;
  }

  if (status) {
    conditions.push(`je.status = $${index}`);
    values.push(status);
    index += 1;
  }

  const query = `
    SELECT je.*, i.sentiment_label, i.sentiment_score, i.emotions, i.tasks, i.goals
    FROM journal_entries je
    LEFT JOIN insights i ON i.entry_id = je.id
    WHERE ${conditions.join(" AND ")}
    ORDER BY je.entry_date DESC, je.created_at DESC
  `;

  try {
    const result = await pool.query(query, values);
    const entries = result.rows.map((row) => {
      if (row.emotions && typeof row.emotions === "string") {
        row.emotions = JSON.parse(row.emotions);
      }
      if (row.tasks && typeof row.tasks === "string") {
        row.tasks = JSON.parse(row.tasks);
      }
      if (row.goals && typeof row.goals === "string") {
        row.goals = JSON.parse(row.goals);
      }
      return formatEntry(row);
    });

    res.json({ entries });
  } catch (error) {
    console.error("List journal entries error", error);
    res.status(500).json({ message: "Failed to load entries" });
  }
});

router.get("/:id", async (req, res) => {
  const entryId = req.params.id;
  try {
    const result = await pool.query(
      `SELECT je.*, i.sentiment_label, i.sentiment_score, i.emotions, i.tasks, i.goals
       FROM journal_entries je
       LEFT JOIN insights i ON i.entry_id = je.id
       WHERE je.id = $1 AND je.user_id = $2`,
      [entryId, req.user.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Entry not found" });
    }

    const row = result.rows[0];
    if (row.emotions && typeof row.emotions === "string") {
      row.emotions = JSON.parse(row.emotions);
    }
    if (row.tasks && typeof row.tasks === "string") {
      row.tasks = JSON.parse(row.tasks);
    }
    if (row.goals && typeof row.goals === "string") {
      row.goals = JSON.parse(row.goals);
    }
    res.json({ entry: formatEntry(row) });
  } catch (error) {
    console.error("Fetch journal entry error", error);
    res.status(500).json({ message: "Failed to load entry" });
  }
});

router.delete("/:id", async (req, res) => {
  const entryId = req.params.id;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const entryResult = await client.query(
      `SELECT image_path FROM journal_entries
       WHERE id = $1 AND user_id = $2 FOR UPDATE`,
      [entryId, req.user.id]
    );

    if (entryResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Entry not found" });
    }

    await client.query("DELETE FROM insights WHERE entry_id = $1", [entryId]);
    await client.query("DELETE FROM journal_entries WHERE id = $1", [entryId]);
    await client.query("COMMIT");

    const storedPath = entryResult.rows[0].image_path;
    if (storedPath) {
      const absolutePath = path.join(__dirname, "..", storedPath);
      fsPromises.unlink(absolutePath).catch((error) => {
        if (error.code !== "ENOENT") {
          console.error("Failed to delete journal image", error);
        }
      });
    }

    res.status(204).end();
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Delete journal entry error", error);
    res.status(500).json({ message: "Failed to delete entry" });
  } finally {
    client.release();
  }
});

module.exports = router;
