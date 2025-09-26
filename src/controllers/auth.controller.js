import bcrypt from 'bcryptjs';
import { pool } from '../db/pool.js';

export async function register(req, res) {
  try {
    const { username, email, password, phone, full_name, role = 'customer' } = req.body;
    
    const [existingUser] = await pool.query(
      'SELECT id FROM user WHERE email = ? OR phone = ?', 
      [email, phone]
    );
    
    if (existingUser.length > 0) {
      return res.status(400).json({ error: 'ผู้ใช้นี้มีอยู่แล้ว' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const [result] = await pool.query(
      'INSERT INTO user (username, email, password, phone, full_name, role) VALUES (?, ?, ?, ?, ?, ?)',
      [username, email, hashedPassword, phone, full_name, role]
    );
    
    res.status(201).json({ 
      message: 'สมัครสมาชิกสำเร็จ',
      user: { id: result.insertId, username, email, phone, full_name, role }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาด' });
  }
}

export async function login(req, res) {
  try {
    const { phone, password } = req.body;
    
    const [users] = await pool.query(
      'SELECT * FROM user WHERE phone = ?', 
      [phone]
    );
    
    if (users.length === 0) {
      return res.status(401).json({ error: 'ข้อมูลไม่ถูกต้อง' });
    }
    
    const user = users[0];
    
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: 'ข้อมูลไม่ถูกต้อง' });
    }
    
    req.session.userId = user.id;
    
    res.json({ 
      message: 'เข้าสู่ระบบสำเร็จ', 
      user: { 
        id: user.id, 
        username: user.username,
        email: user.email,
        phone: user.phone, 
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