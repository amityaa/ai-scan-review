import type { Scan, ScanResult } from "../models/scan.js";

export class ScanRepository {
  private readonly scans = new Map<string, Scan>();

  save(scan: Scan): void {
    this.scans.set(scan.id, scan);
  }

  findById(id: string): Scan | undefined {
    const scan = this.scans.get(id);
    return scan ? cloneScan(scan) : undefined;
  }

  findMutableById(id: string): Scan | undefined {
    return this.scans.get(id);
  }
}

function cloneScan(scan: Scan): Scan {
  return {
    ...scan,
    result: scan.result ? cloneResult(scan.result) : undefined
  };
}

function cloneResult(result: ScanResult): ScanResult {
  return {
    ...result,
    findings: result.findings.map((finding) => ({ ...finding }))
  };
}
