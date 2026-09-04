const express = require('express');
const {
  listMeters,
  getMeter,
  createMeter,
  updateMeter,
  deleteMeter,
  downloadBill,
} = require('../controllers/meterController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

const router = express.Router();
router.use(protect);

router.route('/').get(listMeters).post(adminOnly, createMeter);
router.get('/:id/bill.pdf', downloadBill);
router.route('/:id').get(getMeter).patch(adminOnly, updateMeter).delete(adminOnly, deleteMeter);

module.exports = router;
