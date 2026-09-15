import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { Server } from "node:http";
import { createApp } from "../src/app.js";
import type { Scan, ScanResult } from "../src/models/scan.js";
import { ScanService } from "../src/services/scanService.js";

const service = new ScanService({ stepDelayMs: 5 });
const app = createApp({ scanService: service });

let server: Server;
let baseUrl: string;

before(async () => {
  server = app.listen(0);
  await new Promise<void>((resolve) => {
    server.once("listening", resolve);
  });

  const address = server.address();
  assert(address && typeof address === "object");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

describe("scan API", () => {
  it("returns 400 for invalid repo URLs", async () => {
    const response = await postScan("https://example.com/acme/repo");
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.deepEqual(body, { error: "repoUrl must use github.com." });
  });

  it("returns 202 when starting a valid scan", async () => {
    const response = await postScan("https://github.com/acme/api-service");
    const body = (await response.json()) as Scan;

    assert.equal(response.status, 202);
    assert.equal(body.repoUrl, "https://github.com/acme/api-service");
    assert.equal(body.state, "queued");
    assert.equal(body.progress, 0);
  });

  it("returns 404 for an unknown scan ID", async () => {
    const response = await fetch(`${baseUrl}/api/scans/missing-scan`);
    const body = await response.json();

    assert.equal(response.status, 404);
    assert.deepEqual(body, { error: "Scan not found." });
  });

  it("completes the findings scenario with prioritized findings", async () => {
    const scan = await createScan("https://github.com/acme/api-service");
    const completed = await waitForTerminalScan(scan.id);

    assert.equal(completed.state, "completed");
    assert.equal(completed.result?.riskLevel, "critical");
    assert.equal(completed.result?.findings.length, 4);
    assert.deepEqual(
      completed.result?.findings.map((finding) => finding.severity),
      ["critical", "high", "medium", "low"]
    );
    assert.match(completed.result?.addressFirst ?? "", /Revoke/i);
  });

  it("completes the clean scenario with no findings", async () => {
    const scan = await createScan("https://github.com/acme/clean-demo");
    const completed = await waitForTerminalScan(scan.id);

    assert.equal(completed.state, "completed");
    assert.equal(completed.result?.riskLevel, "none");
    assert.deepEqual(completed.result?.findings, []);
  });

  it("reaches failed for the failure scenario", async () => {
    const scan = await createScan("https://github.com/acme/fail-demo");
    const failed = await waitForTerminalScan(scan.id);

    assert.equal(failed.state, "failed");
    assert.equal(failed.progress, 100);
    assert.match(failed.error ?? "", /contains "fail"/);
  });

  it("keeps multiple scans independent", async () => {
    const findingsScan = await createScan("https://github.com/acme/service-one");
    const cleanScan = await createScan("https://github.com/acme/clean-service");

    const [findings, clean] = await Promise.all([
      waitForTerminalScan(findingsScan.id),
      waitForTerminalScan(cleanScan.id)
    ]);

    assert.notEqual(findings.id, clean.id);
    assert.equal(findings.state, "completed");
    assert.equal(clean.state, "completed");
    assert.equal(findings.result?.riskLevel, "critical");
    assert.equal(clean.result?.riskLevel, "none");
  });

  it("returns 409 when requesting results before completion", async () => {
    const scan = await createScan("https://github.com/acme/slow-enough");
    const response = await fetch(`${baseUrl}/api/scans/${scan.id}/results`);
    const body = await response.json();

    assert.equal(response.status, 409);
    assert.deepEqual(body, {
      error: "Scan results are available only after the scan completes."
    });
  });

  it("returns completed results from the results endpoint", async () => {
    const scan = await createScan("https://github.com/acme/api-results");
    await waitForTerminalScan(scan.id);

    const response = await fetch(`${baseUrl}/api/scans/${scan.id}/results`);
    const result = (await response.json()) as ScanResult;

    assert.equal(response.status, 200);
    assert.equal(result.riskLevel, "critical");
    assert.ok(result.mockDisclosure.includes("Simulated scan"));
  });
});

async function postScan(repoUrl: unknown): Promise<Response> {
  return fetch(`${baseUrl}/api/scans`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ repoUrl })
  });
}

async function createScan(repoUrl: string): Promise<Scan> {
  const response = await postScan(repoUrl);
  assert.equal(response.status, 202);
  return (await response.json()) as Scan;
}

async function waitForTerminalScan(id: string): Promise<Scan> {
  const deadline = Date.now() + 1000;

  while (Date.now() < deadline) {
    const response = await fetch(`${baseUrl}/api/scans/${id}`);
    assert.equal(response.status, 200);

    const scan = (await response.json()) as Scan;
    if (scan.state === "completed" || scan.state === "failed") {
      return scan;
    }

    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error(`Timed out waiting for scan ${id}`);
}
