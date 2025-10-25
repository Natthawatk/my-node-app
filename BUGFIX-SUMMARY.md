# 🐛 Bug Fix Summary: Rider Current Job Issue

## ปัญหาที่พบ
Rider รับงานแล้ว แต่ไม่อยู่ในสถานะ `currentJob` และไม่สามารถรับงานใหม่ได้

## สาเหตุหลัก

### 1. ตาราง `rider_assignment` ไม่ถูกสร้าง
- ❌ ไฟล์ `pool.js` ไม่มีการสร้างตาราง `rider_assignment` และ `rider_location`
- ✅ **แก้ไข:** เพิ่มการสร้างตารางทั้งสองใน `initDB()`

### 2. `active_flag` เป็น `null` แทนที่จะเป็น `1`
- ❌ เมื่อ rider รับงาน `active_flag` ไม่ถูก set เป็น `1`
- ❌ Query `WHERE active_flag = 1` จึงหาไม่เจอ
- ✅ **แก้ไข:** ตรวจสอบว่า INSERT statement ระบุ `active_flag = 1` อย่างชัดเจน

### 3. เมื่อทำงานเสร็จ `active_flag` ไม่ถูก clear
- ❌ หลังจากส่งของเสร็จ (DELIVERED) `active_flag` ยังเป็น `1` อยู่
- ❌ Rider ไม่สามารถรับงานใหม่ได้เพราะ constraint `UNIQUE(user_id, active_flag)`
- ✅ **แก้ไข:** เปลี่ยนจาก `active_flag = 0` เป็น `active_flag = NULL` เพื่อหลีกเลี่ยง duplicate key error

### 4. Database Constraint Issue
- ❌ Constraint `UNIQUE(user_id, active_flag)` ไม่อนุญาตให้มี `active_flag = 0` ซ้ำกัน
- ✅ **วิธีแก้:** ใช้ `NULL` แทน `0` สำหรับงานที่เสร็จแล้ว (MySQL อนุญาตให้มี NULL ซ้ำได้)

## การแก้ไข

### ไฟล์ที่แก้ไข

#### 1. `my-node-app/src/db/pool.js`
```javascript
// เพิ่มการสร้างตาราง rider_assignment
await connection.execute(`
  CREATE TABLE IF NOT EXISTS rider_assignment (
    assignment_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    delivery_id BIGINT UNIQUE,
    user_id BIGINT,
    state ENUM('ASSIGNED','PICKED','COMPLETED','CANCELLED') DEFAULT 'ASSIGNED',
    accepted_at DATETIME,
    picked_at DATETIME,
    completed_at DATETIME,
    active_flag INT DEFAULT 1,  -- 1 = active, NULL = completed
    ...
  )
`);

// เพิ่มการสร้างตาราง rider_location
await connection.execute(`
  CREATE TABLE IF NOT EXISTS rider_location (...)
`);
```

#### 2. `my-node-app/src/controllers/delivery.controller.js`
```javascript
// เปลี่ยนจาก active_flag = 0 เป็น NULL
} else if (status === 'DELIVERED') {
  await connection.query(
    `UPDATE rider_assignment 
     SET state = 'COMPLETED', completed_at = NOW(), active_flag = NULL
     WHERE delivery_id = ? AND active_flag = 1`,
    [deliveryId]
  );
}
```

#### 3. `my-node-app/src/controllers/rider.controller.js`
```javascript
// Cleanup function ใช้ NULL แทน 0
await pool.query(
  `UPDATE rider_assignment ra
   JOIN delivery d ON d.delivery_id = ra.delivery_id
   SET ra.active_flag = NULL, ra.state = 'COMPLETED'
   WHERE ra.user_id = ? AND d.status = 'DELIVERED' AND ra.active_flag = 1`,
  [riderId]
);
```

## วิธีแก้ไขข้อมูลเก่า

รันสคริปต์เหล่านี้เพื่อแก้ไขข้อมูลที่มีอยู่:

```bash
# แก้ไข active_flag ที่ผิด
node fix-active-flag.js

# แก้ไขงานที่เสร็จแล้วแต่ยัง active
node fix-completed-jobs.js
```

## การทดสอบ

```bash
# ตรวจสอบโครงสร้างตาราง
node check-rider-assignment.js

# ทดสอบ getCurrentJob
node test-current-job.js

# ทดสอบวงจรทั้งหมด
node test-full-cycle.js
```

## สรุป

### ก่อนแก้ไข ❌
- Rider รับงาน → `active_flag = null`
- Query `WHERE active_flag = 1` → ไม่เจอ
- Rider ไม่เห็น currentJob
- ทำงานเสร็จ → `active_flag` ยังเป็น `1`
- ไม่สามารถรับงานใหม่ได้

### หลังแก้ไข ✅
- Rider รับงาน → `active_flag = 1`
- Query `WHERE active_flag = 1` → เจอ
- Rider เห็น currentJob
- ทำงานเสร็จ → `active_flag = NULL`
- สามารถรับงานใหม่ได้

## Logic ของ active_flag

```
active_flag = 1    → Rider กำลังทำงานอยู่ (ASSIGNED, PICKED)
active_flag = NULL → Rider ว่าง (COMPLETED, CANCELLED)
active_flag = 0    → ไม่ใช้แล้ว (เพื่อหลีกเลี่ยง duplicate key)
```

## Constraint ที่สำคัญ

```sql
UNIQUE(user_id, active_flag)  -- Rider หนึ่งคนมีได้แค่ 1 งาน active
UNIQUE(delivery_id)           -- Delivery หนึ่งงานมีได้แค่ 1 rider
```

---

**วันที่แก้ไข:** 2025-10-24  
**ผู้แก้ไข:** Kiro AI Assistant
