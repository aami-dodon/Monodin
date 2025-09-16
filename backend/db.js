const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.connect()
  .then(client => {
    return client
      .query("SELECT NOW()")
      .then(res => {
        console.log("DB connected! Server time:", res.rows[0].now);
        client.release();
      })
      .catch(err => {
        client.release();
        console.error("DB test query error:", err.stack);
      });
  })
  .catch(err => {
    console.error("DB connection error:", err.stack);
  });

module.exports = pool;