const express = require('express');
const router = express.Router();
const Relationship = require('../models/Relationship');
const User = require('../models/User');
const auth = require('../middleware/authMiddleware');

// Send friend request
router.post('/request', auth, async (req, res) => {
  const { to } = req.body;
  const from = req.user._id;
  if (from.toString() === to) return res.status(400).json({ error: "Cannot send request to yourself" });
  const exists = await Relationship.findOne({ from, to });
  if (exists) return res.status(400).json({ error: "Request already sent" });
  const rel = new Relationship({ from, to });
  await rel.save();
  await rel.populate('from', 'username avatarImg fullName');

  try {
    const io = req.app.get('io');
    const onlineUsers = req.app.get('onlineUsers');
    const toSocketId = onlineUsers.get(to);
    if (toSocketId) {
      io.to(toSocketId).emit('notification', {
        type: 'friend_request',
        request: rel,
        from: rel.from,
        message: `${rel.from.fullName} sent you a friend request!`
      });
    }
  } catch (err) {
    console.error('Socket notification error:', err);
  }

  res.json(rel);
});

// Get incoming requests for user
router.get('/requests', auth, async (req, res) => {
  const requests = await Relationship.find({ to: req.user._id, status: 'pending' }).populate('from', 'username avatarImg fullName');
  res.json(requests);
});

// Get sent/outgoing requests for user
router.get('/requests/sent', auth, async (req, res) => {
  const requests = await Relationship.find({ from: req.user._id, status: 'pending' }).populate('to', 'username avatarImg fullName');
  res.json(requests);
});

// Cancel a sent friend request
router.post('/cancel', auth, async (req, res) => {
  const { requestId } = req.body;
  try {
    const rel = await Relationship.findOneAndDelete({
      _id: requestId,
      from: req.user._id,
      status: 'pending'
    });
    if (!rel) return res.status(404).json({ error: 'Request not found' });
    res.json({ message: 'Request canceled' });
  } catch (error) {
    console.error('Cancel request error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Accept/Reject request
router.post('/respond', auth, async (req, res) => {
  const { requestId, action } = req.body;
  try {
    const rel = await Relationship.findById(requestId);
    if (!rel || rel.to.toString() !== req.user._id.toString()) {
      return res.status(404).json({ error: "Request not found" });
    }

    const io = req.app.get('io');
    const onlineUsers = req.app.get('onlineUsers');

    if (action === 'accept') {
      rel.status = 'accepted';
      await rel.save();

      const userTo = await User.findById(rel.to);
      const userFrom = await User.findById(rel.from);

      if (userTo && userFrom) {
        if (!Array.isArray(userTo.following)) userTo.following = [];
        if (!Array.isArray(userTo.followers)) userTo.followers = [];
        if (!Array.isArray(userFrom.following)) userFrom.following = [];
        if (!Array.isArray(userFrom.followers)) userFrom.followers = [];
        userTo.following.push(userFrom._id);
        userFrom.followers.push(userTo._id);
        userTo.followers.push(userFrom._id);
        userFrom.following.push(userTo._id);
        await userTo.save();
        await userFrom.save();
      }

      const fromSocketId = onlineUsers.get(rel.from.toString());
      if (fromSocketId && userTo) {
        await userTo.populate('avatarImg fullName username');
        io.to(fromSocketId).emit('notification', {
          type: 'request_accepted',
          from: userTo,
          message: `${userTo.fullName} accepted your friend request!`
        });
      }
    } else if (action === 'reject') {
      rel.status = 'rejected';
      await rel.save();
      const fromSocketId = onlineUsers.get(rel.from.toString());
      if (fromSocketId) {
        const userTo = await User.findById(rel.to);
        if (userTo) {
          await userTo.populate('avatarImg fullName username');
          io.to(fromSocketId).emit('notification', {
            type: 'request_rejected',
            from: userTo,
            message: `${userTo.fullName} rejected your friend request.`
          });
        }
      }
      return res.json({ message: 'Request rejected and status updated' });
    }

    return res.json(rel);
  } catch (error) {
    console.error('Respond error:', error);
    return res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Get friends (accepted relationships)
router.get('/friends', auth, async (req, res) => {
  const userId = req.user._id;
  const rels = await Relationship.find({
    $or: [
      { from: userId, status: 'accepted' },
      { to: userId, status: 'accepted' }
    ]
  }).populate('from to', 'username avatarImg');
  const friends = rels.map(r => {
    const friend = r.from._id.toString() === userId.toString() ? r.to : r.from;
    return friend;
  });
  res.json(friends);
});

// Unfriend a user
router.post('/unfriend', auth, async (req, res) => {
  const { friendId } = req.body;
  const userId = req.user._id;

  try {
    const result = await Relationship.findOneAndDelete({
      $or: [
        { from: userId, to: friendId, status: 'accepted' },
        { from: friendId, to: userId, status: 'accepted' }
      ]
    });

    if (!result) {
      return res.status(404).json({ message: "Friendship not found" });
    }

    await User.findByIdAndUpdate(userId, { $pull: { following: friendId, followers: friendId } });
    await User.findByIdAndUpdate(friendId, { $pull: { followers: userId, following: userId } });

    const io = req.app.get('io');
    const onlineUsers = req.app.get('onlineUsers');
    const userSocketId = onlineUsers.get(userId.toString());
    const friendSocketId = onlineUsers.get(friendId.toString());
    if (userSocketId) {
      io.to(userSocketId).emit('notification', {
        type: 'unfriend',
        from: friendId,
        message: 'You are no longer friends.'
      });
    }
    if (friendSocketId) {
      io.to(friendSocketId).emit('notification', {
        type: 'unfriend',
        from: userId,
        message: 'You are no longer friends.'
      });
    }

    res.json({ message: "Unfriended successfully" });
  } catch (error) {
    console.error("Unfriend error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Get all users (for friend list)
router.get('/all-users', auth, async (req, res) => {
  const users = await User.find({}, 'username avatarImg fullName');
  res.json(users);
});

// Get connections (friends) for a specific user
router.get('/:userId/connections', auth, async (req, res) => {
  const { userId } = req.params;

  try {
    const relationships = await Relationship.find({
      $or: [{ from: userId, status: 'accepted' }, { to: userId, status: 'accepted' }]
    }).populate('from to', 'fullName username avatarImg');

    if (!relationships) {
      return res.json([]);
    }

    const connections = relationships.map(rel => {
      return rel.from._id.toString() === userId ? rel.to : rel.from;
    });

    res.json(connections);
  } catch (error) {
    console.error("Error fetching connections:", error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;