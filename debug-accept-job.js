import { initDB } from './src/db/pool.js';

async function debugAcceptJob() {
  try {
    const pool = await initDB();
    
    const riderId = 32;
    const deliveryId = 21; // ใช้ delivery ใหม่
    
    console.log(`\n🔍 Simulating acceptDeliveryJob for rider ${riderId}, delivery ${deliveryId}...\n`);
    
    const connection = await pool.getConnection();
    await connection.beginTransaction();
    
    try {
      // Check existing jobs
      const [existingJobs] = await connection.query(
        'SELECT * FROM rider_assignment WHERE user_id = ? AND active_flag = 1',
        [riderId]
      );
      console.log(`1️⃣ Existing active jobs for rider ${riderId}:`, existingJobs.length);
      if (existingJobs.length > 0) {
        console.table(existingJobs);
      }
      
      // Check delivery status
      const [deliveries] = await connection.query(
        'SELECT * FROM delivery WHERE delivery_id = ? AND status = \'WAITING\'',
        [deliveryId]
      );
      console.log(`\n2️⃣ Delivery ${deliveryId} status:`, deliveries.length > 0 ? deliveries[0].status : 'NOT FOUND');
      
      if (deliveries.length === 0) {
        console.log('❌ Delivery not available');
        await connection.rollback();
        connection.release();
        await pool.end();
        return;
      }
      
      // Update delivery status
      await connection.query(
        `UPDATE delivery 
         SET status = 'ASSIGNED', assigned_at = NOW()
         WHERE delivery_id = ?`,
        [deliveryId]
      );
      console.log(`\n3️⃣ Updated delivery ${deliveryId} to ASSIGNED`);
      
      // Insert rider_assignment
      console.log(`\n4️⃣ Inserting rider_assignment with active_flag = 1...`);
      const [insertResult] = await connection.query(
        `INSERT INTO rider_assignment (delivery_id, user_id, state, accepted_at, active_flag)
         VALUES (?, ?, 'ASSIGNED', NOW(), 1)`,
        [deliveryId, riderId]
      );
      console.log(`   ✅ Insert successful: insertId=${insertResult.insertId}, affectedRows=${insertResult.affectedRows}`);
      
      await connection.commit();
      console.log(`\n5️⃣ Transaction committed`);
      
      // Verify the insert
      const [verify] = await pool.query(
        'SELECT * FROM rider_assignment WHERE user_id = ? AND delivery_id = ?',
        [riderId, deliveryId]
      );
      console.log(`\n6️⃣ Verification - Found ${verify.length} assignments:`);
      console.table(verify);
      
      // Test the query used in getRiderCurrentJob
      const [currentJob] = await pool.query(
        `SELECT d.delivery_id, d.status, ra.active_flag
         FROM rider_assignment ra
         JOIN delivery d ON d.delivery_id = ra.delivery_id
         WHERE ra.user_id = ? AND ra.active_flag = 1
         LIMIT 1`,
        [riderId]
      );
      console.log(`\n7️⃣ Query for current job (active_flag=1):`);
      if (currentJob.length === 0) {
        console.log('   ❌ No job found!');
      } else {
        console.table(currentJob);
      }
      
    } catch (error) {
      await connection.rollback();
      console.error('❌ Error during transaction:', error);
    } finally {
      connection.release();
    }
    
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

debugAcceptJob();
