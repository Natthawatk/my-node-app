import { pool } from '../db/pool.js';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'delivery-' + uniqueSuffix + path.extname(file.originalname));
  }
});

export const upload = multer({ storage });

export const deliveryController = {
  // Get available jobs (WAITING status only)
  async getAvailableJobs(req, res) {
    try {
      const [jobs] = await pool.query(
        `SELECT 
          d.delivery_id,
          d.status,
          d.note,
          d.requested_at,
          sender.name as sender_name,
          sender.phone as sender_phone,
          receiver.name as receiver_name,
          receiver.phone as receiver_phone,
          pickup_addr.address_line as pickup_address,
          pickup_addr.lat as pickup_lat,
          pickup_addr.lng as pickup_lng,
          dropoff_addr.address_line as delivery_address,
          dropoff_addr.lat as delivery_lat,
          dropoff_addr.lng as delivery_lng
         FROM delivery d
         JOIN user sender ON sender.user_id = d.sender_id
         JOIN user receiver ON receiver.user_id = d.receiver_id
         JOIN address pickup_addr ON pickup_addr.address_id = d.pickup_address_id
         JOIN address dropoff_addr ON dropoff_addr.address_id = d.dropoff_address_id
         WHERE d.status = 'WAITING'
         ORDER BY d.requested_at ASC`
      );

      res.json({ jobs });
    } catch (error) {
      console.error('Error fetching available jobs:', error);
      res.status(500).json({ message: 'Failed to fetch available jobs' });
    }
  },

  // Get rider's current job (active_flag = 1)
  async getRiderCurrentJob(req, res) {
    try {
      const { riderId } = req.params;

      console.log(`📥 Getting current job for rider: ${riderId}`);

      // First, check if rider has any assignments at all
      const [allAssignments] = await pool.query(
        'SELECT * FROM rider_assignment WHERE user_id = ?',
        [riderId]
      );
      console.log(`🔍 Rider ${riderId} has ${allAssignments.length} total assignments`);
      if (allAssignments.length > 0) {
        console.log(`   First assignment: delivery_id=${allAssignments[0].delivery_id}, active_flag=${allAssignments[0].active_flag}, state=${allAssignments[0].state}`);
      }

      const [jobs] = await pool.query(
        `SELECT 
          d.delivery_id,
          d.status,
          d.note,
          d.requested_at,
          d.assigned_at,
          d.picked_at,
          sender.name as sender_name,
          sender.phone as sender_phone,
          receiver.name as receiver_name,
          receiver.phone as receiver_phone,
          pickup_addr.address_line as pickup_address,
          pickup_addr.lat as pickup_lat,
          pickup_addr.lng as pickup_lng,
          dropoff_addr.address_line as delivery_address,
          dropoff_addr.lat as delivery_lat,
          dropoff_addr.lng as delivery_lng,
          ra.active_flag
         FROM rider_assignment ra
         JOIN delivery d ON d.delivery_id = ra.delivery_id
         JOIN user sender ON sender.user_id = d.sender_id
         JOIN user receiver ON receiver.user_id = d.receiver_id
         JOIN address pickup_addr ON pickup_addr.address_id = d.pickup_address_id
         JOIN address dropoff_addr ON dropoff_addr.address_id = d.dropoff_address_id
         WHERE ra.user_id = ? AND ra.active_flag = 1
         LIMIT 1`,
        [riderId]
      );

      console.log(`📦 Found ${jobs.length} active jobs for rider ${riderId}`);

      if (jobs.length === 0) {
        console.log(`❌ No active job found for rider ${riderId}`);
        return res.status(404).json({ message: 'No active job', job: null });
      }

      console.log(`✅ Returning job ${jobs[0].delivery_id} for rider ${riderId}`);
      res.json({ job: jobs[0] });
    } catch (error) {
      console.error('❌ Error fetching rider current job:', error);
      res.status(500).json({ message: 'Failed to fetch current job' });
    }
  },

  // Accept delivery job
  // ✅ Insert active_flag = 1 เมื่อรับงาน (ไม่ว่าง)
  // ✅ ตรวจสอบว่า rider มี active_flag = 1 อยู่แล้วหรือไม่
  async acceptDeliveryJob(req, res) {
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const { deliveryId } = req.params;
      const { rider_id } = req.body;

      console.log(`🔄 Rider ${rider_id} attempting to accept delivery ${deliveryId}`);

      // ✅ เช็คว่า rider มี active_flag = 1 อยู่แล้วหรือไม่
      const [existingJobs] = await connection.query(
        'SELECT * FROM rider_assignment WHERE user_id = ? AND active_flag = 1',
        [rider_id]
      );

      console.log(`Rider ${rider_id} active jobs check: ${JSON.stringify(existingJobs)}`);

      if (existingJobs.length > 0) {
        console.log(`❌ Rider ${rider_id} already has active job`);
        await connection.rollback();
        return res.status(400).json({
          message: 'Rider already has an active job',
          error: 'RIDER_BUSY'
        });
      }

      console.log(`✓ Rider ${rider_id} is available, checking delivery ${deliveryId}...`);

      // Check if delivery is still available
      const [deliveries] = await connection.query(
        'SELECT * FROM delivery WHERE delivery_id = ? AND status = \'WAITING\'',
        [deliveryId]
      );

      console.log(`Found ${deliveries.length} deliveries with status WAITING`);

      if (deliveries.length === 0) {
        console.log(`❌ Delivery ${deliveryId} not available`);
        await connection.rollback();
        return res.status(400).json({
          message: 'Delivery not available',
          error: 'DELIVERY_NOT_AVAILABLE'
        });
      }

      console.log(`✓ Delivery ${deliveryId} is available, updating status...`);

      // Update delivery status to ASSIGNED
      await connection.query(
        `UPDATE delivery 
         SET status = 'ASSIGNED', assigned_at = NOW()
         WHERE delivery_id = ?`,
        [deliveryId]
      );

      console.log(`✓ Delivery ${deliveryId} status updated to ASSIGNED`);

      // ✅ Insert rider_assignment with active_flag = 1 (ไม่ว่าง)
      console.log(`Inserting rider_assignment: delivery=${deliveryId}, rider=${rider_id}, active_flag=1`);

      const [insertResult] = await connection.query(
        `INSERT INTO rider_assignment (delivery_id, user_id, state, accepted_at, active_flag)
         VALUES (?, ?, 'ASSIGNED', NOW(), 1)`,
        [deliveryId, rider_id]
      );
      
      console.log(`📝 Insert result: insertId=${insertResult.insertId}, affectedRows=${insertResult.affectedRows}`);

      console.log(`📝 Inserted rider_assignment: assignment_id=${insertResult.insertId}`);

      await connection.commit();

      console.log(`✅ Rider ${rider_id} accepted job ${deliveryId} - active_flag set to 1 - COMMITTED`);

      // Verify the insert
      const [verify] = await pool.query(
        'SELECT * FROM rider_assignment WHERE user_id = ? AND delivery_id = ?',
        [rider_id, deliveryId]
      );
      console.log(`🔍 Verification: Found ${verify.length} assignments for rider ${rider_id} and delivery ${deliveryId}`);
      if (verify.length > 0) {
        console.log(`   - active_flag: ${verify[0].active_flag}, state: ${verify[0].state}`);
      }

      res.json({
        message: 'Job accepted successfully',
        active_flag: 1,
        delivery_id: deliveryId
      });
    } catch (error) {
      await connection.rollback();
      console.error('Error accepting job:', error);
      res.status(500).json({ message: 'Failed to accept job' });
    } finally {
      connection.release();
    }
  },

  // Update delivery status
  // ✅ Update active_flag = NULL เมื่อส่งของเสร็จ (ว่าง)
  async updateDeliveryStatus(req, res) {
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const { deliveryId } = req.params;
      const { status } = req.body;

      // Get current delivery info
      const [deliveries] = await connection.query(
        'SELECT * FROM delivery WHERE delivery_id = ?',
        [deliveryId]
      );

      if (deliveries.length === 0) {
        await connection.rollback();
        return res.status(404).json({ message: 'Delivery not found' });
      }

      const currentDelivery = deliveries[0];

      // Update delivery status and timestamps
      let updateQuery = 'UPDATE delivery SET status = ?';
      const updateParams = [status];

      if (status === 'ON_ROUTE' && !currentDelivery.picked_at) {
        updateQuery += ', picked_at = NOW()';
      } else if (status === 'DELIVERED' && !currentDelivery.delivered_at) {
        updateQuery += ', delivered_at = NOW()';
      }

      updateQuery += ' WHERE delivery_id = ?';
      updateParams.push(deliveryId);

      await connection.query(updateQuery, updateParams);

      // Update rider_assignment state and active_flag
      if (status === 'ON_ROUTE') {
        // ยังคง active_flag = 1 (ยังไม่ว่าง)
        await connection.query(
          `UPDATE rider_assignment 
           SET state = 'PICKED', picked_at = NOW()
           WHERE delivery_id = ? AND active_flag = 1`,
          [deliveryId]
        );
        console.log(`📦 Delivery ${deliveryId} status: ON_ROUTE - active_flag still 1`);
      } else if (status === 'DELIVERED') {
        // ✅ Set active_flag = NULL เมื่อส่งของเสร็จ (ว่าง) - ใช้ NULL แทน 0 เพื่อหลีกเลี่ยง duplicate key
        const [updateResult] = await connection.query(
          `UPDATE rider_assignment 
           SET state = 'COMPLETED', completed_at = NOW(), active_flag = NULL
           WHERE delivery_id = ? AND active_flag = 1`,
          [deliveryId]
        );
        console.log(`✅ Delivery ${deliveryId} COMPLETED - active_flag set to NULL (rider is now available), affected: ${updateResult.affectedRows}`);
      }

      // Handle photo upload if provided
      if (req.file) {
        const photoUrl = `/uploads/${req.file.filename}`;
        let statusCode = 'REQUESTED';
        let uploadedBy = 'SENDER';

        if (status === 'ON_ROUTE') {
          statusCode = 'PICKED_UP';
          uploadedBy = 'RIDER';
        } else if (status === 'DELIVERED') {
          statusCode = 'DELIVERED';
          uploadedBy = 'RIDER';
        }

        await connection.query(
          `INSERT INTO delivery_photo (delivery_id, status_code, uploaded_by, photo_url)
           VALUES (?, ?, ?, ?)`,
          [deliveryId, statusCode, uploadedBy, photoUrl]
        );
      }

      await connection.commit();

      res.json({
        message: 'Status updated successfully',
        status: status,
        active_flag: status === 'DELIVERED' ? null : 1
      });
    } catch (error) {
      await connection.rollback();
      console.error('Error updating status:', error);
      res.status(500).json({ message: 'Failed to update status' });
    } finally {
      connection.release();
    }
  },

  async getSenderDeliveries(req, res) {
    try {
      const { userId } = req.params;
      const { status } = req.query;

      let query = `
        SELECT 
          d.delivery_id,
          d.status,
          d.note,
          d.requested_at,
          d.assigned_at,
          d.picked_at,
          d.delivered_at,
          receiver.name as receiver_name,
          receiver.phone as receiver_phone,
          pickup_addr.address_line as pickup_address,
          dropoff_addr.address_line as delivery_address
        FROM delivery d
        JOIN user receiver ON receiver.user_id = d.receiver_id
        JOIN address pickup_addr ON pickup_addr.address_id = d.pickup_address_id
        JOIN address dropoff_addr ON dropoff_addr.address_id = d.dropoff_address_id
        WHERE d.sender_id = ?
      `;

      const params = [userId];

      if (status && status !== 'All') {
        query += ' AND d.status = ?';
        params.push(status);
      }

      query += ' ORDER BY d.requested_at DESC';

      const [deliveries] = await pool.query(query, params);

      res.json({ deliveries });
    } catch (error) {
      console.error('Error fetching sender deliveries:', error);
      res.status(500).json({ message: 'Failed to fetch deliveries' });
    }
  },

  async getReceiverDeliveries(req, res) {
    try {
      const { userId } = req.params;
      const { status } = req.query;

      let query = `
        SELECT 
          d.delivery_id,
          d.status,
          d.note,
          d.requested_at,
          d.assigned_at,
          d.picked_at,
          d.delivered_at,
          sender.name as sender_name,
          sender.phone as sender_phone,
          pickup_addr.address_line as pickup_address,
          dropoff_addr.address_line as delivery_address
        FROM delivery d
        JOIN user sender ON sender.user_id = d.sender_id
        JOIN address pickup_addr ON pickup_addr.address_id = d.pickup_address_id
        JOIN address dropoff_addr ON dropoff_addr.address_id = d.dropoff_address_id
        WHERE d.receiver_id = ?
      `;

      const params = [userId];

      if (status && status !== 'All') {
        query += ' AND d.status = ?';
        params.push(status);
      }

      query += ' ORDER BY d.requested_at DESC';

      const [deliveries] = await pool.query(query, params);

      res.json({ deliveries });
    } catch (error) {
      console.error('Error fetching receiver deliveries:', error);
      res.status(500).json({ message: 'Failed to fetch deliveries' });
    }
  },

  async createDelivery(req, res) {
    try {
      const { sender_id, receiver_id, address_id, item_name, item_description } = req.body;

      // Create delivery
      const [result] = await pool.query(
        `INSERT INTO delivery (sender_id, receiver_id, pickup_address_id, dropoff_address_id, status, requested_at, note)
         VALUES (?, ?, ?, ?, 'WAITING', NOW(), ?)`,
        [sender_id, receiver_id, address_id, address_id, item_description]
      );

      const deliveryId = result.insertId;

      // Add delivery item
      await pool.query(
        `INSERT INTO delivery_item (delivery_id, name, description, qty)
         VALUES (?, ?, ?, 1)`,
        [deliveryId, item_name, item_description]
      );

      // Handle photo upload if provided
      if (req.file) {
        const photoUrl = `/uploads/${req.file.filename}`;
        await pool.query(
          `INSERT INTO delivery_photo (delivery_id, status_code, uploaded_by, photo_url)
           VALUES (?, 'REQUESTED', 'SENDER', ?)`,
          [deliveryId, photoUrl]
        );
      }

      res.status(201).json({
        message: 'Delivery created successfully',
        delivery: { delivery_id: deliveryId }
      });
    } catch (error) {
      console.error('Error creating delivery:', error);
      res.status(500).json({ message: 'Failed to create delivery' });
    }
  },

  async getDeliveryStatus(req, res) {
    try {
      const { deliveryId } = req.params;

      const [deliveries] = await pool.query(
        `SELECT 
          d.*,
          sender.name as sender_name,
          receiver.name as receiver_name,
          pickup_addr.address_line as pickup_address,
          dropoff_addr.address_line as delivery_address
         FROM delivery d
         JOIN user sender ON sender.user_id = d.sender_id
         JOIN user receiver ON receiver.user_id = d.receiver_id
         JOIN address pickup_addr ON pickup_addr.address_id = d.pickup_address_id
         JOIN address dropoff_addr ON dropoff_addr.address_id = d.dropoff_address_id
         WHERE d.delivery_id = ?`,
        [deliveryId]
      );

      if (deliveries.length === 0) {
        return res.status(404).json({ message: 'Delivery not found' });
      }

      res.json(deliveries[0]);
    } catch (error) {
      console.error('Error fetching delivery status:', error);
      res.status(500).json({ message: 'Failed to fetch delivery status' });
    }
  }
};
