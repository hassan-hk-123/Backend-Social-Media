const jwt = require('jsonwebtoken'); // Make sure to import jwt
const User = require('../models/User');

// Strict: Require token
async function verifyToken(req, res, next) {
  // In production, verify JWT or session here
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ error: 'No token, authorization denied' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id); // or decoded._id
    
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    req.user = user;
    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    res.status(401).json({ error: 'Token is not valid' });
  }
}

// Optional: Attach user if token present, else just next()
async function optional(req, res, next) {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return next();
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (user) {
      req.user = user;
    }
  } catch (err) {
    // ignore error, treat as guest
  }
  next();
}

verifyToken.optional = optional;

module.exports = verifyToken;