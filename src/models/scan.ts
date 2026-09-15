export type ScanState =
  | "queued"
  | "cloning"
  | "analyzing_dependencies"
  | "analyzing_code"
  | "prioritizing_findings"
  | "completed"
  | "failed";

export type FindingSeverity = "critical" | "high" | "medium" | "low";

export type FindingCategory =
  | "dependency"
  | "code"
  | "secret"
  | "configuration";

export type Finding = {
  severity: FindingSeverity;
  title: string;
  category: FindingCategory;
  location: string;
  evidence: string;
  whyItMatters: string;
  nextAction: string;
};

export type ScanResult = {
  riskLevel: "none" | "low" | "medium" | "high" | "critical";
  summary: string;
  addressFirst: string;
  findings: Finding[];
  mockDisclosure: string;
};

export type ScanScenario = "findings" | "clean" | "failure";

export type Scan = {
  id: string;
  repoUrl: string;
  scenario: ScanScenario;
  state: ScanState;
  progress: number;
  currentStep: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  error?: string;
  result?: ScanResult;
};
