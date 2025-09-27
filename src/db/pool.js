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
  
  // Create default user if not exists
  const existingUser = await db.get('SELECT user_id FROM user WHERE phone = ?', ['0911234567']);
  if (!existingUser) {
    const bcrypt = await import('bcryptjs');
    const hashedPassword = await bcrypt.default.hash('1234', 10);
    await db.run(
      'INSERT INTO user (phone, password_hash, name, role) VALUES (?, ?, ?, ?)',
      ['0911234567', hashedPassword, 'Default User', 'CUSTOMER']
    );
    console.log('✓ Default user created');
  }
  
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