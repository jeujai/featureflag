import express from "express";
import cors from "cors";
import path from "path";
import { existsSync } from "fs";
import { fileURLToPath } from "url";
import { initDb } from "./db.js";
import adminRouter from "./routes/admin.js";
import evaluationRouter from "./routes/evaluation.js";

// Initialize database
initDb();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// API routes
app.use("/api", adminRouter);
app.use("/api/eval", evaluationRouter);

// Serve static frontend in production
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, "../../dist/client");

if (existsSync(clientDist)) {
  app.use(express.static(clientDist));

  // SPA fallback — serve index.html for non-API routes
  app.get("*", (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

export default app;
