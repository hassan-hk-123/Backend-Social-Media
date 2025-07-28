const mongoose = require('mongoose');

const relationshipSchema = new mongoose.Schema({
  from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // requester
  to: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },   // receiver
  status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Relationship', relationshipSchema); 