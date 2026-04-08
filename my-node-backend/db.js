const { Pool } = require('pg');
require('dotenv').config();

// For local PostgreSQL
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// Test the connection and create users table if it doesn't exist
const initializeDB = async () => {
  try {
    const client = await pool.connect();
    console.log('✅ Connected to PostgreSQL');
    
    // Create users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        user_type VARCHAR(50) DEFAULT 'freelancer',
        skills TEXT[],
        bio TEXT,
        profile_picture VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Users table ready');
    
    client.release();
  } catch (error) {
    console.error('❌ Database initialization error:', error);
    console.error('❌ Please check your PostgreSQL connection settings in .env');
  }
};

initializeDB();

module.exports = pool;