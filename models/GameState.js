const mongoose = require('mongoose');
const highScoreSchema = new mongoose.Schema({ player: String, score: Number, difficulty: String, wave: Number, won: Boolean, perfect: Boolean, date: String }, { _id: false });
const gameStateSchema = new mongoose.Schema({ userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true }, points: { type: Number, default: 0, min: 0 }, dmgLevel: { type: Number, default: 0, min: 0, max: 5 }, ramLevel: { type: Number, default: 0, min: 0, max: 3 }, catOwned: { type: Boolean, default: false }, catActive: { type: Boolean, default: false }, highScores: { type: [highScoreSchema], default: [] } }, { timestamps: true });
module.exports = mongoose.model('GameState', gameStateSchema);
