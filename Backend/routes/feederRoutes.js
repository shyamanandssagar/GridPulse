const express = require('express');
const {
  listFeeders,
  getTopology,
  triggerFault,
  restoreFeeder,
} = require('../controllers/feederController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

const router = express.Router();
router.use(protect, adminOnly);

router.get('/', listFeeders);
router.get('/topology', getTopology);
router.post('/:id/fault', triggerFault);
router.post('/:id/restore', restoreFeeder);

module.exports = router;
