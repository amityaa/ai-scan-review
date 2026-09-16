import type { ScanScenario } from "../models/scan.js";

export function selectScenario(repoUrl: string): ScanScenario {
  const repoName = getRepositoryName(repoUrl);

  if (repoName === "fail-demo") {
    return "failure";
  }

  if (repoName === "clean-demo") {
    return "clean";
  }

  return "findings";
}

function getRepositoryName(repoUrl: string): string {
  try {
    const parsed = new URL(repoUrl);
    const pathParts = parsed.pathname.split("/").filter(Boolean);
    return pathParts[1]?.toLowerCase() ?? "";
  } catch {
    return "";
  }
}
