const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_change_me';

// Hash a password
const hashPassword = async (password) => {
  const saltRounds = 10;
  return await bcrypt.hash(password, saltRounds);
};

// Compare password with hash
const comparePassword = async (password, hash) => {
  return await bcrypt.compare(password, hash);
};

// Generate JWT token - INCLUDES user_role
const generateToken = (user) => {
  return jwt.sign(
    { 
      id: user.id, 
      email: user.email,
      user_type: user.user_type,
      user_role: user.user_role     // ← ADDED: This was missing
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
};

// Verify JWT token middleware
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  const token = authHeader.split(' ')[1];
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    console.log('✅ Token verified, user:', { id: req.user.id, role: req.user.user_role });
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

module.exports = {
  hashPassword,
  comparePassword,
  generateToken,
  verifyToken
};