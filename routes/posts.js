const express = require('express');
const router = express.Router();
const Post = require('../models/Post');
const auth = require('../middleware/authMiddleware');
const multer = require('../config/multer');
const cloudinary = require('../config/cloudinary');

// GET all posts
router.get('/', async (req, res) => {
  try {
    const posts = await Post.find()
      .populate('user', 'username avatarImg')
      .populate('comments.user', 'username avatarImg') // populate comment user info
      .sort({ createdAt: -1 });
    res.json(posts);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET single post
router.get('/:id', async (req, res) => {
  try {
    const post = await Post.findById(req.params.id).populate('user', 'username avatarImg');
    if (!post) return res.status(404).json({ error: 'Post not found' });
    res.json(post);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET all posts by a specific user
router.get('/user/:userId', async (req, res) => {
  try {
    const posts = await Post.find({ user: req.params.userId })
    .populate('user', 'username avatarImg')
    .populate('comments.user', 'username avatarImg') 
      .sort({ createdAt: -1 });
    res.json(posts);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// CREATE post
router.post('/', auth, multer.single('image'), async (req, res) => {
  try {
    let imageUrl = '';
    if (req.file) {
      const filePath = req.file.path.replace(/\\/g, '/');
      const result = await cloudinary.uploader.upload(filePath, { folder: 'posts' });
      imageUrl = result.secure_url;
    } else {
      return res.status(400).json({ error: 'Image is required' });
    }
    const post = new Post({
      image: imageUrl,
      caption: req.body.caption,
      user: req.user._id
    });
    await post.save();
    res.status(201).json(post);
  } catch (err) {
    console.error('Cloudinary/Post Upload Error:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// DELETE post (only owner)
router.delete('/:id', auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    if (post.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    await post.deleteOne();
    return res.json({ message: 'Post deleted', postId: req.params.id });
  } catch (err) {
    console.error('Delete post error:', err);
    return res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// EDIT/UPDATE post (only owner)
router.put('/:id', auth, multer.single('image'), async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    if (post.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    const { caption } = req.body;
    if (caption !== undefined) post.caption = caption;
    if (req.file) {
      // Upload new image to Cloudinary
      const filePath = req.file.path ? req.file.path.replace(/\\/g, '/') : req.file.path;
      const result = await cloudinary.uploader.upload(req.file.path, { folder: 'posts' });
      post.image = result.secure_url;
    }
    await post.save();
    await post.populate('user', 'username avatarImg');
    res.json(post);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Like/unlike a post
// Like/unlike a post
router.post('/:id/like', auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    const userId = req.user._id.toString();
    const likeIndex = post.likes.findIndex(like => like.user.toString() === userId);
    let notification;
    if (likeIndex === -1) {
      // Not liked yet, add like
      post.likes.push({ user: userId });
      if (post.user.toString() !== userId) { // Don't notify if user likes their own post
        const Notification = require('../models/Notification');
        notification = new Notification({
          from: userId,
          to: post.user,
          postId: post._id,
          type: 'post_like',
          message: `${req.user.username} liked your post`
        });
        await notification.save();
        const io = req.app.get('io');
        io.to(post.user.toString()).emit('notification', {
          ...notification.toObject(),
          from: { _id: userId, username: req.user.username, avatarImg: req.user.avatarImg },
          postId: post._id
        });
      }
    } else {
      // Already liked, remove like
      post.likes.splice(likeIndex, 1);
    }
    await post.save();
    await post.populate('user', 'username avatarImg');
    await post.populate('likes.user', 'username avatarImg');
    await post.populate('comments.user', 'username avatarImg');
    res.json(post);
  } catch (err) {
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// Add a comment to a post
// Add a comment to a post
router.post('/:id/comment', auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const { comment } = req.body;
    if (!comment || !comment.trim())
      return res.status(400).json({ error: 'Comment is required' });

    post.comments.push({ user: req.user._id, comment });
    await post.save();

    // Send notification if commenter is not the post owner
    if (post.user.toString() !== req.user._id.toString()) {
      const Notification = require('../models/Notification');
      const notification = new Notification({
        from: req.user._id,
        to: post.user,
        postId: post._id,
        type: 'post_comment',
        message: `${req.user.username} commented on your post: ${comment}`
      });
      await notification.save();

      const io = req.app.get('io');
      io.to(post.user.toString()).emit('notification', {
        ...notification.toObject(),
        from: {
          _id: req.user._id,
          username: req.user.username,
          avatarImg: req.user.avatarImg
        },
        postId: post._id
      });
    }

    await post.populate('user', 'username avatarImg');
    await post.populate('comments.user', 'username avatarImg');

    res.json(post);
  } catch (err) {
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

module.exports = router; 