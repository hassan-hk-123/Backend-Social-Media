require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const cookieParser = require("cookie-parser");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

// ✅ Step 1: CORS Setup
app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
}));

// ✅ Step 2: Cookies & JSON Parse karein
app.use(express.json());
app.use(cookieParser());

// ✅ Step 3: Basic Route
app.get("/", (req, res) => {
  res.send("Server is running");
});

// ✅ Step 4: Routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/posts", require("./routes/posts"));
app.use("/api/relationships", require("./routes/relationships"));
app.use("/api/messages", require("./routes/messages"));
app.use("/api/notifications", require("./routes/notifications"));

// ✅ Step 5: Error Handling Middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: "Error in Server" });
});

// ✅ Step 6: Socket.IO Setup
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// ✅ Step 7: Socket Logic
const onlineUsers = new Map();
const Message = require('./models/Message');

io.on("connection", (socket) => {
  console.log(`New connection: ${socket.id}`);
  socket.on("error", (err) => {
    console.error("Socket Error:", err.message);
  });

  socket.on("register", (userId) => {
    if (!onlineUsers.has(userId) || onlineUsers.get(userId) !== socket.id) {
      onlineUsers.set(userId, socket.id);
      socket.join(userId); // User ko unke apne room mein join karein
      io.emit("user_connected", userId);
      socket.emit("online_users", Array.from(onlineUsers.keys()));
    }
  });

  socket.on("send_message", async (data) => {
    try {
      const message = new Message({
        from: data.from,
        to: data.to,
        content: data.content,
        status: "sent"
      });
      await message.save();
      await message.populate("from to", "username avatarImg");

      const recipientSocket = onlineUsers.get(data.to);
      if (recipientSocket) {
        // Receiver ko message bhejein
        io.to(recipientSocket).emit("receive_message", message);
      }

      // Sender ko message sent confirmation bhejein
      socket.emit("message_sent", {
        success: true,
        message,
        messageId: message._id,
        userId: data.from
      });
    } catch (err) {
      socket.emit("message_sent", { success: false, error: err.message });
    }
  });

  // `read_message` event handler ko update kiya gaya
  socket.on("read_message", async ({ messageId, readerId, senderId }) => {
    try {
      // Message ko database mein 'read' mark karein
      const message = await Message.findOneAndUpdate(
        { _id: messageId, to: readerId, from: senderId, status: { $ne: "read" } },
        { $set: { status: "read" } },
        { new: true }
      ).populate("from to", "username avatarImg fullName");

      if (message) {
        // Original message sender ko 'message_read' event emit karein
        const senderSocket = onlineUsers.get(senderId);
        if (senderSocket && senderSocket !== socket.id) { // Self-loop se bachein
          io.to(senderSocket).emit("message_read", {
            messageId: message._id,
            readerId: readerId, // Message padhne wale ka ID
            senderId: senderId, // Message bhejne wale ka ID
            chatPartnerId: readerId // Sender ke liye chat partner ka ID
          });
        }

        // Message padhne wale (receiver) ko bhi 'message_read' event emit karein
        // Yeh ensure karta hai ki receiver ke UI par bhi status update ho (bhale hi woh ise pehle hi padh chuke hon)
        socket.emit("message_read", {
          messageId: message._id,
          readerId: readerId, // Message padhne wale ka ID
          senderId: senderId, // Message bhejne wale ka ID
          chatPartnerId: senderId // Receiver ke liye chat partner ka ID
        });
      }
    } catch (err) {
      console.error("Message ko read ke roop mein mark karne mein error:", err);
    }
  });

  socket.on("typing", (data) => {
    const recipientSocket = onlineUsers.get(data.to);
    if (recipientSocket) {
      io.to(recipientSocket).emit("user_typing", {
        userId: data.from,
        typing: true,
      });
    }
  });

  socket.on("heartbeat", (data) => {
    console.log(`Heartbeat from ${data.userId}`);
  });

  socket.on("disconnect", () => {
    let disconnectedUser;
    for (const [userId, sockId] of onlineUsers.entries()) {
      if (sockId === socket.id) {
        disconnectedUser = userId;
        onlineUsers.delete(userId);
        break;
      }
    }
    if (disconnectedUser) {
      io.emit("user_disconnected", disconnectedUser);
    }
  });
});

app.set("io", io);
app.set("onlineUsers", onlineUsers);

// ✅ Step 8: MongoDB + Server Start karein
mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("✅ MongoDB connected");
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
      console.log(`✅ Server + Socket.IO running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.log("❌ MongoDB connection error:", err);
  });
