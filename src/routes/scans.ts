import { Router } from "express";
import type { Request, Response } from "express";
import type { ScanService } from "../services/scanService.js";

type ErrorResponse = {
  error: string;
};

export function createScanRouter(scanService: ScanService): Router {
  const router = Router();

  router.post("/", (req: Request, res: Response) => {
    const validation = validateRepoUrl(req.body?.repoUrl);

    if (!validation.valid) {
      res.status(400).json({ error: validation.error } satisfies ErrorResponse);
      return;
    }

    const scan = scanService.createScan(validation.repoUrl);
    res.status(202).json(scan);
  });

  router.get("/:id", (req: Request, res: Response) => {
    const scanId = getRouteParam(req.params.id);
    const scan = scanId ? scanService.getScan(scanId) : undefined;

    if (!scan) {
      res.status(404).json({ error: "Scan not found." } satisfies ErrorResponse);
      return;
    }

    res.json(scan);
  });

  router.get("/:id/results", (req: Request, res: Response) => {
    const scanId = getRouteParam(req.params.id);
    const scan = scanId ? scanService.getScan(scanId) : undefined;

    if (!scan) {
      res.status(404).json({ error: "Scan not found." } satisfies ErrorResponse);
      return;
    }

    if (scan.state !== "completed") {
      res.status(409).json({
        error: "Scan results are available only after the scan completes."
      } satisfies ErrorResponse);
      return;
    }

    res.json(scan.result);
  });

  return router;
}

function getRouteParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

type RepoUrlValidation =
  | {
      valid: true;
      repoUrl: string;
    }
  | {
      valid: false;
      error: string;
    };

export function validateRepoUrl(value: unknown): RepoUrlValidation {
  if (typeof value !== "string" || value.trim().length === 0) {
    return { valid: false, error: "repoUrl is required." };
  }

  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    return { valid: false, error: "repoUrl must be a valid URL." };
  }

  if (parsed.hostname.toLowerCase() !== "github.com") {
    return { valid: false, error: "repoUrl must use github.com." };
  }

  const pathParts = parsed.pathname.split("/").filter(Boolean);
  if (pathParts.length < 2) {
    return {
      valid: false,
      error: "repoUrl must include a GitHub owner and repository name."
    };
  }

  return { valid: true, repoUrl: parsed.toString() };
}
