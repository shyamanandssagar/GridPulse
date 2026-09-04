const express = require('express');
const { getReadings, aggregateReadings } = require('../controllers/readingController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();
router.use(protect);

router.get('/:meterId', getReadings);
router.get('/:meterId/aggregate', aggregateReadings);

module.exports = router;
