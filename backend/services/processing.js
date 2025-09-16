const fs = require("fs/promises");
const Tesseract = require("tesseract.js");
const Sentiment = require("sentiment");
const { pool } = require("../db");
const { extractInsights } = require("../utils/insights");

const sentimentEngine = new Sentiment();

const runOcr = async (imagePath) => {
  try {
    await fs.access(imagePath);
  } catch (error) {
    throw new Error("Image not found for OCR processing");
  }

  const { data } = await Tesseract.recognize(imagePath, "eng", {
    logger: (m) => {
      if (process.env.OCR_DEBUG === "true" && m.status) {
        console.log(`[OCR] ${m.status} ${(m.progress * 100).toFixed(0)}%`);
      }
    },
  });

  return (data.text || "").trim();
};

const processEntry = async ({ entryId, imagePath }) => {
  try {
    const rawText = await runOcr(imagePath);
    const insights = extractInsights(rawText, sentimentEngine);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE journal_entries
         SET raw_text = $1,
             status = 'done',
             error_message = NULL,
             updated_at = NOW()
         WHERE id = $2`,
        [rawText, entryId]
      );

      await client.query(
        `INSERT INTO insights
           (entry_id, sentiment_label, sentiment_score, emotions, tasks, goals)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (entry_id) DO UPDATE
           SET sentiment_label = EXCLUDED.sentiment_label,
               sentiment_score = EXCLUDED.sentiment_score,
               emotions = EXCLUDED.emotions,
               tasks = EXCLUDED.tasks,
               goals = EXCLUDED.goals,
               created_at = NOW()`
          ,
        [
          entryId,
          insights.sentiment.label,
          insights.sentiment.score,
          JSON.stringify(insights.emotions),
          JSON.stringify(insights.tasks),
          JSON.stringify(insights.goals),
        ]
      );

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error(`Processing failed for entry ${entryId}`, error);
    const client = await pool.connect();
    try {
      await client.query(
        `UPDATE journal_entries
         SET status = 'failed',
             error_message = $1,
             updated_at = NOW()
         WHERE id = $2`,
        [error.message, entryId]
      );
    } catch (updateError) {
      console.error("Failed to mark entry as failed", updateError);
    } finally {
      client.release();
    }
  }
};

module.exports = { processEntry };
