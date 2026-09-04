const express = require('express');
const {
  getSummary,
  getReliability,
  getOutageHistory,
  getBills,
  getGridLoadCurve,
  getLossAnalysis,
  postInjectTheft,
  postClearTheft,
} = require('../controllers/analyticsController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

const router = express.Router();
router.use(protect, adminOnly);

router.get('/summary', getSummary);
router.get('/reliability', getReliability);
router.get('/outages', getOutageHistory);
router.get('/bills', getBills);
router.get('/load-curve', getGridLoadCurve);
router.get('/loss-analysis', getLossAnalysis);
router.post('/loss-analysis/inject-demo', postInjectTheft);
router.post('/loss-analysis/clear', postClearTheft);

module.exports = router;

module.exports = router;
