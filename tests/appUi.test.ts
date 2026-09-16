import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import vm from "node:vm";

type JsonBody = Record<string, unknown>;

type MockResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<JsonBody>;
};

type FetchCall = {
  url: string;
  init?: {
    method?: string;
    signal?: AbortSignal;
  };
  resolve: (value: MockResponse) => void;
  reject: (reason?: unknown) => void;
};

class TestElement {
  public hidden = false;
  public textContent = "";
  public className = "";
  public value = "";
  public disabled = false;
  public dataset: Record<string, string> = {};
  public children: TestElement[] = [];
  private readonly listeners = new Map<string, Array<(event: unknown) => void>>();

  constructor(public readonly tagName = "div") {}

  addEventListener(type: string, listener: (event: unknown) => void): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatch(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener({ preventDefault: () => undefined });
    }
  }

  append(...children: TestElement[]): void {
    this.children.push(...children);
  }

  replaceChildren(...children: TestElement[]): void {
    this.children = children;
  }

  focus(): void {
    // The UI only calls focus for convenience; tests do not need focus state.
  }
}

describe("static UI scan tracking", () => {
  it("ignores stale old-scan 200 responses after a newer scan starts", async () => {
    const harness = createUiHarness();
    const oldPoll = await startScanAndOpenPoll(harness, "scan-a", "https://github.com/acme/old");
    await startScan(harness, "scan-b", "https://github.com/acme/new");

    oldPoll.resolve(jsonResponse(200, completedScan("scan-a", "https://github.com/acme/old")));
    await flushPromises();

    assert.equal(harness.text("scan-heading"), "Scan for https://github.com/acme/new");
    assert.equal(harness.el("results-panel").hidden, true);
    assert.match(harness.href(), /scanId=scan-b/);
    assert.equal(harness.intervalCount(), 1);
  });

  it("ignores stale old-scan 404 responses without clearing the newer scan URL", async () => {
    const harness = createUiHarness();
    const oldPoll = await startScanAndOpenPoll(harness, "scan-a", "https://github.com/acme/old");
    await startScan(harness, "scan-b", "https://github.com/acme/new");

    oldPoll.resolve(jsonResponse(404, { error: "Scan not found." }));
    await flushPromises();

    assert.equal(harness.text("scan-heading"), "Scan for https://github.com/acme/new");
    assert.equal(harness.el("scan-error").hidden, true);
    assert.match(harness.href(), /scanId=scan-b/);
    assert.equal(harness.intervalCount(), 1);
  });

  it("ignores stale old-scan 500 responses without showing an error or stopping polling", async () => {
    const harness = createUiHarness();
    const oldPoll = await startScanAndOpenPoll(harness, "scan-a", "https://github.com/acme/old");
    await startScan(harness, "scan-b", "https://github.com/acme/new");

    oldPoll.resolve(jsonResponse(500, { error: "Server error." }));
    await flushPromises();

    assert.equal(harness.text("scan-heading"), "Scan for https://github.com/acme/new");
    assert.equal(harness.el("network-message").hidden, true);
    assert.match(harness.href(), /scanId=scan-b/);
    assert.equal(harness.intervalCount(), 1);
  });

  it("keeps previous completed results visible when a new submission is rejected", async () => {
    const harness = createUiHarness();
    const poll = await startScanAndOpenPoll(harness, "scan-a", "https://github.com/acme/old");

    poll.resolve(jsonResponse(200, completedScan("scan-a", "https://github.com/acme/old")));
    await flushPromises();

    assert.equal(harness.el("results-panel").hidden, false);
    assert.equal(harness.text("result-summary"), "Scan A summary");

    harness.submit("https://example.com/acme/repo");
    harness.nextPost().resolve(jsonResponse(400, { error: "repoUrl must use github.com." }));
    await flushPromises();

    assert.equal(harness.text("form-error"), "repoUrl must use github.com.");
    assert.equal(harness.el("form-error").hidden, false);
    assert.equal(harness.text("scan-heading"), "Scan for https://github.com/acme/old");
    assert.equal(harness.el("results-panel").hidden, false);
    assert.equal(harness.text("result-summary"), "Scan A summary");
  });

  it("does not let stale aborted request cleanup release the newer polling guard", async () => {
    const harness = createUiHarness();
    const oldPoll = await startScanAndOpenPoll(harness, "scan-a", "https://github.com/acme/old");
    await startScan(harness, "scan-b", "https://github.com/acme/new");

    harness.tickIntervals();
    const newPollsBeforeOldReject = harness.getRequests("/api/scans/scan-b");
    assert.equal(newPollsBeforeOldReject.length, 1);

    oldPoll.reject(abortError());
    await flushPromises();

    harness.tickIntervals();
    const newPollsAfterOldReject = harness.getRequests("/api/scans/scan-b");
    assert.equal(newPollsAfterOldReject.length, 1);
    assert.equal(harness.text("scan-heading"), "Scan for https://github.com/acme/new");
    assert.equal(harness.intervalCount(), 1);
  });

  it("times out stalled polling requests and retries without marking the scan failed", async () => {
    const harness = createUiHarness();
    await startScanAndOpenPoll(harness, "scan-a", "https://github.com/acme/stalled");

    harness.tickIntervals();
    assert.equal(harness.getRequests("/api/scans/scan-a").length, 1);

    harness.tickTimeouts();
    await flushPromises();

    assert.equal(harness.el("network-message").hidden, false);
    assert.match(harness.text("network-message"), /timed out/i);
    assert.equal(harness.el("scan-error").hidden, true);

    harness.tickIntervals();
    assert.equal(harness.getRequests("/api/scans/scan-a").length, 2);
  });

  it("times out stalled scan creation and releases the Start button", async () => {
    const harness = createUiHarness();

    harness.submit("https://github.com/acme/stalled-create");
    assert.equal(harness.el("start-button").disabled, true);
    assert.equal(harness.getRequests("/api/scans").length, 1);

    harness.tickTimeouts();
    await flushPromises();

    assert.equal(harness.el("start-button").disabled, false);
    assert.equal(harness.text("start-button"), "Start scan");
    assert.equal(harness.el("form-error").hidden, false);
    assert.match(harness.text("form-error"), /timed out/i);
  });

  it("renders an explicit unavailable state for the current scan 404", async () => {
    const harness = createUiHarness("http://localhost/?scanId=missing-scan");
    const poll = harness.nextRequest("/api/scans/missing-scan");

    poll.resolve(jsonResponse(404, { error: "Scan not found." }));
    await flushPromises();

    assert.equal(harness.text("scan-heading"), "Scan unavailable");
    assert.equal(harness.text("scan-state"), "Unavailable");
    assert.equal(harness.el("progress-wrap").hidden, true);
    assert.equal(harness.el("results-panel").hidden, true);
    assert.equal(harness.el("network-message").hidden, true);
    assert.equal(harness.el("scan-error").hidden, false);
    assert.match(harness.text("scan-error"), /backend may have restarted/i);
    assert.doesNotMatch(harness.href(), /scanId=/);
    assert.equal(harness.intervalCount(), 0);
  });
});

async function startScan(
  harness: UiHarness,
  id: string,
  repoUrl: string
): Promise<void> {
  harness.submit(repoUrl);
  harness.nextPost().resolve(jsonResponse(202, queuedScan(id, repoUrl)));
  await flushPromises();
}

async function startScanAndOpenPoll(
  harness: UiHarness,
  id: string,
  repoUrl: string
): Promise<FetchCall> {
  await startScan(harness, id, repoUrl);
  harness.tickIntervals();
  return harness.nextRequest(`/api/scans/${id}`);
}

function queuedScan(id: string, repoUrl: string): JsonBody {
  return {
    id,
    repoUrl,
    state: "queued",
    progress: 0,
    currentStep: "Simulated progress: scan queued."
  };
}

function completedScan(id: string, repoUrl: string): JsonBody {
  return {
    id,
    repoUrl,
    state: "completed",
    progress: 100,
    currentStep: "Simulated progress: scan completed.",
    result: {
      riskLevel: "critical",
      summary: "Scan A summary",
      addressFirst: "Fix the critical issue first.",
      findings: [
        {
          severity: "critical",
          title: "Old scan finding",
          category: "secret",
          location: "src/old.ts:1",
          evidence: "Old evidence",
          whyItMatters: "Old impact",
          nextAction: "Old action"
        }
      ]
    }
  };
}

function jsonResponse(status: number, body: JsonBody): MockResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  };
}

function abortError(): Error {
  const error = new Error("aborted");
  error.name = "AbortError";
  return error;
}

type UiHarness = ReturnType<typeof createUiHarness>;

function createUiHarness(initialHref = "http://localhost/") {
  const elements = createElements();
  const calls: FetchCall[] = [];
  const intervals = new Map<number, () => void>();
  const timeouts = new Map<number, () => void>();
  let nextIntervalId = 1;
  let nextTimeoutId = 1;
  let href = initialHref;

  const location = {
    get href() {
      return href;
    },
    set href(value: string) {
      href = value;
    },
    get search() {
      return new URL(href).search;
    },
    get pathname() {
      return new URL(href).pathname;
    }
  };

  const window = {
    location,
    history: {
      replaceState: (_state: unknown, _title: string, nextUrl: URL | string) => {
        const urlText = String(nextUrl);
        href = urlText.startsWith("/")
          ? `${new URL(href).origin}${urlText}`
          : urlText;
      }
    },
    setInterval: (callback: () => void) => {
      const id = nextIntervalId;
      nextIntervalId += 1;
      intervals.set(id, callback);
      return id;
    },
    clearInterval: (id: number) => {
      intervals.delete(id);
    },
    setTimeout: (callback: () => void) => {
      const id = nextTimeoutId;
      nextTimeoutId += 1;
      timeouts.set(id, callback);
      return id;
    },
    clearTimeout: (id: number) => {
      timeouts.delete(id);
    }
  };

  const document = {
    querySelector: (selector: string) => elements.get(selector.replace("#", "")),
    querySelectorAll: (selector: string) =>
      selector === "[data-example-url]" ? [] : [],
    createElement: (tagName: string) => new TestElement(tagName)
  };

  const fetch = (url: string, init?: FetchCall["init"]) =>
    new Promise<MockResponse>((resolve, reject) => {
      let abortListener: (() => void) | undefined;

      const cleanup = () => {
        if (abortListener) {
          init?.signal?.removeEventListener("abort", abortListener);
        }
      };

      const call: FetchCall = {
        url,
        init,
        resolve: (value) => {
          cleanup();
          resolve(value);
        },
        reject: (reason) => {
          cleanup();
          reject(reason);
        }
      };

      abortListener = () => {
        call.reject(abortError());
      };
      init?.signal?.addEventListener("abort", abortListener, { once: true });

      calls.push(call);
    });

  vm.runInNewContext(readFileSync("src/public/app.js", "utf8"), {
    AbortController,
    document,
    Error,
    fetch,
    URL,
    URLSearchParams,
    window
  });

  return {
    el: (id: string) => requiredElement(elements, id),
    text: (id: string) => requiredElement(elements, id).textContent,
    href: () => href,
    submit: (repoUrl: string) => {
      requiredElement(elements, "repo-url").value = repoUrl;
      requiredElement(elements, "scan-form").dispatch("submit");
    },
    tickIntervals: () => {
      for (const callback of Array.from(intervals.values())) {
        callback();
      }
    },
    tickTimeouts: () => {
      for (const [id, callback] of Array.from(timeouts.entries())) {
        timeouts.delete(id);
        callback();
      }
    },
    intervalCount: () => intervals.size,
    nextPost: () => {
      const call = calls.find(
        (candidate) => candidate.url === "/api/scans" && !isSettled(candidate)
      );
      assert.ok(call, "Expected pending POST /api/scans call");
      markSettledOnCompletion(call);
      return call;
    },
    nextRequest: (url: string) => {
      const call = calls.find(
        (candidate) => candidate.url === url && !isSettled(candidate)
      );
      assert.ok(call, `Expected pending ${url} call`);
      markSettledOnCompletion(call);
      return call;
    },
    getRequests: (url: string) => calls.filter((call) => call.url === url)
  };
}

function createElements(): Map<string, TestElement> {
  const ids = [
    "scan-form",
    "repo-url",
    "start-button",
    "form-error",
    "scan-panel",
    "scan-heading",
    "scan-state",
    "progress-wrap",
    "current-step",
    "progress-percent",
    "progress-bar",
    "network-message",
    "scan-error",
    "results-panel",
    "risk-level",
    "result-summary",
    "address-first",
    "empty-results",
    "findings-list"
  ];
  const elements = new Map(ids.map((id) => [id, new TestElement()]));

  for (const id of [
    "form-error",
    "scan-panel",
    "network-message",
    "scan-error",
    "results-panel",
    "empty-results"
  ]) {
    requiredElement(elements, id).hidden = true;
  }

  return elements;
}

function requiredElement(
  elements: Map<string, TestElement>,
  id: string
): TestElement {
  const element = elements.get(id);
  assert.ok(element, `Missing test element ${id}`);
  return element;
}

const settledCalls = new WeakSet<FetchCall>();

function isSettled(call: FetchCall): boolean {
  return settledCalls.has(call);
}

function markSettledOnCompletion(call: FetchCall): void {
  const originalResolve = call.resolve;
  const originalReject = call.reject;

  call.resolve = (value) => {
    settledCalls.add(call);
    originalResolve(value);
  };
  call.reject = (reason) => {
    settledCalls.add(call);
    originalReject(reason);
  };
}

async function flushPromises(): Promise<void> {
  for (let index = 0; index < 20; index += 1) {
    await Promise.resolve();
  }
}
