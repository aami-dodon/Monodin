const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
require("dotenv").config();
const { pool, ensureSchema } = require("./db");
const authRoutes = require("./routes/auth");
const journalRoutes = require("./routes/journal");
const dashboardRoutes = require("./routes/dashboard");
const { authenticate } = require("./middleware/auth");

const app = express();
const PORT = process.env.PORT || 5000;

const allowedOrigins = process.env.CLIENT_ORIGIN
  ? process.env.CLIENT_ORIGIN.split(",")
  : undefined;

app.use(
  cors({
    origin: allowedOrigins || "*",
  })
);
app.use(express.json({ limit: "10mb" }));

const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
app.use("/uploads", express.static(uploadDir));

app.get("/api", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW() AS now");
    res.json({ status: "ok", time: result.rows[0].now });
  } catch (error) {
    console.error("Healthcheck error", error);
    res.status(500).json({ status: "error", message: "Database error" });
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/journal", authenticate, journalRoutes);
app.use("/api/dashboard", authenticate, dashboardRoutes);

ensureSchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Failed to initialise database schema", error);
    process.exit(1);
  });

module.exports = app;
