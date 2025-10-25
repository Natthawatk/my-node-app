import { initDB } from './src/db/pool.js';

async function fixActiveFlag() {
  try {
    console.log('🔧 Fixing active_flag values...\n');
    
    const pool = await initDB();
    
    // Show current state
    const [before] = await pool.query('SELECT * FROM rider_assignment ORDER BY assignment_id');
    console.log('📦 Before fix:');
    console.table(before);
    
    // Find riders with multiple active jobs
    const [duplicates] = await pool.query(`
      SELECT user_id, COUNT(*) as count
      FROM rider_assignment
      WHERE state IN ('ASSIGNED', 'PICKED')
      GROUP BY user_id
      HAVING count > 1
    `);
    
    if (duplicates.length > 0) {
      console.log('\n⚠️  Found riders with multiple active jobs:');
      console.table(duplicates);
      
      // For each rider with duplicates, keep only the latest assignment
      for (const dup of duplicates) {
        const riderId = dup.user_id;
        
        // Get all assignments for this rider
        const [assignments] = await pool.query(`
          SELECT assignment_id, delivery_id, accepted_at
          FROM rider_assignment
          WHERE user_id = ? AND state IN ('ASSIGNED', 'PICKED')
          ORDER BY accepted_at DESC
        `, [riderId]);
        
        console.log(`\n👤 Rider ${riderId} has ${assignments.length} active jobs:`);
        console.table(assignments);
        
        // Keep the latest (first one), mark others as cancelled
        const latestId = assignments[0].assignment_id;
        const oldIds = assignments.slice(1).map(a => a.assignment_id);
        
        if (oldIds.length > 0) {
          await pool.query(`
            UPDATE rider_assignment
            SET state = 'CANCELLED', completed_at = NOW(), active_flag = 0
            WHERE assignment_id IN (?)
          `, [oldIds]);
          
          console.log(`   ✅ Cancelled ${oldIds.length} old jobs, keeping assignment ${latestId}`);
        }
      }
    }
    
    // Now update active_flag for remaining jobs
    // Set active_flag = 0 for COMPLETED and CANCELLED first
    const [result2] = await pool.query(`
      UPDATE rider_assignment 
      SET active_flag = 0 
      WHERE state IN ('COMPLETED', 'CANCELLED') AND (active_flag IS NULL OR active_flag != 0)
    `);
    console.log(`\n✅ Set active_flag=0 for ${result2.affectedRows} COMPLETED/CANCELLED jobs`);
    
    // Then set active_flag = 1 for ASSIGNED and PICKED
    const [result1] = await pool.query(`
      UPDATE rider_assignment 
      SET active_flag = 1 
      WHERE state IN ('ASSIGNED', 'PICKED') AND (active_flag IS NULL OR active_flag != 1)
    `);
    console.log(`✅ Set active_flag=1 for ${result1.affectedRows} ASSIGNED/PICKED jobs`);
    
    // Show after state
    const [after] = await pool.query('SELECT * FROM rider_assignment ORDER BY assignment_id');
    console.log('\n📦 After fix:');
    console.table(after);
    
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

fixActiveFlag();
