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

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

router.use(cors({
  origin: process.env.FRONTEND_URL,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true,
}));

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

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user._id, name: user.name, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({
      message: 'Login successful',
      userId: user._id,
      userName: user.name,
      role: user.role
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
      sameSite: 'strict',
      path: '/',
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
    const user = await User.findById(req.params.id).select('-password').lean();
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const relationships = await Relationship.find({
      $or: [{ from: req.params.id, status: 'accepted' }, { to: req.params.id, status: 'accepted' }],
    }).populate('from to', 'fullName username avatarImg');

    const friends = relationships.map(rel => {
      return rel.from._id.toString() === req.params.id ? rel.to : rel.from;
    });

    user.friends = friends;
    user.friendCount = friends.length;

    res.json(user);
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/profile/:id', async (req, res) => {
  console.log('PATCH /profile/:id hit');
  console.log('Body:', req.body);
  const { fullName, username, bio, avatarImg, coverImg, age, address, country, study, dob } = req.body;
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (fullName) user.fullName = fullName;
    if (username) user.username = username;
    if (bio) user.bio = bio;
    if (avatarImg) user.avatarImg = avatarImg;
    if (coverImg) user.coverImg = coverImg;
    if (age !== undefined) user.age = age;
    if (address) user.address = address;
    if (country) user.country = country;
    if (study) user.study = study;
    if (dob) user.dob = dob;

    console.log('User before save:', user);
    await user.save();
    console.log('User after save:', user);

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
  const token = req.cookies.token || req.headers.authorization?.split(' ')[1];
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