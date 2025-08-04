const express = require("express");
const router = express.Router();
const Notification = require("../models/Notification");
const User = require("../models/User");
const auth = require("../middleware/authMiddleware");

// Fetch all notifications for the user
router.get("/", auth, async (req, res) => {
  try {
    const notifications = await Notification.find({ to: req.user._id })
      .sort({ createdAt: -1 })
      .populate("from", "username avatarImg fullName");
    
    // Filter out notifications where 'from' user doesn't exist (deleted users)
    const validNotifications = notifications.filter(notification => notification.from);
    
    res.json(validNotifications);
  } catch (err) {
    console.error("Error fetching notifications:", err);
    res.status(500).json({ success: false, error: "Server error", details: err.message });
  }
});

// Cleanup orphaned notifications (remove notifications where 'from' user no longer exists)
router.delete("/cleanup", auth, async (req, res) => {
  try {
    // Find all notifications
    const notifications = await Notification.find({});
    let deletedCount = 0;
    
    for (const notification of notifications) {
      // Check if the 'from' user still exists
      const fromUser = await User.findById(notification.from);
      if (!fromUser) {
        // User no longer exists, delete the notification
        await Notification.findByIdAndDelete(notification._id);
        deletedCount++;
      }
    }
    
    console.log(`Cleaned up ${deletedCount} orphaned notifications`);
    res.json({ success: true, deletedCount });
  } catch (err) {
    console.error("Error cleaning up notifications:", err);
    res.status(500).json({ success: false, error: "Server error", details: err.message });
  }
});

// Mark specific notifications as read
router.put("/read", auth, async (req, res) => {
  try {
    const { notificationIds } = req.body; // Accept array of notification IDs
    const result = await Notification.updateMany(
      {
        _id: { $in: notificationIds },
        to: req.user._id,
        read: false,
      },
      { $set: { read: true } }
    );

    console.log('Notifications marked as read:', { notificationIds, modifiedCount: result.modifiedCount });

    res.json({ success: true, modifiedCount: result.modifiedCount });
  } catch (err) {
    console.error("Error marking notifications as read:", err);
    res.status(500).json({ success: false, error: "Server error", details: err.message });
  }
});

// Mark all notifications as read
router.put("/read-all", auth, async (req, res) => {
  try {
    const result = await Notification.updateMany(
      {
        to: req.user._id,
        read: false,
      },
      { $set: { read: true } }
    );

    console.log('All notifications marked as read:', { userId: req.user._id, modifiedCount: result.modifiedCount });

    res.json({ success: true, modifiedCount: result.modifiedCount });
  } catch (err) {
    console.error("Error marking all notifications as read:", err);
    res.status(500).json({ success: false, error: "Server error", details: err.message });
  }
});

module.exports = router;