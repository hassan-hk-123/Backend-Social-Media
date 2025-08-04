const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Relationship = require('../models/Relationship');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');
const verifyToken = require('../middleware/authMiddleware');
const cors = require('cors');
const upload = require('../config/multer');
const { OAuth2Client } = require('google-auth-library');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

router.use(cors({
  origin: process.env.FRONTEND_URL,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true,
}));

const generateUniqueUsername = async (email) => {
  // Clean the email prefix and make it username-friendly
  let baseUsername = email.split('@')[0]
    .replace(/[^a-zA-Z0-9_]/g, '') // Remove special characters
    .toLowerCase(); // Convert to lowercase
  
  // Ensure minimum length
  if (baseUsername.length < 3) {
    baseUsername = baseUsername + 'user';
  }
  
  // Ensure maximum length
  if (baseUsername.length > 15) {
    baseUsername = baseUsername.substring(0, 15);
  }
  
  let username = baseUsername;
  let counter = 1;
  
  // Keep trying until we find a unique username
  while (await User.findOne({ username })) {
    username = `${baseUsername}${counter}`;
    counter++;
    
    // Prevent infinite loop
    if (counter > 1000) {
      // Fallback: use timestamp
      username = `user${Date.now()}`;
      break;
    }
  }
  
  return username;
};

router.post('/signup', async (req, res) => {
  const { fullName, username, email, password, gender } = req.body;

  try {
    if (!fullName || !username || !email || !password || !gender) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      return res.status(400).json({ message: 'Email already exists' });
    }

    const existingUsername = await User.findOne({ username });
    if (existingUsername) {
      return res.status(400).json({ message: 'Username already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const verificationCode = Math.floor(1000 + Math.random() * 9000).toString();

    const user = new User({
      fullName,
      username,
      email,
      gender,
      password: hashedPassword,
      verificationCode: verificationCode,
      verificationCodeExpiry: Date.now() + 3600000,
      provider: 'manual',
    });

    await user.save();

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Verify Your Email - TalkHub',
      html: `
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:8px;box-shadow:0 2px 8px #eee;font-family:Segoe UI,Arial,sans-serif;">
    <div style="background:#2d6cdf;padding:24px 0 12px 0;border-radius:8px 8px 0 0;text-align:center;">
      <h2 style="color:#fff;margin:0;font-weight:600;">Welcome to TalkHub!</h2>
    </div>
    <div style="padding:24px 32px 32px 32px;">
      <p style="font-size:16px;color:#222;margin-bottom:16px;">
        Hi there,<br/>
        Thank you for signing up on <b>TalkHub</b>! To complete your registration, please verify your email address.
      </p>
      <div style="background:#f4f6fb;padding:18px 0;border-radius:6px;text-align:center;margin-bottom:20px;">
        <span style="font-size:15px;color:#555;">Your verification code:</span><br/>
        <span style="font-size:28px;letter-spacing:4px;font-weight:700;color:#2d6cdf;">${verificationCode}</span>
      </div>
      <p style="font-size:14px;color:#666;">
        Enter this code in the app to verify your account.<br/>
        If you did not request this, you can safely ignore this email.
      </p>
      <div style="margin-top:32px;text-align:center;">
        <span style="font-size:13px;color:#aaa;">&copy; ${new Date().getFullYear()} TalkHub. All rights reserved.</span>
      </div>
    </div>
  </div>
  `,
    });

    res.status(201).json({ message: 'User registered. Please check your email for the verification code.' });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/google-login', async (req, res) => {
  const { idToken } = req.body;

  try {
    if (!idToken) {
      return res.status(400).json({ message: 'Google token is required' });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;

    if (!email || !name) {
      return res.status(400).json({ message: 'Invalid Google account data' });
    }

    let user = await User.findOne({ email });
    let isNewUser = false;

    if (!user) {
      // Generate unique username
      const username = await generateUniqueUsername(email);
      
      user = new User({
        fullName: name,
        username,
        email,
        avatarImg: picture,
        provider: 'google',
        googleId,
        isVerified: true,
      });
      isNewUser = true;
      await user.save();
    } else {
      // Existing user - update Google info if needed
      if (user.provider !== 'google') {
        user.googleId = googleId;
        user.provider = 'google';
        user.isVerified = true;
      }
      
      // Update profile image if user doesn't have one or if Google has a better one
      if (!user.avatarImg || (picture && picture !== user.avatarImg)) {
        user.avatarImg = picture;
      }
      
      await user.save();
    }

    const token = jwt.sign(
      { id: user._id, name: user.fullName, role: 'user' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'none',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      message: isNewUser ? 'User registered and logged in via Google' : 'Login successful via Google',
      userId: user._id,
      userName: user.fullName,
      role: 'user',
      user: {
        _id: user._id,
        fullName: user.fullName,
        username: user.username,
        email: user.email,
        avatarImg: user.avatarImg,
        provider: user.provider,
        isVerified: user.isVerified
      }
    });
  } catch (error) {
    console.error('Google login error:', error);
    res.status(500).json({ message: 'Google login failed' });
  }
});

// Facebook Login Route
router.post('/facebook-login', async (req, res) => {
  const { accessToken } = req.body;

  try {
    if (!accessToken) {
      return res.status(400).json({ message: 'Facebook access token is required' });
    }

    // Verify Facebook access token
    const response = await fetch(`https://graph.facebook.com/me?fields=id,name,email,picture.type(large)&access_token=${accessToken}`);
    const data = await response.json();

    if (!response.ok || data.error) {
      return res.status(400).json({ message: 'Invalid Facebook access token' });
    }

    const { id: facebookId, email, name, picture } = data;

    if (!email || !name) {
      return res.status(400).json({ message: 'Invalid Facebook account data' });
    }

    let user = await User.findOne({ email });
    let isNewUser = false;

    if (!user) {
      // Generate unique username
      const username = await generateUniqueUsername(email);
      
      user = new User({
        fullName: name,
        username,
        email,
        avatarImg: picture?.data?.url,
        provider: 'facebook',
        facebookId,
        isVerified: true,
      });
      isNewUser = true;
      await user.save();
    } else {
      // Existing user - update Facebook info if needed
      if (user.provider !== 'facebook') {
        user.facebookId = facebookId;
        user.provider = 'facebook';
        user.isVerified = true;
      }
      
      // Update profile image if user doesn't have one or if Facebook has a better one
      if (!user.avatarImg || (picture?.data?.url && picture.data.url !== user.avatarImg)) {
        user.avatarImg = picture?.data?.url;
      }
      
      await user.save();
    }

    const token = jwt.sign(
      { id: user._id, name: user.fullName, role: 'user' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'none',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      message: isNewUser ? 'User registered and logged in via Facebook' : 'Login successful via Facebook',
      userId: user._id,
      userName: user.fullName,
      role: 'user',
      user: {
        _id: user._id,
        fullName: user.fullName,
        username: user.username,
        email: user.email,
        avatarImg: user.avatarImg,
        provider: user.provider,
        isVerified: user.isVerified
      }
    });
  } catch (error) {
    console.error('Facebook login error:', error);
    res.status(500).json({ message: 'Facebook login failed' });
  }
});

router.post('/verify', async (req, res) => {
  const { token } = req.body;

  try {
    const user = await User.findOne({ verificationCode: token, verificationCodeExpiry: { $gt: Date.now() } });
    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired verification code' });
    }

    user.isVerified = true;
    user.verificationCode = undefined;
    user.verificationCodeExpiry = undefined;
    await user.save();

    res.json({ message: 'Email verified successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Verification failed' });
  }
});

router.post('/signin', async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await User.findOne({ $or: [{ email: username }, { username: username }] });
    if (!user || !user.isVerified) {
      return res.status(400).json({ message: 'Invalid credentials or unverified email' });
    }

    if (user.provider === 'google') {
      return res.status(400).json({ message: 'Please use Google login for this account' });
    }

    if (user.provider === 'facebook') {
      return res.status(400).json({ message: 'Please use Facebook login for this account' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user._id, name: user.fullName, role: 'user' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'none',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      message: 'Login successful',
      userId: user._id,
      userName: user.fullName,
      role: 'user',
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/logout', (req, res) => {
  try {
    res.clearCookie('token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'none',
    });
    res.status(200).json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ message: 'Server error during logout' });
  }
});

router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Email not found' });
    }

    if (user.provider === 'google') {
      return res.status(400).json({ 
        message: 'Password reset is not available for Google accounts. Please use Google login instead.',
        isGoogleUser: true 
      });
    }

    if (user.provider === 'facebook') {
      return res.status(400).json({ 
        message: 'Password reset is not available for Facebook accounts. Please use Facebook login instead.',
        isFacebookUser: true 
      });
    }

    const resetToken = crypto.randomBytes(20).toString('hex');
    user.resetToken = resetToken;
    user.resetTokenExpiry = Date.now() + 3600000;
    await user.save();

    const resetLink = `${process.env.FRONTEND_URL}/createnewpassword?token=${resetToken}`;
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Reset Your Password - TalkHub',
      html: `
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:8px;box-shadow:0 2px 8px #eee;font-family:Segoe UI,Arial,sans-serif;">
    <div style="background:#2d6cdf;padding:24px 0 12px 0;border-radius:8px 8px 0 0;text-align:center;">
      <h2 style="color:#fff;margin:0;font-weight:600;">Reset Your Password</h2>
    </div>
    <div style="padding:24px 32px 32px 32px;">
      <p style="font-size:16px;color:#222;margin-bottom:16px;">
        Hi,<br/>
        We received a request to reset your password for your <b>TalkHub</b> account.
      </p>
      <div style="text-align:center;margin:24px 0;">
        <a href="${resetLink}" style="display:inline-block;padding:12px 28px;background:#2d6cdf;color:#fff;border-radius:6px;font-size:16px;text-decoration:none;font-weight:600;">
          Reset Password
        </a>
      </div>
      <p style="font-size:14px;color:#666;">
        Or copy and paste this link into your browser:<br/>
        <a href="${resetLink}" style="color:#2d6cdf;">${resetLink}</a>
      </p>
      <p style="font-size:13px;color:#aaa;margin-top:24px;">
        If you did not request a password reset, you can safely ignore this email.<br/>
        This link will expire in 1 hour.
      </p>
      <div style="margin-top:32px;text-align:center;">
        <span style="font-size:13px;color:#aaa;">&copy; ${new Date().getFullYear()} TalkHub. All rights reserved.</span>
      </div>
    </div>
  </div>
  `,
    });

    res.json({ message: 'Password reset link sent to your email' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;

  try {
    const user = await User.findOne({ resetToken: token, resetTokenExpiry: { $gt: Date.now() } });
    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired token' });
    }

    if (user.provider === 'google') {
      return res.status(400).json({ message: 'Password reset is not available for Google accounts' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    user.password = hashedPassword;
    user.resetToken = undefined;
    user.resetTokenExpiry = undefined;
    await user.save();

    res.json({ message: 'Password reset successful' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/upload-avatar', verifyToken, upload.single('avatar'), async (req, res) => {
  try {
    res.json({ url: req.file.path });
  } catch (error) {
    res.status(500).json({ message: 'Upload failed' });
  }
});

router.post('/upload-cover', verifyToken, upload.single('cover'), async (req, res) => {
  try {
    res.json({ url: req.file.path });
  } catch (error) {
    res.status(500).json({ message: 'Upload failed' });
  }
});

router.get('/profile/:id', async (req, res) => {
  try {
    // Validate the ID format
    if (!req.params.id || !/^[0-9a-fA-F]{24}$/.test(req.params.id)) {
      return res.status(400).json({ message: 'Invalid user ID format' });
    }

    const user = await User.findById(req.params.id).select('-password').lean();
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const relationships = await Relationship.find({
      $or: [{ from: req.params.id, status: 'accepted' }, { to: req.params.id, status: 'accepted' }],
    }).populate('from to', 'fullName username avatarImg');

    const friends = relationships
      .filter(rel => rel.from && rel.to && rel.from._id && rel.to._id) // Enhanced null check
      .map(rel => {
        try {
          return rel.from._id.toString() === req.params.id ? rel.to : rel.from;
        } catch (err) {
          console.error('Error processing relationship:', err, rel);
          return null;
        }
      })
      .filter(friend => friend !== null); // Remove any null friends

    user.friends = friends;
    user.friendCount = friends.length;

    res.json(user);
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Check username availability
router.get('/check-username/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const existingUser = await User.findOne({ username });
    res.json({ available: !existingUser });
  } catch (error) {
    console.error('Username check error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/profile/:id', async (req, res) => {
  const { fullName, username, bio, avatarImg, coverImg, age, address, country, study, dob } = req.body;
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (username && username !== user.username) {
      // Validate username format
      if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
        return res.status(400).json({ 
          message: 'Username must be 3-20 characters long and contain only letters, numbers, and underscores' 
        });
      }
      
      const existingUsername = await User.findOne({ username });
      if (existingUsername) {
        return res.status(400).json({ message: 'Username already exists' });
      }
      user.username = username;
    }

    if (fullName) user.fullName = fullName;
    if (bio) user.bio = bio;
    if (avatarImg) user.avatarImg = avatarImg;
    if (coverImg) user.coverImg = coverImg;
    if (age !== undefined) user.age = age;
    if (address) user.address = address;
    if (country) user.country = country;
    if (study) user.study = study;
    if (dob) user.dob = dob;

    await user.save();

    res.json({ message: 'Profile updated', user: user.toObject({ getters: true }) });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.patch('/change-password/:id', verifyToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.provider === 'google') {
      return res.status(400).json({ message: 'Password change is not available for Google accounts' });
    }

    if (user.provider === 'facebook') {
      return res.status(400).json({ message: 'Password change is not available for Facebook accounts' });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Current password is incorrect' });

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/check-token', (req, res) => {
  const token = req.cookies.token || (req.headers.authorization && req.headers.authorization.split(' ')[1]);
  if (!token) return res.status(401).json({ valid: false, message: 'No token' });

  try {
    jwt.verify(token, process.env.JWT_SECRET);
    res.json({ valid: true });
  } catch {
    res.status(401).json({ valid: false, message: 'Invalid token' });
  }
});

router.put('/test', (req, res) => {
  console.log('TEST ROUTE HIT', req.body);
  res.json({ ok: true });
});

module.exports = router;