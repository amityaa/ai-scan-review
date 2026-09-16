import type { ScanState } from "../models/scan.js";

export type ProgressStep = {
  state: ScanState;
  progress: number;
  currentStep: string;
};

export const activeProgression: ProgressStep[] = [
  {
    state: "cloning",
    progress: 20,
    currentStep: "Simulated progress: connecting to repository metadata."
  },
  {
    state: "analyzing_dependencies",
    progress: 45,
    currentStep: "Simulated progress: analyzing dependency manifests."
  },
  {
    state: "analyzing_code",
    progress: 70,
    currentStep: "Simulated progress: reviewing risky code patterns."
  },
  {
    state: "prioritizing_findings",
    progress: 90,
    currentStep: "Simulated progress: prioritizing findings by likely impact."
  }
];
