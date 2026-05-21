import express from "express";
import cors from "cors";
import path from "path";
import dotenv from "dotenv";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import mongoose from "mongoose";
import connectDB from "./server/config/db.js";
import authRoutes from "./server/routes/authRoutes.js";
import ticketRoutes from "./server/routes/ticketRoutes.js";

dotenv.config();

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  
  // Connect to Database before starting the server
  try {
    await connectDB();
  } catch (err) {
    console.error("Failed to start because MongoDB is unavailable:", err.message);
    process.exit(1);
  }

  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST", "PATCH", "DELETE"]
    }
  });

  // Share io instance with express app
  app.set('io', io);

  const PORT = process.env.PORT || 3000;

  // Middleware
  app.use(cors());
  app.use(express.json());

  // Socket.io connection logging
  io.on("connection", (socket) => {
    console.log(">>> Client connected via Socket.io");
    socket.on("disconnect", () => console.log(">>> Client disconnected"));
  });

  // --- API ROUTES ---
  app.use("/api/auth", authRoutes);
  app.use("/api/tickets", ticketRoutes);

  // Health check
  app.get("/api/health", (req, res) => {
    const dbStatus = mongoose.connection.readyState === 1 ? "connected" : 
                     mongoose.connection.readyState === 2 ? "connecting" : 
                     "disconnected";
    res.json({ 
      status: "ok", 
      database: dbStatus,
      message: "Support Hub API is live!",
      timestamp: new Date().toISOString()
    });
  });

  // Return JSON for unknown API routes
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'API route not found' });
    }
    next();
  });

  // Global error handler
  app.use((err, req, res, next) => {
    console.error("Express error:", err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  });

  // --- FRONTEND SERVING (For development/preview) ---
  if (process.env.NODE_ENV !== "production") {
    try {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } catch (e) {
      console.warn("Vite middleware failed to load.", e.message);
    }
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`>>> Server running at http://localhost:${PORT}`);
  });
}

startServer();
