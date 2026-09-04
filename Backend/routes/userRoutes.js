const express = require('express');
const {
  listUsers, createUser, updateUser, resetPassword, deleteUser,
} = require('../controllers/userController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

const router = express.Router();
router.use(protect, adminOnly);

router.route('/').get(listUsers).post(createUser);
router.route('/:id').patch(updateUser).delete(deleteUser);
router.patch('/:id/password', resetPassword);

module.exports = router;
