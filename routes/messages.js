const express = require("express")
const router = express.Router()
const Message = require("../models/Message")
const auth = require("../middleware/authMiddleware")

// Fetch unread message counts
router.get("/unread", auth, async (req, res) => {
  try {
    const messages = await Message.aggregate([
      {
        $match: {
          to: req.user._id,
          status: { $ne: "read" },
        },
      },
      {
        $group: {
          _id: "$from",
          count: { $sum: 1 },
        },
      },
    ])

    const unreadCounts = messages.reduce((acc, curr) => {
      acc[curr._id.toString()] = curr.count
      return acc
    }, {})

    res.json({ success: true, unreadCounts })
  } catch (err) {
    console.error("Error fetching unread counts:", err)
    res.status(500).json({ success: false, error: "Server error", details: err.message })
  }
})

// Send a message
router.post("/send", auth, async (req, res) => {
  try {
    const { to, content, type, mediaUrl, tempId } = req.body

    const message = new Message({
      from: req.user._id,
      to,
      content,
      type: type || "text",
      mediaUrl: mediaUrl || "",
      status: "sent",
    })

    await message.save()
    await message.populate("from to", "username avatarImg fullName")

    if (tempId) message._doc.tempId = tempId

    const io = req.app.get("io")
    const onlineUsers = req.app.get("onlineUsers")

    if (io) {
      const toSocketId = onlineUsers.get(to.toString())
      const fromSocketId = onlineUsers.get(req.user._id.toString())

      if (toSocketId) {
        io.to(toSocketId).emit("receive_message", message)
      }
      if (fromSocketId) {
        io.to(fromSocketId).emit("receive_message", message)
      }
    }

    res.json({ success: true, message })
  } catch (err) {
    console.error("Error sending message:", err)
    res.status(500).json({ success: false, error: "Server error", details: err.message })
  }
})

// Fetch all messages between two users
router.get("/:userId", auth, async (req, res) => {
  try {
    const messages = await Message.find({
      $or: [
        { from: req.user._id, to: req.params.userId },
        { from: req.params.userId, to: req.user._id },
      ],
    })
      .sort({ createdAt: 1 })
      .populate("from to", "username avatarImg fullName")

    res.json({ success: true, messages })
  } catch (err) {
    console.error("Error fetching messages:", err)
    res.status(500).json({ success: false, error: "Server error", details: err.message })
  }
})

// Mark all messages from a user as read
router.put("/read/:userId", auth, async (req, res) => {
  try {
    const result = await Message.updateMany(
      {
        from: req.params.userId,
        to: req.user._id,
        status: { $ne: "read" },
      },
      { $set: { status: "read" } },
    )

    // Emit read status to sender
    const io = req.app.get("io")
    const onlineUsers = req.app.get("onlineUsers")
    const fromSocketId = onlineUsers.get(req.params.userId.toString())

    if (io && fromSocketId && result.modifiedCount > 0) {
      // Get the updated messages to emit specific message IDs
      const updatedMessages = await Message.find({
        from: req.params.userId,
        to: req.user._id,
        status: "read",
      })
        .sort({ createdAt: -1 })
        .limit(result.modifiedCount)

      updatedMessages.forEach((msg) => {
        io.to(fromSocketId).emit("message_read", {
          messageId: msg._id,
          userId: req.user._id,
        })
      })
    }

    res.json({ success: true, modifiedCount: result.modifiedCount })
  } catch (err) {
    console.error("Error marking messages as read:", err)
    res.status(500).json({ success: false, error: "Server error", details: err.message })
  }
})

// Edit a message
router.put("/:messageId", auth, async (req, res) => {
  try {
    const { content } = req.body
    const message = await Message.findOneAndUpdate(
      { _id: req.params.messageId, from: req.user._id },
      { $set: { content } },
      { new: true },
    ).populate("from to", "username avatarImg fullName")

    if (!message) {
      return res.status(404).json({ success: false, error: "Message not found" })
    }

    res.json({ success: true, message })
  } catch (err) {
    console.error("Error editing message:", err)
    res.status(500).json({ success: false, error: "Server error", details: err.message })
  }
})

// Clear messages
router.delete("/clear/:userId", auth, async (req, res) => {
  try {
    await Message.deleteMany({
      $or: [
        { from: req.user._id, to: req.params.userId },
        { from: req.params.userId, to: req.user._id },
      ],
    })

    res.status(200).json({ success: true, message: "Messages cleared" })
  } catch (err) {
    console.error("Error clearing messages:", err)
    res.status(500).json({ success: false, message: "Failed to clear messages" })
  }
})

module.exports = router
