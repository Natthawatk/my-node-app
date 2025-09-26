import bcrypt from 'bcryptjs';
import { pool } from '../db/pool.js';

export async function register(req, res) {
  try {
    const { phone, password, name, role = 'CUSTOMER' } = req.body;
    
    const [existingUser] = await pool.query(
      'SELECT user_id FROM user WHERE phone = ?', 
      [phone]
    );
    
    if (existingUser.length > 0) {
      return res.status(400).json({ error: 'ผู้ใช้นี้มีอยู่แล้ว' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const [result] = await pool.query(
      'INSERT INTO user (phone, password_hash, name, role) VALUES (?, ?, ?, ?)',
      [phone, hashedPassword, name, role]
    );
    
    res.status(201).json({ 
      message: 'สมัครสมาชิกสำเร็จ',
      user: { user_id: result.insertId, phone, name, role }
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
    
    const [users] = await pool.query(
      'SELECT * FROM user WHERE phone = ?', 
      [phone]
    );
    
    console.log('Users found:', users.length);
    
    if (users.length === 0) {
      console.log('No user found with phone:', phone);
      return res.status(401).json({ error: 'ข้อมูลไม่ถูกต้อง' });
    }
    
    const user = users[0];
    console.log('User found:', { user_id: user.user_id, phone: user.phone, role: user.role });
    
    const isValid = await bcrypt.compare(password, user.password_hash);
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