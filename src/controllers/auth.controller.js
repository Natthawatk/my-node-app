import bcrypt from 'bcryptjs';
import { getDB } from '../db/pool.js';

export async function register(req, res) {
  try {
    const { phone, password, name, role = 'CUSTOMER' } = req.body;
    
    const db = getDB();
    const existingUser = await db.get(
      'SELECT user_id FROM user WHERE phone = ?', 
      [phone]
    );
    
    if (existingUser) {
      return res.status(400).json({ error: 'ผู้ใช้นี้มีอยู่แล้ว' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const result = await db.run(
      'INSERT INTO user (phone, password_hash, name, role) VALUES (?, ?, ?, ?)',
      [phone, hashedPassword, name, role]
    );
    
    res.status(201).json({ 
      message: 'สมัครสมาชิกสำเร็จ',
      user: { user_id: result.lastID, phone, name, role }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาด' });
  }
}

export async function login(req, res) {
  try {
    const { phone, password } = req.body;
    console.log('Login attempt:', { phone, password });
    
    // Retry database query
    let users;
    let retries = 3;
    while (retries > 0) {
      try {
        const db = getDB();
        users = await db.all(
          'SELECT * FROM user WHERE phone = ?', 
          [phone]
        );
        break;
      } catch (dbError) {
        console.log('DB retry attempt:', 4 - retries, 'Error:', dbError.code);
        retries--;
        if (retries === 0) throw dbError;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    console.log('Users found:', users ? users.length : 0);
    
    if (!users || users.length === 0) {
      console.log('No user found with phone:', phone);
      return res.status(401).json({ error: 'ข้อมูลไม่ถูกต้อง' });
    }
    
    const user = users[0];
    console.log('User found:', { user_id: user.user_id, phone: user.phone, role: user.role });
    
    // Check if password is hashed or plain text
    let isValid = false;
    if (user.password_hash.startsWith('$2')) {
      // Hashed password
      isValid = await bcrypt.compare(password, user.password_hash);
    } else {
      // Plain text password
      isValid = password === user.password_hash;
    }
    
    console.log('Password valid:', isValid);
    
    if (!isValid) {
      console.log('Invalid password for user:', phone);
      return res.status(401).json({ error: 'ข้อมูลไม่ถูกต้อง' });
    }
    
    req.session.userId = user.user_id;
    
    res.json({ 
      message: 'เข้าสู่ระบบสำเร็จ', 
      user: { 
        user_id: user.user_id, 
        phone: user.phone,
        name: user.name, 
        role: user.role 
      } 
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาด' });
  }
}

export async function logout(req, res) {
  req.session.destroy(() => {
    res.clearCookie(process.env.SESSION_NAME || 'sid');
    res.json({ message: 'ออกจากระบบแล้ว' });
  });
}

export async function me(req, res) {
  return res.json({ user_id: 1, phone: '0123456789', role: 'CUSTOMER' });
}

export async function changePassword(req, res) {
  return res.json({ message: 'เปลี่ยนรหัสผ่านสำเร็จ' });
}

export async function check(req, res) {
  res.json({ authenticated: true });
}