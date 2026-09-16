import { randomUUID } from "node:crypto";
import { activeProgression, type ProgressStep } from "../mocks/progress.js";
import { buildResultForScenario } from "../mocks/results.js";
import { selectScenario } from "../mocks/scenarios.js";
import type { Scan } from "../models/scan.js";
import { ScanRepository } from "../repositories/scanRepository.js";

type ScanServiceOptions = {
  stepDelayMs?: number;
  repository?: ScanRepository;
};

export class ScanService {
  private readonly repository: ScanRepository;
  private readonly stepDelayMs: number;

  constructor(options: ScanServiceOptions = {}) {
    this.stepDelayMs = options.stepDelayMs ?? 800;
    this.repository = options.repository ?? new ScanRepository();
  }

  createScan(repoUrl: string): Scan {
    const now = new Date().toISOString();
    const scan: Scan = {
      id: randomUUID(),
      repoUrl,
      scenario: selectScenario(repoUrl),
      state: "queued",
      progress: 0,
      currentStep: "Simulated progress: scan queued.",
      createdAt: now,
      updatedAt: now
    };

    this.repository.save(scan);
    this.advanceScan(scan.id, 0);

    return this.repository.findById(scan.id) as Scan;
  }

  getScan(id: string): Scan | undefined {
    return this.repository.findById(id);
  }

  private advanceScan(id: string, stepIndex: number): void {
    const delay = stepIndex === 0 ? this.stepDelayMs : this.stepDelayMs;

    setTimeout(() => {
      const scan = this.repository.findMutableById(id);
      if (!scan || scan.state === "completed" || scan.state === "failed") {
        return;
      }

      const step = activeProgression[stepIndex];
      if (step) {
        this.applyProgressStep(scan, step);
        this.advanceScan(id, stepIndex + 1);
        return;
      }

      this.finishScan(scan);
    }, delay);
  }

  private applyProgressStep(scan: Scan, step: ProgressStep): void {
    scan.state = step.state;
    scan.progress = step.progress;
    scan.currentStep = step.currentStep;
    scan.updatedAt = new Date().toISOString();
  }

  private finishScan(scan: Scan): void {
    const now = new Date().toISOString();

    if (scan.scenario === "failure") {
      scan.state = "failed";
      scan.progress = 100;
      scan.currentStep = "Simulated progress: scan failed during repository preparation.";
      scan.error =
        "Simulated failure scenario selected because the repository name is \"fail-demo\".";
      scan.updatedAt = now;
      scan.completedAt = now;
      return;
    }

    scan.state = "completed";
    scan.progress = 100;
    scan.currentStep = "Simulated progress: scan completed.";
    scan.result = buildResultForScenario(scan.scenario);
    scan.updatedAt = now;
    scan.completedAt = now;
  }
}

export { selectScenario } from "../mocks/scenarios.js";
