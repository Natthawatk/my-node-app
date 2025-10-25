import { initDB } from './src/db/pool.js';

async function testCurrentJob() {
  try {
    const pool = await initDB();
    
    const riderId = 32; // Test with rider 32
    
    console.log(`\n🔍 Testing getRiderCurrentJob for rider ${riderId}...\n`);
    
    // This is the same query used in getRiderCurrentJob
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
    
    if (jobs.length === 0) {
      console.log('❌ No active job found');
    } else {
      console.log('✅ Found active job:');
      console.log(JSON.stringify(jobs[0], null, 2));
    }
    
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

testCurrentJob();
