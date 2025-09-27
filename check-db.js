import { initDB } from './src/db/pool.js';

async function checkDatabase() {
  try {
    const db = await initDB();
    
    console.log('📊 ข้อมูลในตาราง user:');
    console.log('=' .repeat(50));
    
    const users = await db.all('SELECT * FROM user');
    
    if (users.length === 0) {
      console.log('ไม่มีข้อมูลผู้ใช้');
    } else {
      users.forEach((user, index) => {
        console.log(`${index + 1}. ID: ${user.user_id}`);
        console.log(`   Phone: ${user.phone}`);
        console.log(`   Name: ${user.name}`);
        console.log(`   Role: ${user.role}`);
        console.log(`   Password Hash: ${user.password_hash.substring(0, 20)}...`);
        console.log('');
      });
    }
    
    console.log(`รวม: ${users.length} ผู้ใช้`);
    
  } catch (error) {
    console.error('Error:', error);
  }
}

checkDatabase();