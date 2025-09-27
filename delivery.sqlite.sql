-- ==========================================================
-- Delivery DB (SQLite version)
-- How to run:
--   sqlite3 delivery.db < delivery.sqlite.sql
-- ==========================================================

PRAGMA foreign_keys = ON;

-- (รันซ้ำได้) ลบตารางตามลำดับ FK
DROP TABLE IF EXISTS rider_location;
DROP TABLE IF EXISTS rider_assignment;
DROP TABLE IF EXISTS delivery_photo;
DROP TABLE IF EXISTS delivery_item;
DROP TABLE IF EXISTS delivery;
DROP TABLE IF EXISTS address;
DROP TABLE IF EXISTS user;

-- ==========================================================
-- USER (รวม Rider ด้วย role)
-- MySQL: BIGINT UNSIGNED + AUTO_INCREMENT + ENUM + ON UPDATE CURRENT_TIMESTAMP
-- SQLite: INTEGER PRIMARY KEY AUTOINCREMENT + TEXT CHECK + trigger อัปเดต updated_at
-- ==========================================================
CREATE TABLE user (
  user_id           INTEGER PRIMARY KEY AUTOINCREMENT,
  phone             TEXT NOT NULL,
  password_hash     TEXT NOT NULL,
  name              TEXT NOT NULL,
  avatar_url        TEXT,
  role              TEXT NOT NULL DEFAULT 'CUSTOMER'
                      CHECK (role IN ('CUSTOMER','RIDER','ADMIN')),
  vehicle_photo_url TEXT,               -- ใช้เมื่อ role = 'RIDER'
  license_plate     TEXT UNIQUE,        -- NULL ได้; UNIQUE อนุญาตหลาย NULL ใน SQLite
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_user_phone UNIQUE (phone)
);

-- อัปเดต updated_at อัตโนมัติเมื่อแก้ไข
CREATE TRIGGER user_set_updated_at
AFTER UPDATE ON user
FOR EACH ROW
BEGIN
  UPDATE user SET updated_at = CURRENT_TIMESTAMP WHERE user_id = NEW.user_id;
END;

-- ==========================================================
-- ADDRESS (ที่อยู่หลายรายการต่อผู้ใช้)
-- Note: DECIMAL → REAL, INDEX → CREATE INDEX แยกต่างหาก
-- ==========================================================
CREATE TABLE address (
  address_id   INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL,
  label        TEXT,
  address_line TEXT,
  lat          REAL,
  lng          REAL,
  is_default   INTEGER NOT NULL DEFAULT 0,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES user(user_id)
    ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE TRIGGER address_set_updated_at
AFTER UPDATE ON address
FOR EACH ROW
BEGIN
  UPDATE address SET updated_at = CURRENT_TIMESTAMP WHERE address_id = NEW.address_id;
END;

CREATE INDEX idx_address_user ON address(user_id);
CREATE INDEX idx_address_geo ON address(lat, lng);

-- ==========================================================
-- DELIVERY (งานส่งของ)
-- ENUM → TEXT CHECK, DATETIME OK, INDEX แยก
-- ==========================================================
CREATE TABLE delivery (
  delivery_id         INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_id           INTEGER NOT NULL,
  receiver_id         INTEGER NOT NULL,
  pickup_address_id   INTEGER NOT NULL,
  dropoff_address_id  INTEGER NOT NULL,
  status              TEXT NOT NULL DEFAULT 'WAITING'
                        CHECK (status IN ('WAITING','ASSIGNED','ON_ROUTE','DELIVERED')),
  requested_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  assigned_at         DATETIME,
  picked_at           DATETIME,
  delivered_at        DATETIME,
  note                TEXT,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (sender_id)  REFERENCES user(user_id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  FOREIGN KEY (receiver_id) REFERENCES user(user_id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  FOREIGN KEY (pickup_address_id)  REFERENCES address(address_id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  FOREIGN KEY (dropoff_address_id) REFERENCES address(address_id)
    ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE TRIGGER delivery_set_updated_at
AFTER UPDATE ON delivery
FOR EACH ROW
BEGIN
  UPDATE delivery SET updated_at = CURRENT_TIMESTAMP WHERE delivery_id = NEW.delivery_id;
END;

CREATE INDEX idx_delivery_status_time ON delivery(status, requested_at);
CREATE INDEX idx_delivery_sender ON delivery(sender_id);
CREATE INDEX idx_delivery_receiver ON delivery(receiver_id);

-- ==========================================================
-- DELIVERY_ITEM (หลายชิ้นต่อ 1 งาน)
-- DECIMAL/INT → REAL/INTEGER
-- ==========================================================
CREATE TABLE delivery_item (
  item_id      INTEGER PRIMARY KEY AUTOINCREMENT,
  delivery_id  INTEGER NOT NULL,
  name         TEXT NOT NULL,
  description  TEXT,
  weight_kg    REAL,
  qty          INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (delivery_id) REFERENCES delivery(delivery_id)
    ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE INDEX idx_item_delivery ON delivery_item(delivery_id);

-- ==========================================================
-- DELIVERY_PHOTO (หลักฐานภาพตามสถานะ)
-- ENUM → TEXT CHECK
-- ==========================================================
CREATE TABLE delivery_photo (
  photo_id     INTEGER PRIMARY KEY AUTOINCREMENT,
  delivery_id  INTEGER NOT NULL,
  status_code  TEXT NOT NULL
                 CHECK (status_code IN ('REQUESTED','PICKED_UP','DELIVERED')),
  uploaded_by  TEXT NOT NULL
                 CHECK (uploaded_by IN ('SENDER','RIDER')),
  photo_url    TEXT NOT NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (delivery_id) REFERENCES delivery(delivery_id)
    ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE INDEX idx_photo_delivery ON delivery_photo(delivery_id);
CREATE INDEX idx_photo_status   ON delivery_photo(status_code);

-- ==========================================================
-- RIDER_ASSIGNMENT (การรับงานของไรเดอร์)
-- generated column: SQLite รองรับ GENERATED ALWAYS AS (...) STORED
-- UNIQUE(delivery_id) + UNIQUE(user_id, active_flag) เมื่อ active_flag=1
-- ==========================================================
CREATE TABLE rider_assignment (
  assignment_id INTEGER PRIMARY KEY AUTOINCREMENT,
  delivery_id   INTEGER NOT NULL,
  user_id       INTEGER NOT NULL, -- rider = user.role='RIDER'
  state         TEXT NOT NULL DEFAULT 'ASSIGNED'
                  CHECK (state IN ('ASSIGNED','PICKED','COMPLETED','CANCELLED')),
  accepted_at   DATETIME,
  picked_at     DATETIME,
  completed_at  DATETIME,

  -- active_flag = 1 เมื่อยังทำงานอยู่ (ASSIGNED/PICKED) มิฉะนั้นเป็น NULL
  active_flag   INTEGER GENERATED ALWAYS AS (
                   CASE WHEN state IN ('ASSIGNED','PICKED') THEN 1 ELSE NULL END
                 ) STORED,

  FOREIGN KEY (delivery_id) REFERENCES delivery(delivery_id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  FOREIGN KEY (user_id)     REFERENCES user(user_id)
    ON UPDATE CASCADE ON DELETE RESTRICT,

  CONSTRAINT uq_assign_delivery UNIQUE (delivery_id),
  CONSTRAINT uq_rider_active   UNIQUE (user_id, active_flag)
);

CREATE INDEX idx_assign_user  ON rider_assignment(user_id);
CREATE INDEX idx_assign_state ON rider_assignment(state);

-- ==========================================================
-- RIDER_LOCATION (time-series พิกัดของไรเดอร์)
-- DECIMAL → REAL
-- ==========================================================
CREATE TABLE rider_location (
  location_id  INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL, -- rider = user.role='RIDER'
  delivery_id  INTEGER,          -- อาจผูกกับงานที่กำลังทำ
  lat          REAL NOT NULL,
  lng          REAL NOT NULL,
  recorded_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (user_id)     REFERENCES user(user_id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  FOREIGN KEY (delivery_id) REFERENCES delivery(delivery_id)
    ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE INDEX idx_loc_user_time     ON rider_location(user_id, recorded_at);
CREATE INDEX idx_loc_delivery_time ON rider_location(delivery_id, recorded_at);
