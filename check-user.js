import bcrypt from 'bcryptjs';
import { pool } from './src/db/pool.js';

async function checkUser() {
  try {
    const phone = '0811111111';
    const password = 'hash123';
    
    const [users] = await pool.query(
      'SELECT * FROM user WHERE phone = ?', 
      [phone]
    );
    
    console.log('=== User Check ===');
    console.log('Phone:', phone);
    console.log('Password to test:', password);
    console.log('Users found:', users.length);
    
    if (users.length > 0) {
      const user = users[0];
      console.log('User data:', {
        user_id: user.user_id,
        phone: user.phone,
        name: user.name,
        role: user.role,
        password_hash: user.password_hash
      });
      
      const isValid = await bcrypt.compare(password, user.password_hash);
      console.log('Password match:', isValid);
      
      // Test with different passwords
      const testPasswords = ['123456', 'password', 'hash123', 'test123'];
      for (const testPass of testPasswords) {
        const match = await bcrypt.compare(testPass, user.password_hash);
        console.log(`Password "${testPass}":`, match);
      }
    } else {
      console.log('No user found with phone:', phone);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkUser();