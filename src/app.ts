import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createScanRouter } from "./routes/scans.js";
import { ScanService } from "./services/scanService.js";

type CreateAppOptions = {
  scanService?: ScanService;
};

export function createApp(options: CreateAppOptions = {}) {
  const app = express();
  const scanService = options.scanService ?? new ScanService();
  const publicDir = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "public"
  );

  app.use(express.json());
  app.use(express.static(publicDir));

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api/scans", createScanRouter(scanService));

  app.get("/", (_req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });

  return app;
}
