import { initDB } from './src/db/pool.js';

async function checkRiderAssignment() {
  try {
    console.log('🔍 Initializing database and checking rider_assignment...\n');
    
    const pool = await initDB();
    
    // Show table structure
    const [columns] = await pool.query('DESCRIBE rider_assignment');
    console.log('📋 Table Structure:');
    console.table(columns);
    
    // Show CREATE TABLE statement
    const [createTable] = await pool.query('SHOW CREATE TABLE rider_assignment');
    console.log('\n📝 CREATE TABLE Statement:');
    console.log(createTable[0]['Create Table']);
    
    // Show all assignments
    const [assignments] = await pool.query('SELECT * FROM rider_assignment');
    console.log('\n📦 Current Assignments:');
    if (assignments.length === 0) {
      console.log('(No assignments found)');
    } else {
      console.table(assignments);
    }
    
    // Check for any riders
    const [riders] = await pool.query("SELECT user_id, name, role FROM user WHERE role = 'RIDER'");
    console.log('\n👤 Riders in system:');
    if (riders.length === 0) {
      console.log('(No riders found)');
    } else {
      console.table(riders);
    }
    
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkRiderAssignment();
