const express = require('express');
const { listAnomalies, acknowledge, getStats } = require('../controllers/anomalyController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

const router = express.Router();
router.use(protect, adminOnly);

router.get('/', listAnomalies);
router.get('/stats', getStats);
router.patch('/:id/ack', acknowledge);

module.exports = router;
