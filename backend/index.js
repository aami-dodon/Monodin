const express = require("express");
const cors = require("cors");
require("dotenv").config();
const pool = require("./db"); // Add this if not already present

const app = express();

// Middleware
app.use(cors());           // allow cross-origin requests
app.use(express.json());   // parse JSON bodies

// Simple route
app.get("/api", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json({ time: result.rows[0].now });
  } catch (err) {
    console.error("DB error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
