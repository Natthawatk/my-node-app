import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

let pool;

export const initDB = async () => {
  pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL === 'true',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });

  const connection = await pool.getConnection();

  await connection.execute(`
    CREATE TABLE IF NOT EXISTS user (
      user_id BIGINT AUTO_INCREMENT PRIMARY KEY,
      phone VARCHAR(20) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      name VARCHAR(150) NOT NULL,
      avatar_url TEXT,
      role ENUM('CUSTOMER','RIDER','ADMIN') DEFAULT 'CUSTOMER',
      vehicle_photo_url TEXT,
      license_plate VARCHAR(32) UNIQUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await connection.execute(`
    CREATE TABLE IF NOT EXISTS delivery (
      delivery_id BIGINT AUTO_INCREMENT PRIMARY KEY,
      sender_id BIGINT,
      receiver_id BIGINT,
      pickup_address_id BIGINT,
      dropoff_address_id BIGINT,
      status ENUM('WAITING','ASSIGNED','ON_ROUTE','DELIVERED') DEFAULT 'WAITING',
      requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      assigned_at DATETIME,
      picked_at DATETIME,
      delivered_at DATETIME,
      note TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (sender_id) REFERENCES user(user_id),
      FOREIGN KEY (receiver_id) REFERENCES user(user_id)
    )
  `);

  await connection.execute(`
    CREATE TABLE IF NOT EXISTS address (
      address_id BIGINT AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT,
      label VARCHAR(80),
      address_line TEXT,
      lat DECIMAL(10,7),
      lng DECIMAL(10,7),
      is_default BOOLEAN DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES user(user_id)
    )
  `);

  await connection.execute(`
    CREATE TABLE IF NOT EXISTS delivery_item (
      item_id BIGINT AUTO_INCREMENT PRIMARY KEY,
      delivery_id BIGINT,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      weight_kg DECIMAL(10,3),
      qty INT DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (delivery_id) REFERENCES delivery(delivery_id) ON DELETE CASCADE
    )
  `);

  await connection.execute(`
    CREATE TABLE IF NOT EXISTS delivery_photo (
      photo_id BIGINT AUTO_INCREMENT PRIMARY KEY,
      delivery_id BIGINT,
      status_code ENUM('REQUESTED','PICKED_UP','DELIVERED') NOT NULL,
      uploaded_by ENUM('SENDER','RIDER') NOT NULL,
      photo_url TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (delivery_id) REFERENCES delivery(delivery_id) ON DELETE CASCADE
    )
  `);

  await connection.execute(`
    CREATE TABLE IF NOT EXISTS rider_assignment (
      assignment_id BIGINT AUTO_INCREMENT PRIMARY KEY,
      delivery_id BIGINT UNIQUE,
      user_id BIGINT,
      state ENUM('ASSIGNED','PICKED','COMPLETED','CANCELLED') DEFAULT 'ASSIGNED',
      accepted_at DATETIME,
      picked_at DATETIME,
      completed_at DATETIME,
      active_flag INT DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (delivery_id) REFERENCES delivery(delivery_id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES user(user_id) ON DELETE CASCADE
    )
  `);

  await connection.execute(`
    CREATE TABLE IF NOT EXISTS rider_location (
      location_id BIGINT AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT,
      delivery_id BIGINT,
      lat DECIMAL(10,7),
      lng DECIMAL(10,7),
      recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES user(user_id) ON DELETE CASCADE,
      FOREIGN KEY (delivery_id) REFERENCES delivery(delivery_id) ON DELETE SET NULL
    )
  `);

  // Create default users if not exists
  const [existingUser] = await connection.execute('SELECT user_id FROM user WHERE phone = ?', ['0911234567']);
  if (existingUser.length === 0) {
    const bcrypt = await import('bcryptjs');
    const hashedPassword = await bcrypt.default.hash('1234', 10);

    // Create multiple test users
    const testUsers = [
      ['0911234567', 'Default User', 'CUSTOMER'],
      ['0912345678', 'Chloe', 'CUSTOMER'],
      ['0923456789', 'Owen', 'CUSTOMER'],
      ['0934567890', 'Amelia', 'CUSTOMER'],
      ['0945678901', 'Lucas', 'CUSTOMER']
    ];

    for (const [phone, name, role] of testUsers) {
      await connection.execute(
        'INSERT INTO user (phone, password_hash, name, role) VALUES (?, ?, ?, ?)',
        [phone, hashedPassword, name, role]
      );
    }

    // Create sample addresses
    const sampleAddresses = [
      [1, 'Home', '123 Main St, Anytown, USA', 37.7749, -122.4194, 1],
      [2, 'Home', '456 Oak Ave, Downtown, USA', 37.7849, -122.4094, 1],
      [3, 'Home', '789 Pine Rd, Uptown, USA', 37.7949, -122.3994, 1],
      [4, 'Home', '321 Elm St, Midtown, USA', 37.8049, -122.3894, 1],
      [5, 'Home', '654 Maple Dr, Suburb, USA', 37.8149, -122.3794, 1]
    ];

    for (const [userId, label, addressLine, lat, lng, isDefault] of sampleAddresses) {
      await connection.execute(
        'INSERT INTO address (user_id, label, address_line, lat, lng, is_default) VALUES (?, ?, ?, ?, ?, ?)',
        [userId, label, addressLine, lat, lng, isDefault]
      );
    }

    // Create sample deliveries
    const sampleDeliveries = [
      [1, 2, 1, 2, 'Package from electronics store', 'WAITING'],
      [1, 3, 1, 3, 'Documents delivery', 'ASSIGNED'],
      [1, 4, 1, 4, 'Food delivery', 'ON_ROUTE'],
      [1, 5, 1, 5, 'Gift package', 'DELIVERED']
    ];

    for (const [senderId, receiverId, pickupId, dropoffId, note, status] of sampleDeliveries) {
      await connection.execute(
        'INSERT INTO delivery (sender_id, receiver_id, pickup_address_id, dropoff_address_id, note, status) VALUES (?, ?, ?, ?, ?, ?)',
        [senderId, receiverId, pickupId, dropoffId, note, status]
      );
    }

    console.log('✓ Default users and deliveries created');
  }

  connection.release();
  console.log('MySQL database initialized');
  return pool;
};

export const getDB = () => pool;

export { pool };

export const dbConnected = async () => {
  try {
    if (!pool) await initDB();
    const connection = await pool.getConnection();
    connection.release();
    return true;
  } catch (error) {
    console.error('Database connection failed:', error);
    return false;
  }
};