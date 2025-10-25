import { pool } from '../db/pool.js';

export const addressController = {
  async addAddress(req, res) {
    try {
      const { user_id, label, address_line, lat, lng, is_default } = req.body;
      
      // If this is default, unset other defaults
      if (is_default) {
        await pool.query(
          'UPDATE address SET is_default = 0 WHERE user_id = ?',
          [user_id]
        );
      }
      
      const [result] = await pool.query(
        `INSERT INTO address (user_id, label, address_line, lat, lng, is_default)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [user_id, label, address_line, lat, lng, is_default ? 1 : 0]
      );
      
      res.status(201).json({ 
        message: 'Address added successfully',
        address_id: result.insertId
      });
    } catch (error) {
      console.error('Error adding address:', error);
      res.status(500).json({ message: 'Failed to add address' });
    }
  },

  async updateAddress(req, res) {
    try {
      const { addressId } = req.params;
      const { label, address_line, lat, lng, is_default } = req.body;
      
      // Get user_id for this address
      const [addresses] = await pool.query(
        'SELECT user_id FROM address WHERE address_id = ?',
        [addressId]
      );
      
      if (addresses.length === 0) {
        return res.status(404).json({ message: 'Address not found' });
      }
      
      const userId = addresses[0].user_id;
      
      // If this is default, unset other defaults
      if (is_default) {
        await pool.query(
          'UPDATE address SET is_default = 0 WHERE user_id = ? AND address_id != ?',
          [userId, addressId]
        );
      }
      
      await pool.query(
        `UPDATE address 
         SET label = ?, address_line = ?, lat = ?, lng = ?, is_default = ?
         WHERE address_id = ?`,
        [label, address_line, lat, lng, is_default ? 1 : 0, addressId]
      );
      
      res.json({ message: 'Address updated successfully' });
    } catch (error) {
      console.error('Error updating address:', error);
      res.status(500).json({ message: 'Failed to update address' });
    }
  },

  async deleteAddress(req, res) {
    try {
      const { addressId } = req.params;
      
      await pool.query('DELETE FROM address WHERE address_id = ?', [addressId]);
      
      res.json({ message: 'Address deleted successfully' });
    } catch (error) {
      console.error('Error deleting address:', error);
      res.status(500).json({ message: 'Failed to delete address' });
    }
  }
};
