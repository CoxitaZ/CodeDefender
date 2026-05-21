const express = require('express');
const requireAuth = require('../middleware/auth');
const GameState = require('../models/GameState');
const router = express.Router();
router.use(requireAuth);
function publicState(doc) { return { points: doc.points, dmgLevel: doc.dmgLevel, ramLevel: doc.ramLevel, catOwned: doc.catOwned, catActive: doc.catActive, highScores: doc.highScores || [] }; }
router.get('/load', async (req, res) => { const state = await GameState.findOneAndUpdate({ userId: req.user.id }, { $setOnInsert: { userId: req.user.id } }, { new: true, upsert: true }); res.json({ gameState: publicState(state) }); });
router.post('/save', async (req, res) => {
  const body = req.body || {}; const current = await GameState.findOneAndUpdate({ userId: req.user.id }, { $setOnInsert: { userId: req.user.id } }, { new: true, upsert: true });
  if (Number.isFinite(Number(body.pointsDelta))) current.points = Math.max(0, current.points + Number(body.pointsDelta)); else if (Number.isFinite(Number(body.points))) current.points = Math.max(0, Number(body.points));
  ['dmgLevel', 'ramLevel'].forEach(key => { if (Number.isFinite(Number(body[key]))) current[key] = Number(body[key]); });
  ['catOwned', 'catActive'].forEach(key => { if (typeof body[key] === 'boolean') current[key] = body[key]; });
  if (Array.isArray(body.highScores)) current.highScores = body.highScores.slice(0, 10);
  await current.save(); res.json({ gameState: publicState(current) });
});
module.exports = router;
