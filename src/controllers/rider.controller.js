import { pool } from '../db/pool.js';

export const riderController = {
  async saveRiderLocation(req, res) {
    try {
      const { riderId } = req.params;
      const { lat, lng, delivery_id } = req.body;
      
      await pool.query(
        `INSERT INTO rider_location (user_id, delivery_id, lat, lng, recorded_at)
         VALUES (?, ?, ?, ?, NOW())`,
        [riderId, delivery_id || null, lat, lng]
      );
      
      res.json({ message: 'Location saved successfully' });
    } catch (error) {
      console.error('Error saving rider location:', error);
      res.status(500).json({ message: 'Failed to save location' });
    }
  },

  async getRiderLocationForDelivery(req, res) {
    try {
      const { deliveryId } = req.params;
      
      // Get the rider assigned to this delivery
      const [assignments] = await pool.query(
        `SELECT ra.user_id, u.name as rider_name
         FROM rider_assignment ra
         JOIN user u ON u.user_id = ra.user_id
         WHERE ra.delivery_id = ? AND ra.active_flag = 1
         LIMIT 1`,
        [deliveryId]
      );
      
      if (assignments.length === 0) {
        return res.status(404).json({ message: 'No active rider for this delivery' });
      }
      
      const riderId = assignments[0].user_id;
      const riderName = assignments[0].rider_name;
      
      // Get latest location
      const [locations] = await pool.query(
        `SELECT lat, lng, recorded_at
         FROM rider_location
         WHERE user_id = ?
         ORDER BY recorded_at DESC
         LIMIT 1`,
        [riderId]
      );
      
      if (locations.length === 0) {
        return res.status(404).json({ message: 'No location data available' });
      }
      
      res.json({
        rider_id: riderId,
        rider_name: riderName,
        lat: locations[0].lat,
        lng: locations[0].lng,
        recorded_at: locations[0].recorded_at
      });
    } catch (error) {
      console.error('Error getting rider location:', error);
      res.status(500).json({ message: 'Failed to get rider location' });
    }
  },

  // ✅ Cleanup: Set active_flag = NULL for completed deliveries
  async cleanupRiderAssignments(req, res) {
    try {
      const { riderId } = req.params;
      
      // Set active_flag = NULL for all completed/delivered jobs
      const [result] = await pool.query(
        `UPDATE rider_assignment ra
         JOIN delivery d ON d.delivery_id = ra.delivery_id
         SET ra.active_flag = NULL, ra.state = 'COMPLETED', ra.completed_at = COALESCE(ra.completed_at, NOW())
         WHERE ra.user_id = ? 
         AND d.status = 'DELIVERED'
         AND ra.active_flag = 1`,
        [riderId]
      );
      
      console.log(`🧹 Cleanup: Set ${result.affectedRows} assignments to active_flag = NULL for rider ${riderId}`);
      
      res.json({ 
        message: 'Cleanup completed successfully',
        updated: result.affectedRows
      });
    } catch (error) {
      console.error('Error cleaning up assignments:', error);
      res.status(500).json({ message: 'Failed to cleanup assignments' });
    }
  }
};
