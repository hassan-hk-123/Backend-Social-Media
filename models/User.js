const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String }, // Not required for Google users
  gender: { type: String },
  isVerified: { type: Boolean, default: false },
  avatarImg: { type: String },
  coverImg: { type: String },
  age: { type: Number },
  address: { type: String },
  country: { type: String },
  bio: { type: String },
  study: { type: String },
  dob: { type: Date },
  followers: { type: [mongoose.Schema.Types.ObjectId], ref: 'User', default: [] },
  following: { type: [mongoose.Schema.Types.ObjectId], ref: 'User', default: [] },
  verificationCode: { type: String },
  verificationCodeExpiry: { type: Date },
  resetToken: { type: String },
  resetTokenExpiry: { type: Date },
  createdAt: { type: Date, default: Date.now },
  provider: { type: String, enum: ['manual', 'google', 'facebook'], default: 'manual' }, // Added provider field
  googleId: { type: String }, // Added for Google login
  facebookId: { type: String }, // Added for Facebook login
});

module.exports = mongoose.model('User', userSchema);