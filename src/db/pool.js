import mysql from 'mysql2/promise';

let pool;
let dbConnected = false;

try {
  pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: 3306,
    waitForConnections: true,
    connectionLimit: 10,
  });


} catch (err) {
  console.error('Failed to create database pool:', err.message);
}

export { pool, dbConnected };
