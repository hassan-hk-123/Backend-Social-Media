require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const cookieParser = require("cookie-parser");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

// ✅ Step 1: Setup CORS
app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
}));

// ✅ Step 2: Parse cookies & JSON
app.use(express.json());
app.use(cookieParser());

// ✅ Step 3: Basic route
app.get("/", (req, res) => {
  res.send("Server is running");
});

// ✅ Step 4: Routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/posts", require("./routes/posts"));
app.use("/api/relationships", require("./routes/relationships"));
app.use("/api/messages", require("./routes/messages"));
app.use("/api/notifications", require("./routes/notifications"));

// ✅ Step 5: Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: "Error in Server" });
});

// ✅ Step 6: Socket.IO setup
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  },
  pingTimeout: 60000, // 60 seconds
  pingInterval: 25000, // 25 seconds
});

// ✅ Step 7: Socket logic
const onlineUsers = new Map();
const Message = require('./models/Message');

io.on("connection", (socket) => {
  console.log(`New connection: ${socket.id}`);
  socket.on("error", (err) => {
    console.error("Socket Error:", err.message);
  });

  socket.on("register", (userId) => {
    onlineUsers.set(userId, socket.id);
    socket.join(userId);
    io.emit("user_connected", userId);
    socket.emit("online_users", Array.from(onlineUsers.keys()));
  });

  socket.on("send_message", async (data) => {
    try {
      const message = new Message({
        from: data.from,
        to: data.to,
        content: data.content
      });
      await message.save();
      await message.populate("from to", "username avatarImg");

      const recipientSocket = onlineUsers.get(data.to);
      if (recipientSocket) {
        io.to(recipientSocket).emit("receive_message", message);
      } else {
        console.log(`Recipient ${data.to} offline, message saved`);
      }

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

// ✅ Step 8: MongoDB + Server start
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