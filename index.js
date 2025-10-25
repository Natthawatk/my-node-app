import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import session from 'express-session';
import connectSqlite3 from 'connect-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDB } from './src/db/pool.js';
import authRoutes from './src/routes/auth.routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Dynamic import for multer
const multerModule = await import('multer');
const multer = multerModule.default;

dotenv.config();

const app = express();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

app.use(express.json());
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') || true,
  credentials: true,
}));
app.use(helmet());
app.use(morgan('tiny'));
app.use('/uploads', express.static('uploads'));

const SQLiteStore = connectSqlite3(session);
const sessionStore = new SQLiteStore({ db: 'sessions.db' });

// Initialize database
await initDB();

app.set('trust proxy', 1);
app.use(session({
  name: process.env.SESSION_NAME || 'sid',
  secret: process.env.SESSION_SECRET || 'change-me',
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: process.env.COOKIE_SAMESITE || 'lax',
    secure: process.env.COOKIE_SECURE === 'true',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
}));

app.get('/', (_req, res) => res.json({ message: 'My Node App API', status: 'running' }));
app.get('/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);

// Users endpoint
app.get('/api/users/customers', async (req, res) => {
  try {
    const { getDB } = await import('./src/db/pool.js');
    const pool = getDB();
    const [rows] = await pool.execute(
      'SELECT user_id as id, name, phone FROM user WHERE role = ?',
      ['CUSTOMER']
    );
    console.log('Customers fetched:', rows);
    res.json({ customers: rows });
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({ error: 'Failed to fetch customers', details: error.message });
  }
});

// Customer addresses endpoint
app.get('/api/users/:customerId/addresses', async (req, res) => {
  try {
    const { customerId } = req.params;
    const { getDB } = await import('./src/db/pool.js');
    const pool = getDB();

    const [rows] = await pool.execute(
      'SELECT address_id, label, address_line, lat, lng, is_default FROM address WHERE user_id = ? ORDER BY is_default DESC, created_at DESC',
      [customerId]
    );

    res.json({ addresses: rows });
  } catch (error) {
    console.error('Error fetching addresses:', error);
    res.status(500).json({ error: 'Failed to fetch addresses' });
  }
});

// Address management endpoints
app.post('/api/addresses', async (req, res) => {
  try {
    const { user_id, label, address_line, lat, lng, is_default } = req.body;
    const { getDB } = await import('./src/db/pool.js');
    const pool = getDB();

    // If this is set as default, unset other defaults
    if (is_default) {
      await pool.execute(
        'UPDATE address SET is_default = 0 WHERE user_id = ?',
        [user_id]
      );
    }

    const [result] = await pool.execute(
      'INSERT INTO address (user_id, label, address_line, lat, lng, is_default) VALUES (?, ?, ?, ?, ?, ?)',
      [user_id, label, address_line, lat, lng, is_default]
    );

    res.json({ success: true, address_id: result.insertId });
  } catch (error) {
    console.error('Error adding address:', error);
    res.status(500).json({ error: 'Failed to add address' });
  }
});

app.put('/api/addresses/:addressId', async (req, res) => {
  try {
    const { addressId } = req.params;
    const { label, address_line, lat, lng, is_default } = req.body;
    const { getDB } = await import('./src/db/pool.js');
    const pool = getDB();

    // If this is set as default, unset other defaults for the same user
    if (is_default) {
      const [addressInfo] = await pool.execute(
        'SELECT user_id FROM address WHERE address_id = ?',
        [addressId]
      );

      if (addressInfo.length > 0) {
        await pool.execute(
          'UPDATE address SET is_default = 0 WHERE user_id = ?',
          [addressInfo[0].user_id]
        );
      }
    }

    await pool.execute(
      'UPDATE address SET label = ?, address_line = ?, lat = ?, lng = ?, is_default = ? WHERE address_id = ?',
      [label, address_line, lat, lng, is_default, addressId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating address:', error);
    res.status(500).json({ error: 'Failed to update address' });
  }
});

app.delete('/api/addresses/:addressId', async (req, res) => {
  try {
    const { addressId } = req.params;
    const { getDB } = await import('./src/db/pool.js');
    const pool = getDB();

    await pool.execute('DELETE FROM address WHERE address_id = ?', [addressId]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting address:', error);
    res.status(500).json({ error: 'Failed to delete address' });
  }
});

// Deliveries endpoints
app.get('/api/deliveries/sender/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { status } = req.query;

    const { getDB } = await import('./src/db/pool.js');
    const pool = getDB();

    let query = `
      SELECT d.delivery_id, d.note, d.status, d.created_at, d.requested_at,
             s.name as sender_name, s.phone as sender_phone,
             r.name as receiver_name, r.phone as receiver_phone,
             pa.address_line as pickup_address, pa.lat as pickup_lat, pa.lng as pickup_lng,
             da.address_line as dropoff_address, da.lat as dropoff_lat, da.lng as dropoff_lng,
             rider.name as rider_name, rider.phone as rider_phone
      FROM delivery d
      JOIN user s ON d.sender_id = s.user_id
      JOIN user r ON d.receiver_id = r.user_id
      LEFT JOIN address pa ON d.pickup_address_id = pa.address_id
      LEFT JOIN address da ON d.dropoff_address_id = da.address_id
      LEFT JOIN rider_assignment ra ON d.delivery_id = ra.delivery_id AND ra.active_flag = 1
      LEFT JOIN user rider ON ra.user_id = rider.user_id
      WHERE d.sender_id = ?
    `;

    const params = [userId];

    if (status && status !== 'All') {
      query += ' AND d.status = ?';
      params.push(status);
    }

    query += ' ORDER BY d.created_at DESC';

    const [rows] = await pool.execute(query, params);
    res.json({ deliveries: rows });
  } catch (error) {
    console.error('Error fetching sender deliveries:', error);
    res.status(500).json({ error: 'Failed to fetch deliveries' });
  }
});

app.get('/api/deliveries/receiver/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { status } = req.query;

    const { getDB } = await import('./src/db/pool.js');
    const pool = getDB();

    let query = `
      SELECT d.delivery_id, d.note, d.status, d.created_at, d.requested_at,
             s.name as sender_name, s.phone as sender_phone,
             r.name as receiver_name, r.phone as receiver_phone,
             pa.address_line as pickup_address, pa.lat as pickup_lat, pa.lng as pickup_lng,
             da.address_line as dropoff_address, da.lat as dropoff_lat, da.lng as dropoff_lng,
             rider.name as rider_name, rider.phone as rider_phone
      FROM delivery d
      JOIN user s ON d.sender_id = s.user_id
      JOIN user r ON d.receiver_id = r.user_id
      LEFT JOIN address pa ON d.pickup_address_id = pa.address_id
      LEFT JOIN address da ON d.dropoff_address_id = da.address_id
      LEFT JOIN rider_assignment ra ON d.delivery_id = ra.delivery_id AND ra.active_flag = 1
      LEFT JOIN user rider ON ra.user_id = rider.user_id
      WHERE d.receiver_id = ?
    `;

    const params = [userId];

    if (status && status !== 'All') {
      query += ' AND d.status = ?';
      params.push(status);
    }

    query += ' ORDER BY d.created_at DESC';

    const [rows] = await pool.execute(query, params);
    res.json({ deliveries: rows });
  } catch (error) {
    console.error('Error fetching receiver deliveries:', error);
    res.status(500).json({ error: 'Failed to fetch deliveries' });
  }
});

// Create new delivery
app.post('/api/deliveries', upload.single('photo'), async (req, res) => {
  try {
    const { sender_id, receiver_id, address_id, item_name, item_description } = req.body;
    const photoFile = req.file;
    const { getDB } = await import('./src/db/pool.js');
    const pool = getDB();

    console.log('Creating delivery:', { sender_id, receiver_id, address_id, item_name, item_description });

    // Validate required fields including photo
    if (!sender_id || !receiver_id || !address_id || !item_name) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        message: 'sender_id, receiver_id, address_id, and item_name are required'
      });
    }

    if (!photoFile) {
      return res.status(400).json({ 
        error: 'Photo required',
        message: 'Photo is required for creating delivery'
      });
    }

    // Get sender's default address for pickup
    const [senderAddresses] = await pool.execute(
      'SELECT address_id FROM address WHERE user_id = ? AND is_default = 1 LIMIT 1',
      [sender_id]
    );

    let pickupAddressId = null;
    if (senderAddresses.length > 0) {
      pickupAddressId = senderAddresses[0].address_id;
    } else {
      // If no default address, get any address of sender
      const [anyAddress] = await pool.execute(
        'SELECT address_id FROM address WHERE user_id = ? LIMIT 1',
        [sender_id]
      );
      if (anyAddress.length > 0) {
        pickupAddressId = anyAddress[0].address_id;
      }
    }

    console.log('Pickup address ID:', pickupAddressId);
    console.log('Dropoff address ID:', address_id);

    // Insert delivery
    const [result] = await pool.execute(
      `INSERT INTO delivery (sender_id, receiver_id, pickup_address_id, dropoff_address_id, status, created_at, updated_at) 
       VALUES (?, ?, ?, ?, 'WAITING', NOW(), NOW())`,
      [sender_id, receiver_id, pickupAddressId, address_id]
    );

    const deliveryId = result.insertId;
    console.log('Delivery created with ID:', deliveryId);

    // Insert delivery item
    await pool.execute(
      `INSERT INTO delivery_item (delivery_id, name, description, weight_kg, qty)
       VALUES (?, ?, ?, 0, 1)`,
      [deliveryId, item_name, item_description || '']
    );

    console.log('Delivery item created');

    // Insert delivery photo (required)
    const photoUrl = `/uploads/${photoFile.filename}`;
    await pool.execute(
      `INSERT INTO delivery_photo (delivery_id, status_code, uploaded_by, photo_url, created_at)
       VALUES (?, 'REQUESTED', 'SENDER', ?, NOW())`,
      [deliveryId, photoUrl]
    );
    console.log('Delivery photo saved:', photoUrl);

    // Fetch the created delivery with item
    const [delivery] = await pool.execute(
      `SELECT d.*, 
              s.name as sender_name, 
              r.name as receiver_name,
              pa.address_line as pickup_address,
              da.address_line as delivery_address,
              di.name as item_name,
              di.description as item_description
       FROM delivery d
       LEFT JOIN user s ON d.sender_id = s.user_id
       LEFT JOIN user r ON d.receiver_id = r.user_id
       LEFT JOIN address pa ON d.pickup_address_id = pa.address_id
       LEFT JOIN address da ON d.dropoff_address_id = da.address_id
       LEFT JOIN delivery_item di ON d.delivery_id = di.delivery_id
       WHERE d.delivery_id = ?`,
      [deliveryId]
    );

    res.status(201).json({ 
      success: true,
      message: 'Delivery created successfully',
      delivery: delivery[0]
    });
  } catch (error) {
    console.error('Error creating delivery:', error);
    res.status(500).json({ 
      error: 'Failed to create delivery',
      message: error.message
    });
  }
});

// Get available jobs for riders (WAITING status only)
app.get('/api/deliveries/available', async (req, res) => {
  try {
    const { getDB } = await import('./src/db/pool.js');
    const pool = getDB();

    const query = `
      SELECT 
        d.delivery_id,
        d.note,
        d.status,
        d.created_at,
        s.name as sender_name,
        s.phone as sender_phone,
        r.name as receiver_name,
        r.phone as receiver_phone,
        pa.address_line as pickup_address,
        da.address_line as delivery_address
      FROM delivery d
      LEFT JOIN user s ON d.sender_id = s.user_id
      LEFT JOIN user r ON d.receiver_id = r.user_id
      LEFT JOIN address pa ON d.pickup_address_id = pa.address_id
      LEFT JOIN address da ON d.dropoff_address_id = da.address_id
      WHERE d.status = 'WAITING'
      ORDER BY d.created_at ASC
    `;

    const [jobs] = await pool.execute(query);

    res.json({ jobs });
  } catch (error) {
    console.error('Error fetching available jobs:', error);
    res.status(500).json({ error: 'Failed to fetch available jobs' });
  }
});

// Get rider's current job
app.get('/api/deliveries/rider/:riderId/current', async (req, res) => {
  try {
    const { riderId } = req.params;
    const { getDB } = await import('./src/db/pool.js');
    const pool = getDB();

    const query = `
      SELECT 
        d.delivery_id,
        d.note,
        d.status,
        d.created_at,
        s.name as sender_name,
        s.phone as sender_phone,
        r.name as receiver_name,
        r.phone as receiver_phone,
        pa.address_line as pickup_address,
        pa.lat as pickup_lat,
        pa.lng as pickup_lng,
        da.address_line as delivery_address,
        da.lat as delivery_lat,
        da.lng as delivery_lng
      FROM delivery d
      LEFT JOIN user s ON d.sender_id = s.user_id
      LEFT JOIN user r ON d.receiver_id = r.user_id
      LEFT JOIN address pa ON d.pickup_address_id = pa.address_id
      LEFT JOIN address da ON d.dropoff_address_id = da.address_id
      INNER JOIN rider_assignment ra ON d.delivery_id = ra.delivery_id
      WHERE ra.user_id = ? AND ra.active_flag = 1 AND d.status IN ('ASSIGNED', 'ON_ROUTE')
      ORDER BY d.created_at DESC
      LIMIT 1
    `;

    const [jobs] = await pool.execute(query, [riderId]);

    if (jobs.length > 0) {
      res.json({ job: jobs[0] });
    } else {
      res.json({ job: null });
    }
  } catch (error) {
    console.error('Error fetching rider current job:', error);
    res.status(500).json({ error: 'Failed to fetch current job' });
  }
});

// Clean up stale rider assignments (for completed/cancelled jobs)
app.post('/api/rider/:riderId/cleanup', async (req, res) => {
  try {
    const { riderId } = req.params;
    const { getDB } = await import('./src/db/pool.js');
    const pool = getDB();

    // Mark assignments as completed where delivery is not in active status
    // This will automatically set active_flag to 0 (since it's a generated column)
    const [result] = await pool.execute(
      `UPDATE rider_assignment ra
       LEFT JOIN delivery d ON ra.delivery_id = d.delivery_id
       SET ra.completed_at = NOW()
       WHERE ra.user_id = ? AND ra.active_flag = 1 
       AND (d.delivery_id IS NULL OR d.status NOT IN ('ASSIGNED', 'ON_ROUTE'))`,
      [riderId]
    );

    console.log(`Cleanup for rider ${riderId}: ${result.affectedRows} rows updated`);
    res.json({ message: 'Cleanup completed', rowsUpdated: result.affectedRows });
  } catch (error) {
    console.error('Error cleaning up rider assignments:', error);
    res.status(500).json({ error: 'Failed to cleanup' });
  }
});

// Accept delivery job
app.post('/api/deliveries/:deliveryId/accept', async (req, res) => {
  try {
    const { deliveryId } = req.params;
    const { rider_id } = req.body;
    const { getDB } = await import('./src/db/pool.js');
    const pool = getDB();

    // Check if rider already has an active job
    const [activeJobs] = await pool.execute(
      `SELECT ra.delivery_id, d.status, ra.active_flag
       FROM rider_assignment ra 
       LEFT JOIN delivery d ON ra.delivery_id = d.delivery_id 
       WHERE ra.user_id = ? AND ra.active_flag = 1`,
      [rider_id]
    );

    console.log(`Rider ${rider_id} active jobs check:`, activeJobs);

    // Filter for truly active jobs
    const validActiveJobs = activeJobs.filter(job => 
      job.status && ['ASSIGNED', 'ON_ROUTE'].includes(job.status)
    );

    if (validActiveJobs.length > 0) {
      console.log(`Rider ${rider_id} already has active job:`, validActiveJobs[0]);
      return res.status(400).json({ error: 'You already have an active job' });
    }

    // Clean up any stale assignments found
    if (activeJobs.length > validActiveJobs.length) {
      console.log(`Cleaning up ${activeJobs.length - validActiveJobs.length} stale assignments for rider ${rider_id}`);
      await pool.execute(
        `UPDATE rider_assignment 
         SET completed_at = NOW() 
         WHERE user_id = ? AND active_flag = 1 AND delivery_id NOT IN (
           SELECT delivery_id FROM delivery WHERE status IN ('ASSIGNED', 'ON_ROUTE')
         )`,
        [rider_id]
      );
    }

    // Check if delivery is still available
    const [delivery] = await pool.execute(
      'SELECT delivery_id, status FROM delivery WHERE delivery_id = ?',
      [deliveryId]
    );

    if (delivery.length === 0) {
      return res.status(404).json({ error: 'Delivery not found' });
    }

    if (delivery[0].status !== 'WAITING') {
      return res.status(400).json({ error: 'Delivery is no longer available' });
    }

    // Accept the job
    await pool.execute(
      'UPDATE delivery SET status = "ASSIGNED", updated_at = NOW() WHERE delivery_id = ?',
      [deliveryId]
    );

    // Insert into rider_assignment
    await pool.execute(
      'INSERT INTO rider_assignment (delivery_id, user_id, state, accepted_at) VALUES (?, ?, "ASSIGNED", NOW())',
      [deliveryId, rider_id]
    );

    res.json({ message: 'Job accepted successfully' });
  } catch (error) {
    console.error('Error accepting job:', error);
    res.status(500).json({ error: 'Failed to accept job' });
  }
});

// Update delivery status
app.put('/api/deliveries/:deliveryId/status', upload.single('photo'), async (req, res) => {
  try {
    const { deliveryId } = req.params;
    const { status } = req.body;
    const photoFile = req.file;
    const { getDB } = await import('./src/db/pool.js');
    const pool = getDB();

    const validStatuses = ['WAITING', 'ASSIGNED', 'ON_ROUTE', 'DELIVERED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    // Require photo for ON_ROUTE and DELIVERED status
    if ((status === 'ON_ROUTE' || status === 'DELIVERED') && !photoFile) {
      return res.status(400).json({ 
        error: 'Photo required',
        message: 'Photo is required for this status update'
      });
    }

    await pool.execute(
      'UPDATE delivery SET status = ?, updated_at = NOW() WHERE delivery_id = ?',
      [status, deliveryId]
    );

    // Insert photo if provided
    if (photoFile) {
      const photoUrl = `/uploads/${photoFile.filename}`;
      let statusCode = 'PICKED_UP';
      if (status === 'DELIVERED') {
        statusCode = 'DELIVERED';
      }
      
      await pool.execute(
        `INSERT INTO delivery_photo (delivery_id, status_code, uploaded_by, photo_url, created_at)
         VALUES (?, ?, 'RIDER', ?, NOW())`,
        [deliveryId, statusCode, photoUrl]
      );
      console.log('Status photo saved:', statusCode, photoUrl);
    }

    // Mark rider assignment as completed when delivered
    if (status === 'DELIVERED') {
      const [result] = await pool.execute(
        'UPDATE rider_assignment SET completed_at = NOW() WHERE delivery_id = ? AND active_flag = 1',
        [deliveryId]
      );
      console.log(`Delivery ${deliveryId} completed, ${result.affectedRows} rows updated, rider is now available for new jobs`);
      
      // Verify the update
      const [check] = await pool.execute(
        'SELECT delivery_id, completed_at, active_flag FROM rider_assignment WHERE delivery_id = ?',
        [deliveryId]
      );
      console.log(`Verification - rider_assignment for delivery ${deliveryId}:`, check[0]);
    }

    res.json({ message: 'Status updated successfully' });
  } catch (error) {
    console.error('Error updating status:', error);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// Save rider location
app.post('/api/rider/:riderId/location', async (req, res) => {
  try {
    const { riderId } = req.params;
    const { lat, lng, delivery_id } = req.body;
    const { getDB } = await import('./src/db/pool.js');
    const pool = getDB();

    await pool.execute(
      'INSERT INTO rider_location (user_id, delivery_id, lat, lng, recorded_at) VALUES (?, ?, ?, ?, NOW())',
      [riderId, delivery_id || null, lat, lng]
    );

    res.json({ message: 'Location saved' });
  } catch (error) {
    console.error('Error saving rider location:', error);
    res.status(500).json({ error: 'Failed to save location' });
  }
});

// Get latest rider location for a delivery
app.get('/api/delivery/:deliveryId/rider-location', async (req, res) => {
  try {
    const { deliveryId } = req.params;
    const { getDB } = await import('./src/db/pool.js');
    const pool = getDB();

    const [location] = await pool.execute(
      `SELECT rl.lat, rl.lng, rl.recorded_at, u.name as rider_name
       FROM rider_assignment ra
       JOIN rider_location rl ON rl.user_id = ra.user_id
       JOIN user u ON u.user_id = ra.user_id
       WHERE ra.delivery_id = ? AND ra.active_flag = 1
       ORDER BY rl.recorded_at DESC
       LIMIT 1`,
      [deliveryId]
    );

    if (location.length > 0) {
      res.json(location[0]);
    } else {
      res.json(null);
    }
  } catch (error) {
    console.error('Error fetching rider location:', error);
    res.status(500).json({ error: 'Failed to fetch rider location' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on ${PORT}`));