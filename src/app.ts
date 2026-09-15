import express from "express";
import { createScanRouter } from "./routes/scans.js";
import { ScanService } from "./services/scanService.js";

type CreateAppOptions = {
  scanService?: ScanService;
};

export function createApp(options: CreateAppOptions = {}) {
  const app = express();
  const scanService = options.scanService ?? new ScanService();

  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api/scans", createScanRouter(scanService));

  return app;
}
