import express from "express";
import { createServer as createViteServer } from "vite";
import { exec } from "child_process";
import path from "path";
import fs from "fs";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Python backtest endpoint
  app.post("/api/backtest-python", (req, res) => {
    const { data } = req.body;
    
    // WARNING: In production, ensure the input is sanitized or use a sandboxed environment.
    const scriptPath = path.join(process.cwd(), "backtest_engine.py");

    // Run python script
    exec(`python3 ${scriptPath} '${JSON.stringify(data)}'`, (error, stdout, stderr) => {
      if (error) {
        console.error(`exec error: ${error}`);
        res.status(500).json({ error: stderr });
        return;
      }
      try {
        res.json({ result: JSON.parse(stdout) });
      } catch (parseError) {
        res.status(500).json({ error: "Failed to parse Python output" });
      }
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
