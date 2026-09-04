// Run with: npm run create-admin
// Idempotent — won't recreate if an admin with the same email already exists.
require('dotenv').config();
const readline = require('readline');
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q, hidden = false) =>
  new Promise((resolve) => {
    if (!hidden) return rl.question(q, (a) => resolve(a.trim()));
    
    const stdin = process.openStdin();
    process.stdin.on('data', () => {}); 
    rl.question(q, (a) => resolve(a.trim()));
  });

async function run() {
  await connectDB();

  console.log('  Create or update an admin user');
  const name = (await ask('Name: ')) || 'Admin';
  const email = await ask('Email: ');
  const password = await ask('Password (min 6 chars): ');
  rl.close();

  if (!email || !password || password.length < 6) {
    console.error(' email and password (>= 6 chars) required');
    process.exit(1);
  }

  let user = await User.findOne({ email: email.toLowerCase() });
  if (user) {
    user.name = name;
    user.role = 'admin';
    user.password = password;
    await user.save();
    console.log(` Updated existing user → admin: ${user.email}`);
  } else {
    user = await User.create({ name, email, password, role: 'admin' });
    console.log(` Created admin: ${user.email}`);
  }

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });
