(function () {
  const POLL_INTERVAL_MS = 1500;
  const REQUEST_TIMEOUT_MS = 8000;

  const form = document.querySelector("#scan-form");
  const repoInput = document.querySelector("#repo-url");
  const startButton = document.querySelector("#start-button");
  const clearButton = document.querySelector("#clear-button");
  const exampleButtons = document.querySelectorAll("[data-example-url]");
  const formError = document.querySelector("#form-error");
  const scanPanel = document.querySelector("#scan-panel");
  const scanHeading = document.querySelector("#scan-heading");
  const scanState = document.querySelector("#scan-state");
  const progressWrap = document.querySelector("#progress-wrap");
  const currentStep = document.querySelector("#current-step");
  const progressPercent = document.querySelector("#progress-percent");
  const progressBar = document.querySelector("#progress-bar");
  const networkMessage = document.querySelector("#network-message");
  const scanError = document.querySelector("#scan-error");
  const resultsPanel = document.querySelector("#results-panel");
  const riskLevel = document.querySelector("#risk-level");
  const resultSummary = document.querySelector("#result-summary");
  const addressFirst = document.querySelector("#address-first");
  const emptyResults = document.querySelector("#empty-results");
  const findingsList = document.querySelector("#findings-list");

  let currentScanId = null;
  let pollTimer = null;
  let trackingGeneration = 0;
  let startRequestGeneration = 0;
  let activeStartController = null;
  let activePollController = null;
  let pollInFlightGeneration = null;
  let startInFlight = false;

  for (const button of exampleButtons) {
    button.addEventListener("click", () => {
      repoInput.value = button.dataset.exampleUrl;
      hide(formError);
      repoInput.focus();
    });
  }

  clearButton.addEventListener("click", () => {
    clearScan();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (startInFlight) {
      return;
    }

    hide(formError);

    const repoUrl = repoInput.value.trim();
    if (!repoUrl) {
      showMessage(formError, "Enter a GitHub repository URL.");
      return;
    }

    startInFlight = true;
    startButton.disabled = true;
    startButton.textContent = "Starting...";
    const startGeneration = beginStartRequest();

    try {
      const { response, body } = await requestJsonWithTimeout(
        "/api/scans",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ repoUrl })
        },
        activeStartController
      );

      if (!isCurrentStartRequest(startGeneration)) {
        return;
      }

      if (!response.ok) {
        showMessage(formError, getErrorMessage(body, "Unable to start the scan."));
        return;
      }

      if (!isScanResponse(body)) {
        throw invalidResponseError();
      }

      const generation = beginTracking(body.id);
      hide(networkMessage);
      hide(scanError);
      hide(resultsPanel);
      updateScanIdInUrl(currentScanId);
      renderScan(body, generation);
      startPolling(currentScanId, generation);
    } catch (error) {
      if (!isCurrentStartRequest(startGeneration)) {
        return;
      }

      if (isTimeoutError(error)) {
        showMessage(
          formError,
          "Starting the scan timed out. Try again; no new scan is being tracked on this page."
        );
        return;
      }

      if (isAbortError(error)) {
        return;
      }

      if (isInvalidResponseError(error)) {
        showMessage(
          formError,
          "The scan service returned an invalid response. No new scan is being tracked."
        );
        return;
      }

      showMessage(
        formError,
        "Could not reach the scan service. Check the server and try again."
      );
    } finally {
      if (isCurrentStartRequest(startGeneration)) {
        finishStartRequest();
      }
    }
  });

  const scanIdFromUrl = new URLSearchParams(window.location.search).get("scanId");
  if (scanIdFromUrl) {
    const generation = beginTracking(scanIdFromUrl);
    show(scanPanel);
    scanHeading.textContent = "Resuming scan";
    currentStep.textContent = "Loading scan status from the server.";
    startPolling(scanIdFromUrl, generation);
    pollOnce(scanIdFromUrl, generation);
  }

  function beginTracking(scanId) {
    stopCurrentTracking();
    trackingGeneration += 1;
    currentScanId = scanId;
    return trackingGeneration;
  }

  function beginStartRequest() {
    startRequestGeneration += 1;
    activeStartController = new AbortController();
    return startRequestGeneration;
  }

  function finishStartRequest() {
    startInFlight = false;
    activeStartController = null;
    startButton.disabled = false;
    startButton.textContent = "Start scan";
  }

  function clearScan() {
    invalidateStartRequest();
    stopCurrentTracking();
    trackingGeneration += 1;
    currentScanId = null;
    hide(formError);
    hide(scanPanel);
    hide(progressWrap);
    hide(networkMessage);
    hide(scanError);
    hide(resultsPanel);
    hide(emptyResults);
    show(findingsList);
    findingsList.replaceChildren();
    scanHeading.textContent = "Scan status";
    scanState.textContent = "Queued";
    scanState.className = "state-badge";
    currentStep.textContent = "Waiting for scan updates.";
    progressBar.value = 0;
    progressPercent.textContent = "0%";
    resultSummary.textContent = "";
    addressFirst.textContent = "";
    riskLevel.textContent = "None";
    riskLevel.className = "risk-badge";
    removeScanIdFromUrl();
  }

  function invalidateStartRequest() {
    startRequestGeneration += 1;

    if (activeStartController) {
      activeStartController.abort();
      activeStartController = null;
    }

    startInFlight = false;
    startButton.disabled = false;
    startButton.textContent = "Start scan";
  }

  function startPolling(scanId, generation) {
    if (!isCurrentTracking(generation)) {
      return;
    }

    stopPolling(generation);
    pollTimer = window.setInterval(() => {
      pollOnce(scanId, generation);
    }, POLL_INTERVAL_MS);
  }

  function stopPolling(generation) {
    if (!isCurrentTracking(generation)) {
      return;
    }

    if (pollTimer) {
      window.clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function stopCurrentTracking() {
    if (pollTimer) {
      window.clearInterval(pollTimer);
      pollTimer = null;
    }

    if (activePollController) {
      activePollController.abort();
      activePollController = null;
    }

    pollInFlightGeneration = null;
  }

  async function pollOnce(scanId, generation) {
    if (
      !isCurrentTracking(generation) ||
      pollInFlightGeneration === generation
    ) {
      return;
    }

    const controller = new AbortController();
    activePollController = controller;
    pollInFlightGeneration = generation;

    try {
      const { response, body } = await requestJsonWithTimeout(
        `/api/scans/${encodeURIComponent(scanId)}`,
        {},
        controller
      );

      if (!isCurrentTracking(generation)) {
        return;
      }

      if (response.status === 404) {
        stopPolling(generation);
        renderUnavailableScan(generation);
        clearScanIdInUrl(generation);
        return;
      }

      if (!response.ok) {
        showMessage(
          networkMessage,
          "Temporary issue refreshing scan status. The scan has not been marked as failed."
        );
        return;
      }

      if (!isScanResponse(body)) {
        throw invalidResponseError();
      }

      hide(networkMessage);
      renderScan(body, generation);

      if (body.state === "completed" || body.state === "failed") {
        stopPolling(generation);
      }
    } catch (error) {
      if (!isCurrentTracking(generation)) {
        return;
      }

      if (isTimeoutError(error)) {
        showMessage(
          networkMessage,
          "Refreshing scan status timed out. The scan is still running; polling will retry."
        );
        return;
      }

      if (isAbortError(error)) {
        return;
      }

      if (isInvalidResponseError(error)) {
        showMessage(
          networkMessage,
          "The scan service returned an invalid response. The scan has not been marked as failed."
        );
        return;
      }

      showMessage(
        networkMessage,
        "Temporary network issue refreshing scan status. The scan has not been marked as failed."
      );
    } finally {
      if (pollInFlightGeneration === generation) {
        pollInFlightGeneration = null;
      }

      if (activePollController === controller) {
        activePollController = null;
      }
    }
  }

  function renderScan(scan, generation) {
    if (!isCurrentTracking(generation)) {
      return;
    }

    show(scanPanel);
    show(progressWrap);
    scanHeading.textContent = `Scan for ${scan.repoUrl}`;
    scanState.textContent = formatState(scan.state);
    scanState.className = `state-badge state-${scan.state}`;
    currentStep.textContent = scan.currentStep || "Waiting for scan updates.";
    progressBar.value = scan.progress || 0;
    progressPercent.textContent = `${scan.progress || 0}%`;

    hide(scanError);

    if (scan.state === "failed") {
      hide(resultsPanel);
      showMessage(
        scanError,
        scan.error || "The backend reported that the simulated scan failed."
      );
      return;
    }

    if (scan.state === "completed" && scan.result) {
      renderResults(scan.result, generation);
    }
  }

  function renderUnavailableScan(generation) {
    if (!isCurrentTracking(generation)) {
      return;
    }

    show(scanPanel);
    hide(progressWrap);
    hide(resultsPanel);
    hide(networkMessage);
    scanHeading.textContent = "Scan unavailable";
    scanState.textContent = "Unavailable";
    scanState.className = "state-badge state-failed";
    currentStep.textContent = "";
    progressBar.value = 0;
    progressPercent.textContent = "";
    showMessage(
      scanError,
      "Scan not found. It may have expired or the backend may have restarted. Start a new scan to continue."
    );
  }

  function renderResults(result, generation) {
    if (!isCurrentTracking(generation)) {
      return;
    }

    show(resultsPanel);
    riskLevel.textContent = result.riskLevel;
    riskLevel.className = `risk-badge risk-${result.riskLevel}`;
    resultSummary.textContent = result.summary;
    addressFirst.textContent = result.addressFirst;

    findingsList.replaceChildren();

    if (!result.findings || result.findings.length === 0) {
      show(emptyResults);
      hide(findingsList);
      return;
    }

    hide(emptyResults);
    show(findingsList);

    for (const finding of result.findings) {
      const item = document.createElement("li");
      item.className = "finding";

      const header = document.createElement("div");
      header.className = "finding-header";

      const title = document.createElement("h3");
      title.textContent = finding.title;

      const severity = document.createElement("span");
      severity.className = `severity severity-${finding.severity}`;
      severity.textContent = finding.severity;

      header.append(title, severity);

      const meta = document.createElement("p");
      meta.className = "finding-meta";
      meta.textContent = `${finding.category} | ${finding.location}`;

      const evidence = detailBlock("Evidence", finding.evidence);
      const impact = detailBlock("Why it matters", finding.whyItMatters);
      const action = detailBlock("Next action", finding.nextAction);

      item.append(header, meta, evidence, impact, action);
      findingsList.append(item);
    }
  }

  function detailBlock(label, value) {
    const wrapper = document.createElement("div");
    wrapper.className = "finding-detail";

    const strong = document.createElement("strong");
    strong.textContent = label;

    const text = document.createElement("p");
    text.textContent = value;

    wrapper.append(strong, text);
    return wrapper;
  }

  function updateScanIdInUrl(scanId) {
    const url = new URL(window.location.href);
    url.searchParams.set("scanId", scanId);
    window.history.replaceState({}, "", url);
  }

  function clearScanIdInUrl(generation) {
    if (!isCurrentTracking(generation)) {
      return;
    }

    currentScanId = null;
    removeScanIdFromUrl();
  }

  function removeScanIdFromUrl() {
    const url = new URL(window.location.href);
    url.searchParams.delete("scanId");
    window.history.replaceState({}, "", url.pathname + url.search);
  }

  function isCurrentTracking(generation) {
    return generation === trackingGeneration;
  }

  function isCurrentStartRequest(generation) {
    return generation === startRequestGeneration;
  }

  function isAbortError(error) {
    return error instanceof Error && error.name === "AbortError";
  }

  function isTimeoutError(error) {
    return error instanceof Error && error.name === "TimeoutError";
  }

  function isInvalidResponseError(error) {
    return error instanceof Error && error.name === "InvalidResponseError";
  }

  async function requestJsonWithTimeout(
    url,
    options,
    controller = new AbortController()
  ) {
    let timedOut = false;
    const timeoutId = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      const body = await readJsonBody(response);
      return { response, body };
    } catch (error) {
      if (timedOut && isAbortError(error)) {
        const timeoutError = new Error("Request timed out");
        timeoutError.name = "TimeoutError";
        throw timeoutError;
      }

      throw error;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  async function readJsonBody(response) {
    try {
      return await response.json();
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }

      if (response.ok) {
        throw invalidResponseError();
      }

      return {};
    }
  }

  function invalidResponseError() {
    const error = new Error("Invalid response");
    error.name = "InvalidResponseError";
    return error;
  }

  function isScanResponse(body) {
    return (
      body &&
      typeof body.id === "string" &&
      typeof body.repoUrl === "string" &&
      typeof body.state === "string" &&
      typeof body.progress === "number"
    );
  }

  function getErrorMessage(body, fallback) {
    return body && typeof body.error === "string" ? body.error : fallback;
  }

  function formatState(state) {
    return String(state || "unknown").replaceAll("_", " ");
  }

  function show(element) {
    element.hidden = false;
  }

  function hide(element) {
    element.hidden = true;
  }

  function showMessage(element, message) {
    element.textContent = message;
    show(element);
  }
})();
