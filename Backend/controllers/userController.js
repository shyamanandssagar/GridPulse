const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const { sendCredentialsEmail } = require('../utils/mailer');

// All endpoints in this controller are admin-only (enforced at the route layer)

// GET /api/users
const listUsers = asyncHandler(async (_req, res) => {
  const users = await User.find({})
    .populate('assignedMeters', 'serial customerName')
    .sort({ createdAt: -1 })
    .lean();
  res.json(users);
});

// POST /api/users — admin creates a user (can be admin or regular)
const createUser = asyncHandler(async (req, res) => {
  const { name, email, password, role = 'user', assignedMeters = [] } = req.body;
  if (!name || !email || !password) {
    res.status(400);
    throw new Error('name, email and password are required');
  }
  if (await User.findOne({ email: email.toLowerCase() })) {
    res.status(400);
    throw new Error('Email already in use');
  }
  const user = await User.create({ name, email, password, role, assignedMeters });

  // Email the new account its credentials. 
  let emailSent = false;
  try {
    const result = await sendCredentialsEmail(user.email, {
      name: user.name,
      email: user.email,
      password,
      role: user.role,
    });
    emailSent = !!result?.delivered;
  } catch (err) {
    console.error('Failed to send credentials email:', err.message);
  }

  res.status(201).json({ ...user.toJSON(), emailSent });
});

// PATCH /api/users/:id  — update name/role/assignedMeters (NOT password)
const updateUser = asyncHandler(async (req, res) => {
  const allowed = ['name', 'role', 'assignedMeters'];
  const patch = {};
  for (const k of allowed) if (k in req.body) patch[k] = req.body[k];

  // Don't let an admin demote themselves out of admin 
  if (
    String(req.user._id) === String(req.params.id) &&
    patch.role &&
    patch.role !== 'admin'
  ) {
    res.status(400);
    throw new Error("You can't remove your own admin role");
  }

  const updated = await User.findByIdAndUpdate(req.params.id, patch, { new: true })
    .populate('assignedMeters', 'serial customerName');
  if (!updated) {
    res.status(404);
    throw new Error('User not found');
  }
  res.json(updated);
});

// PATCH /api/users/:id/password — admin reset
const resetPassword = asyncHandler(async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 6) {
    res.status(400);
    throw new Error('Password must be at least 6 characters');
  }
  const user = await User.findById(req.params.id);
  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }
  user.password = password;
  await user.save();
  res.json({ ok: true });
});

// DELETE /api/users/:id
const deleteUser = asyncHandler(async (req, res) => {
  if (String(req.user._id) === String(req.params.id)) {
    res.status(400);
    throw new Error("You can't delete your own account");
  }
  const deleted = await User.findByIdAndDelete(req.params.id);
  if (!deleted) {
    res.status(404);
    throw new Error('User not found');
  }
  res.json({ deleted: true });
});

module.exports = { listUsers, createUser, updateUser, resetPassword, deleteUser };
