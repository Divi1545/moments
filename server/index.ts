import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { setupAuth, registerRoutes } from "./routes";

const app = express();

app.use(cors({
  origin: true,
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  next();
});

setupAuth(app);
registerRoutes(app);

app.use((req, res, next) => {
  if (req.path.endsWith('.html') || req.path === '/') {
    const filePath = req.path === '/' 
      ? path.join(process.cwd(), "public", "index.html")
      : path.join(process.cwd(), "public", req.path);
    
    if (fs.existsSync(filePath)) {
      let html = fs.readFileSync(filePath, 'utf8');
      
      const envScript = `
        <script>
          window.ENV = {
            MAPBOX_TOKEN: '${process.env.MAPBOX_TOKEN || ''}'
          };
        </script>
      `;
      
      html = html.replace('</head>', envScript + '</head>');
      return res.send(html);
    }
  }
  next();
});

app.use(express.static(path.join(process.cwd(), "public")));

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api") || req.path.startsWith("/uploads")) {
    return next();
  }
  
  const filePath = path.join(process.cwd(), "public", "index.html");
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    next();
  }
});

const PORT = parseInt(process.env.PORT || "5000", 10);

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Local: http://localhost:${PORT}`);
});
