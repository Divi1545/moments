import express, { Request, Response, NextFunction } from "express";
import session from "express-session";
import { storage } from "./storage";
import { pool } from "./db";
import pgSession from "connect-pg-simple";
import multer from "multer";
import path from "path";
import fs from "fs";

const PgSession = pgSession(session);

export function setupAuth(app: express.Application) {
  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET || "moments-app-secret-key-change-in-production",
    resave: false,
    saveUninitialized: false,
    store: new PgSession({
      pool: pool,
      tableName: "sessions",
      createTableIfMissing: true,
    }),
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
}

declare module "express-session" {
  interface SessionData {
    userId?: string;
  }
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
if (!fs.existsSync(path.join(uploadsDir, "avatars"))) {
  fs.mkdirSync(path.join(uploadsDir, "avatars"), { recursive: true });
}
if (!fs.existsSync(path.join(uploadsDir, "moment-photos"))) {
  fs.mkdirSync(path.join(uploadsDir, "moment-photos"), { recursive: true });
}

const multerStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const type = (req as any).uploadType || "moment-photos";
    cb(null, path.join(uploadsDir, type));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage: multerStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type"));
    }
  },
});

export function registerRoutes(app: express.Application) {
  app.use("/uploads", express.static(uploadsDir));

  app.post("/api/auth/register", async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: "Email and password required" });
      }
      
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ error: "Email already registered" });
      }
      
      const user = await storage.createUser(email, password);
      req.session.userId = user.id;
      
      res.json({ user: { id: user.id, email: user.email }, needsProfile: true });
    } catch (error: any) {
      console.error("Registration error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: "Email and password required" });
      }
      
      const user = await storage.validatePassword(email, password);
      if (!user) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      
      req.session.userId = user.id;
      
      const profile = await storage.getProfile(user.id);
      res.json({ user: { id: user.id, email: user.email }, needsProfile: !profile });
    } catch (error: any) {
      console.error("Login error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: "Logout failed" });
      }
      res.json({ success: true });
    });
  });

  app.get("/api/auth/user", async (req, res) => {
    if (!req.session.userId) {
      return res.json({ user: null });
    }
    
    try {
      const user = await storage.getUserById(req.session.userId);
      const profile = await storage.getProfile(req.session.userId);
      res.json({ 
        user: user ? { id: user.id, email: user.email } : null,
        profile,
        needsProfile: !profile,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/profiles", requireAuth, async (req, res) => {
    try {
      const profile = await storage.createProfile({
        id: req.session.userId,
        ...req.body,
      });
      res.json(profile);
    } catch (error: any) {
      console.error("Create profile error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/profiles/:id", requireAuth, async (req, res) => {
    try {
      const profile = await storage.getProfile(req.params.id);
      if (!profile) {
        return res.status(404).json({ error: "Profile not found" });
      }
      res.json(profile);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/moments", requireAuth, async (req, res) => {
    try {
      const moment = await storage.createMoment({
        creatorId: req.session.userId,
        ...req.body,
      });
      res.json(moment);
    } catch (error: any) {
      console.error("Create moment error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/moments/nearby", requireAuth, async (req, res) => {
    try {
      const lat = parseFloat(req.query.lat as string);
      const lng = parseFloat(req.query.lng as string);
      const radius = parseInt(req.query.radius as string) || 5000;
      const limit = parseInt(req.query.limit as string) || 50;
      
      if (isNaN(lat) || isNaN(lng)) {
        return res.status(400).json({ error: "Invalid coordinates" });
      }
      
      const moments = await storage.getNearbyMoments(lat, lng, radius, limit);
      res.json(moments);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/moments/search", requireAuth, async (req, res) => {
    try {
      const query = req.query.q as string || "";
      const lat = parseFloat(req.query.lat as string);
      const lng = parseFloat(req.query.lng as string);
      const radius = parseInt(req.query.radius as string) || 10000;
      const limit = parseInt(req.query.limit as string) || 20;
      
      if (isNaN(lat) || isNaN(lng)) {
        return res.status(400).json({ error: "Invalid coordinates" });
      }
      
      const moments = await storage.searchMoments(query, lat, lng, radius, limit);
      res.json(moments);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/moments/:id", requireAuth, async (req, res) => {
    try {
      const moment = await storage.getMoment(req.params.id);
      if (!moment) {
        return res.status(404).json({ error: "Moment not found" });
      }
      res.json(moment);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/moments/:id/context", requireAuth, async (req, res) => {
    try {
      const context = await storage.getMomentContext(req.params.id);
      res.json(context);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/moments/:id/join", requireAuth, async (req, res) => {
    try {
      const result = await storage.joinMoment(req.params.id, req.session.userId!);
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }
      res.json(result.data);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/moments/:id/leave", requireAuth, async (req, res) => {
    try {
      await storage.leaveMoment(req.params.id, req.session.userId!);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/moments/:id/participants", requireAuth, async (req, res) => {
    try {
      const participants = await storage.getParticipants(req.params.id);
      res.json(participants);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/moments/:id/participation", requireAuth, async (req, res) => {
    try {
      const isParticipant = await storage.isParticipant(req.params.id, req.session.userId!);
      res.json({ isParticipant });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/moments/:id/messages", requireAuth, async (req, res) => {
    try {
      const isParticipant = await storage.isParticipant(req.params.id, req.session.userId!);
      if (!isParticipant) {
        return res.status(403).json({ error: "Must be participant to view messages" });
      }
      
      const limit = parseInt(req.query.limit as string) || 100;
      const messages = await storage.getMessages(req.params.id, limit);
      res.json(messages);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/moments/:id/messages", requireAuth, async (req, res) => {
    try {
      const isParticipant = await storage.isParticipant(req.params.id, req.session.userId!);
      if (!isParticipant) {
        return res.status(403).json({ error: "Must be participant to send messages" });
      }
      
      const message = await storage.sendMessage(req.params.id, req.session.userId!, req.body.content);
      res.json(message);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/moments/:id/photos", requireAuth, async (req, res) => {
    try {
      const isPreview = req.query.preview === "true";
      const photos = await storage.getMomentPhotos(req.params.id, isPreview);
      res.json(photos);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/moments/:id/photos", requireAuth, (req, res, next) => {
    (req as any).uploadType = "moment-photos";
    next();
  }, upload.single("photo"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }
      
      const photoUrl = `/uploads/moment-photos/${req.file.filename}`;
      const isPreview = req.body.isPreview === "true";
      
      const photo = await storage.addMomentPhoto(
        req.params.id,
        req.session.userId!,
        photoUrl,
        isPreview
      );
      
      res.json(photo);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/upload/avatar", requireAuth, (req, res, next) => {
    (req as any).uploadType = "avatars";
    next();
  }, upload.single("photo"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }
      
      const photoUrl = `/uploads/avatars/${req.file.filename}`;
      res.json({ url: photoUrl });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/sos-alerts", requireAuth, async (req, res) => {
    try {
      const alerts = await storage.getActiveSosAlerts();
      res.json(alerts);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/sos-alerts", requireAuth, async (req, res) => {
    try {
      const { momentId, lat, lng } = req.body;
      const alert = await storage.createSosAlert(
        req.session.userId!,
        momentId,
        lat || null,
        lng || null
      );
      res.json(alert);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/flags", requireAuth, async (req, res) => {
    try {
      const { targetType, targetId, reason } = req.body;
      const flag = await storage.createFlag(
        req.session.userId!,
        targetType,
        targetId,
        reason
      );
      res.json(flag);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
}
