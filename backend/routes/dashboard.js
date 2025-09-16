const express = require("express");
const dayjs = require("dayjs");
const { pool } = require("../db");

const router = express.Router();

const coerceJson = (value) => {
  if (!value) return value;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    return value;
  }
};

const formatEntry = (row) => ({
  id: row.id,
  entry_date: row.entry_date,
  status: row.status,
  raw_text: row.raw_text,
  sentiment_label: row.sentiment_label,
  sentiment_score: row.sentiment_score,
  emotions: coerceJson(row.emotions) || {},
  tasks: coerceJson(row.tasks) || [],
  goals: coerceJson(row.goals) || [],
});

router.get("/summary", async (req, res) => {
  const range = parseInt(req.query.range, 10) || 30;
  const toDate = req.query.to ? dayjs(req.query.to) : dayjs();
  const fromDate = req.query.from
    ? dayjs(req.query.from)
    : toDate.subtract(range - 1, "day");

  if (!fromDate.isValid() || !toDate.isValid()) {
    return res.status(400).json({ message: "Invalid date range" });
  }

  try {
    const result = await pool.query(
      `SELECT je.id, je.entry_date, je.status, je.raw_text,
              i.sentiment_label, i.sentiment_score, i.emotions, i.tasks, i.goals
         FROM journal_entries je
         LEFT JOIN insights i ON i.entry_id = je.id
        WHERE je.user_id = $1 AND je.entry_date BETWEEN $2 AND $3
        ORDER BY je.entry_date ASC`,
      [req.user.id, fromDate.format("YYYY-MM-DD"), toDate.format("YYYY-MM-DD")]
    );

    const sentimentByDate = new Map();
    const emotionTotals = {};
    const taskSummary = { total: 0, todo: 0, "in-progress": 0, done: 0 };
    const goalSummary = { total: 0, short_term: 0, long_term: 0 };
    const sentimentCounts = { positive: 0, neutral: 0, negative: 0 };
    const statusBreakdown = { processing: 0, done: 0, failed: 0 };

    const entries = result.rows.map((row) => {
      const entry = formatEntry(row);

      if (entry.sentiment_label) {
        sentimentCounts[entry.sentiment_label] += 1;
      }
      if (typeof entry.sentiment_score === "number") {
        const key = dayjs(entry.entry_date).format("YYYY-MM-DD");
        const bucket = sentimentByDate.get(key) || { total: 0, count: 0 };
        bucket.total += Number(entry.sentiment_score);
        bucket.count += 1;
        sentimentByDate.set(key, bucket);
      }

      Object.entries(entry.emotions || {}).forEach(([emotion, value]) => {
        emotionTotals[emotion] = (emotionTotals[emotion] || 0) + Number(value || 0);
      });

      if (Array.isArray(entry.tasks)) {
        entry.tasks.forEach((task) => {
          const status = task.status || "todo";
          taskSummary.total += 1;
          if (taskSummary[status] !== undefined) {
            taskSummary[status] += 1;
          }
        });
      }

      if (Array.isArray(entry.goals)) {
        entry.goals.forEach((goal) => {
          const horizon = goal.horizon || "long_term";
          goalSummary.total += 1;
          if (goalSummary[horizon] !== undefined) {
            goalSummary[horizon] += 1;
          }
        });
      }

      if (statusBreakdown[entry.status] !== undefined) {
        statusBreakdown[entry.status] += 1;
      }

      return entry;
    });

    const sentimentTrend = Array.from(sentimentByDate.entries())
      .map(([date, bucket]) => ({
        date,
        average: bucket.count > 0 ? bucket.total / bucket.count : 0,
      }))
      .sort((a, b) => (a.date < b.date ? -1 : 1));

    res.json({
      range: {
        from: fromDate.format("YYYY-MM-DD"),
        to: toDate.format("YYYY-MM-DD"),
      },
      sentimentTrend,
      emotionDistribution: emotionTotals,
      taskSummary,
      goalSummary,
      sentimentCounts,
      statusBreakdown,
      entries,
    });
  } catch (error) {
    console.error("Dashboard summary error", error);
    res.status(500).json({ message: "Failed to load dashboard data" });
  }
});

module.exports = router;
