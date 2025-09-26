import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

export const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: process.env.DB_SSL === 'true',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

export const dbConnected = async () => {
  try {
    await pool.getConnection();
    console.log('Database connected');
    return true;
  } catch (error) {
    console.error('Database connection failed:', error);
    return false;
  }
};