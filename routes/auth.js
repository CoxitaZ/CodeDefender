const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const GameState = require('../models/GameState');
const router = express.Router();
function sign(user) { return jwt.sign({ id: user._id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '7d' }); }
router.post('/register', async (req, res) => {
  const username = String(req.body.username || '').trim(); const password = String(req.body.password || '');
  if (username.length < 3 || password.length < 6) return res.status(400).json({ message: 'Usuario ou senha invalidos' });
  const exists = await User.findOne({ username }); if (exists) return res.status(409).json({ message: 'Usuario ja cadastrado' });
  const user = await User.create({ username, passwordHash: await bcrypt.hash(password, 12) }); await GameState.create({ userId: user._id });
  res.status(201).json({ token: sign(user), user: { id: user._id, username: user.username } });
});
router.post('/login', async (req, res) => {
  const username = String(req.body.username || '').trim(); const password = String(req.body.password || '');
  const user = await User.findOne({ username });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({ message: 'Credenciais invalidas' });
  await GameState.findOneAndUpdate({ userId: user._id }, { $setOnInsert: { userId: user._id } }, { upsert: true });
  res.json({ token: sign(user), user: { id: user._id, username: user.username } });
});
module.exports = router;
