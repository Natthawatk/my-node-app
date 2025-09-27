import { initDB, getDB } from './src/db/pool.js';
import bcrypt from 'bcryptjs';

async function seedUsers() {
  await initDB();
  const db = getDB();
  
  const users = [
    {
      phone: '0811111111',
      password: 'hash123',
      name: 'ลูกค้าทดสอบ',
      role: 'CUSTOMER'
    },
    {
      phone: '0822222222', 
      password: 'rider123',
      name: 'ไรเดอร์ทดสอบ',
      role: 'RIDER'
    },
    {
      phone: '0833333333',
      password: 'admin123', 
      name: 'แอดมินทดสอบ',
      role: 'ADMIN'
    }
  ];
  
  for (const user of users) {
    const hashedPassword = await bcrypt.hash(user.password, 10);
    
    try {
      await db.run(
        'INSERT OR REPLACE INTO user (phone, password_hash, name, role) VALUES (?, ?, ?, ?)',
        [user.phone, hashedPassword, user.name, user.role]
      );
      console.log(`✓ Created user: ${user.name} (${user.phone})`);
    } catch (error) {
      console.error(`✗ Error creating user ${user.phone}:`, error.message);
    }
  }
  
  console.log('\nSeed completed!');
  process.exit(0);
}

seedUsers().catch(console.error);