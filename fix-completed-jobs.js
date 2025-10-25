import { initDB } from './src/db/pool.js';

async function fixCompletedJobs() {
  try {
    const pool = await initDB();
    
    console.log('🔧 Fixing completed jobs with wrong active_flag...\n');
    
    // Find jobs that have completed_at but still have active_flag = 1
    const [broken] = await pool.query(`
      SELECT ra.*, d.status
      FROM rider_assignment ra
      JOIN delivery d ON d.delivery_id = ra.delivery_id
      WHERE ra.completed_at IS NOT NULL AND ra.active_flag = 1
    `);
    
    if (broken.length > 0) {
      console.log('❌ Found broken assignments:');
      console.table(broken);
      
      // Fix them - set active_flag to NULL instead of 0
      const [result] = await pool.query(`
        UPDATE rider_assignment ra
        JOIN delivery d ON d.delivery_id = ra.delivery_id
        SET ra.active_flag = NULL, ra.state = 'COMPLETED'
        WHERE ra.completed_at IS NOT NULL AND ra.active_flag = 1
      `);
      
      console.log(`\n✅ Fixed ${result.affectedRows} assignments`);
    } else {
      console.log('✅ No broken assignments found');
    }
    
    // Show all assignments
    const [all] = await pool.query('SELECT * FROM rider_assignment ORDER BY assignment_id');
    console.log('\n📦 All assignments:');
    console.table(all);
    
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

fixCompletedJobs();
