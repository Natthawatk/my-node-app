import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import dotenv from 'dotenv';

dotenv.config();

let db;

export const initDB = async () => {
  db = await open({
    filename: './database.db',
    driver: sqlite3.Database
  });
  
  await db.exec(`
    CREATE TABLE IF NOT EXISTS user (
      user_id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT UNIQUE,
      password_hash TEXT,
      name TEXT,
      role TEXT DEFAULT 'CUSTOMER'
    )
  `);
  
  console.log('SQLite database initialized');
  return db;
};

export const getDB = () => db;

export const dbConnected = async () => {
  try {
    if (!db) await initDB();
    return true;
  } catch (error) {
    console.error('Database connection failed:', error);
    return false;
  }
};