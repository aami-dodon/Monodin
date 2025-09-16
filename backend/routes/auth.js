const express = require("express");
const bcrypt = require("bcryptjs");
const { pool } = require("../db");
const { authenticate, generateToken } = require("../middleware/auth");

const router = express.Router();

const normalizeEmail = (email) => email.trim().toLowerCase();

const publicUser = (user) => ({
  id: user.id,
  email: user.email,
  name: user.name,
  created_at: user.created_at,
});

router.post("/register", async (req, res) => {
  const { email, password, name } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }

  if (password.length < 6) {
    return res.status(400).json({ message: "Password must be at least 6 characters" });
  }

  const client = await pool.connect();

  try {
    const normalizedEmail = normalizeEmail(email);
    const existing = await client.query("SELECT id FROM users WHERE email = $1", [
      normalizedEmail,
    ]);
    if (existing.rowCount > 0) {
      return res.status(409).json({ message: "Email already registered" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await client.query(
      `INSERT INTO users (email, password_hash, name)
       VALUES ($1, $2, $3)
       RETURNING id, email, name, created_at`,
      [normalizedEmail, passwordHash, name || null]
    );

    const user = result.rows[0];
    const token = generateToken(user);
    res.status(201).json({ token, user: publicUser(user) });
  } catch (error) {
    console.error("Registration error", error);
    res.status(500).json({ message: "Failed to register" });
  } finally {
    client.release();
  }
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }

  const client = await pool.connect();
  try {
    const normalizedEmail = normalizeEmail(email);
    const result = await client.query(
      `SELECT id, email, password_hash, name, created_at
       FROM users WHERE email = $1`,
      [normalizedEmail]
    );

    if (result.rowCount === 0) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const user = result.rows[0];
    const passwordValid = await bcrypt.compare(password, user.password_hash);

    if (!passwordValid) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = generateToken(user);
    res.json({ token, user: publicUser(user) });
  } catch (error) {
    console.error("Login error", error);
    res.status(500).json({ message: "Failed to login" });
  } finally {
    client.release();
  }
});

router.get("/me", authenticate, async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT id, email, name, created_at FROM users WHERE id = $1`,
      [req.user.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error("Fetch current user error", error);
    res.status(500).json({ message: "Failed to load user" });
  } finally {
    client.release();
  }
});

module.exports = router;
