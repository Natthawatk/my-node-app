import { initDB } from './src/db/pool.js';

async function testFullCycle() {
  try {
    const pool = await initDB();
    const riderId = 32;
    
    console.log('🧪 Testing full delivery cycle...\n');
    
    // 1. Check current state
    console.log('1️⃣ Current state:');
    const [current] = await pool.query(
      'SELECT * FROM rider_assignment WHERE user_id = ? ORDER BY assignment_id DESC LIMIT 3',
      [riderId]
    );
    console.table(current);
    
    // 2. Simulate completing the current job (delivery_id = 21)
    console.log('\n2️⃣ Simulating DELIVERED status for delivery 21...');
    await pool.query(
      `UPDATE rider_assignment 
       SET state = 'COMPLETED', completed_at = NOW(), active_flag = NULL
       WHERE delivery_id = 21 AND active_flag = 1`
    );
    await pool.query(
      `UPDATE delivery SET status = 'DELIVERED', delivered_at = NOW() WHERE delivery_id = 21`
    );
    
    // 3. Check if rider is now available
    console.log('\n3️⃣ After completing job:');
    const [afterComplete] = await pool.query(
      'SELECT * FROM rider_assignment WHERE user_id = ? ORDER BY assignment_id DESC LIMIT 3',
      [riderId]
    );
    console.table(afterComplete);
    
    // 4. Check if rider can see current job (should be null)
    const [currentJob] = await pool.query(
      `SELECT d.delivery_id, d.status, ra.active_flag
       FROM rider_assignment ra
       JOIN delivery d ON d.delivery_id = ra.delivery_id
       WHERE ra.user_id = ? AND ra.active_flag = 1`,
      [riderId]
    );
    console.log('\n4️⃣ Current job query result:', currentJob.length === 0 ? 'No job (✅ correct)' : 'Has job (❌ wrong)');
    
    // 5. Check if rider can accept new job
    const [activeJobs] = await pool.query(
      'SELECT * FROM rider_assignment WHERE user_id = ? AND active_flag = 1',
      [riderId]
    );
    console.log('\n5️⃣ Can accept new job?', activeJobs.length === 0 ? '✅ Yes' : '❌ No (still has active job)');
    
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

testFullCycle();
