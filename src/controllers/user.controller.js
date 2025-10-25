import { pool } from '../db/pool.js';

export const userController = {
  async getCustomers(req, res) {
    try {
      const [customers] = await pool.query(
        `SELECT user_id, phone, name, avatar_url, role, created_at 
         FROM user 
         WHERE role = 'CUSTOMER'
         ORDER BY name ASC`
      );
      
      res.json({ customers });
    } catch (error) {
      console.error('Error fetching customers:', error);
      res.status(500).json({ message: 'Failed to fetch customers' });
    }
  },

  async getUserAddresses(req, res) {
    try {
      const { userId } = req.params;
      
      const [addresses] = await pool.query(
        `SELECT address_id, user_id, label, address_line, lat, lng, is_default, created_at
         FROM address
         WHERE user_id = ?
         ORDER BY is_default DESC, created_at DESC`,
        [userId]
      );
      
      res.json({ addresses });
    } catch (error) {
      console.error('Error fetching addresses:', error);
      res.status(500).json({ message: 'Failed to fetch addresses' });
    }
  }
};
