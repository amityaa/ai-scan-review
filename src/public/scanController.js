import { createApi, getErrorMessage, invalidResponseError, isAbortError, isInvalidResponseError, isScanResponse, isTimeoutError } from "./api.js";
import { POLL_INTERVAL_MS } from "./config.js";
import { getElements, hide, show, showMessage } from "./dom.js";
import { createRenderer } from "./render.js";

export function initScanApp({ document, window, fetch, AbortController }) {
  const elements = getElements(document);
  const api = createApi({ window, fetch, AbortController });

  let currentScanId = null;
  let pollTimer = null;
  let trackingGeneration = 0;
  let startRequestGeneration = 0;
  let activeStartController = null;
  let activePollController = null;
  let pollInFlightGeneration = null;
  let startInFlight = false;

  const renderer = createRenderer(elements, isCurrentTracking, document);

  for (const button of elements.exampleButtons) {
    button.addEventListener("click", () => {
      elements.repoInput.value = button.dataset.exampleUrl;
      hide(elements.formError);
      elements.repoInput.focus();
    });
  }

  elements.clearButton.addEventListener("click", () => {
    clearScan();
  });

  elements.form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (startInFlight) {
      return;
    }

    hide(elements.formError);

    const repoUrl = elements.repoInput.value.trim();
    if (!repoUrl) {
      showMessage(elements.formError, "Enter a GitHub repository URL.");
      return;
    }

    startInFlight = true;
    elements.startButton.disabled = true;
    elements.startButton.textContent = "Starting...";
    const startGeneration = beginStartRequest();

    try {
      const { response, body } = await api.requestJsonWithTimeout(
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
        showMessage(
          elements.formError,
          getErrorMessage(body, "Unable to start the scan.")
        );
        return;
      }

      if (!isScanResponse(body)) {
        throw invalidResponseError();
      }

      const generation = beginTracking(body.id);
      hide(elements.networkMessage);
      hide(elements.scanError);
      hide(elements.resultsPanel);
      updateScanIdInUrl(currentScanId);
      renderer.renderScan(body, generation);
      startPolling(currentScanId, generation);
    } catch (error) {
      if (!isCurrentStartRequest(startGeneration)) {
        return;
      }

      if (isTimeoutError(error)) {
        showMessage(
          elements.formError,
          "Starting the scan timed out. Try again; no new scan is being tracked on this page."
        );
        return;
      }

      if (isAbortError(error)) {
        return;
      }

      if (isInvalidResponseError(error)) {
        showMessage(
          elements.formError,
          "The scan service returned an invalid response. No new scan is being tracked."
        );
        return;
      }

      showMessage(
        elements.formError,
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
    show(elements.scanPanel);
    elements.scanHeading.textContent = "Resuming scan";
    elements.currentStep.textContent = "Loading scan status from the server.";
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
    elements.startButton.disabled = false;
    elements.startButton.textContent = "Start scan";
  }

  function clearScan() {
    invalidateStartRequest();
    stopCurrentTracking();
    trackingGeneration += 1;
    currentScanId = null;
    renderer.resetDisplayedScan();
    removeScanIdFromUrl();
  }

  function invalidateStartRequest() {
    startRequestGeneration += 1;

    if (activeStartController) {
      activeStartController.abort();
      activeStartController = null;
    }

    startInFlight = false;
    elements.startButton.disabled = false;
    elements.startButton.textContent = "Start scan";
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
      const { response, body } = await api.requestJsonWithTimeout(
        `/api/scans/${encodeURIComponent(scanId)}`,
        {},
        controller
      );

      if (!isCurrentTracking(generation)) {
        return;
      }

      if (response.status === 404) {
        stopPolling(generation);
        renderer.renderUnavailableScan(generation);
        clearScanIdInUrl(generation);
        return;
      }

      if (!response.ok) {
        showMessage(
          elements.networkMessage,
          "Temporary issue refreshing scan status. The scan has not been marked as failed."
        );
        return;
      }

      if (!isScanResponse(body)) {
        throw invalidResponseError();
      }

      hide(elements.networkMessage);
      renderer.renderScan(body, generation);

      if (body.state === "completed" || body.state === "failed") {
        stopPolling(generation);
      }
    } catch (error) {
      if (!isCurrentTracking(generation)) {
        return;
      }

      if (isTimeoutError(error)) {
        showMessage(
          elements.networkMessage,
          "Refreshing scan status timed out. The scan is still running; polling will retry."
        );
        return;
      }

      if (isAbortError(error)) {
        return;
      }

      if (isInvalidResponseError(error)) {
        showMessage(
          elements.networkMessage,
          "The scan service returned an invalid response. The scan has not been marked as failed."
        );
        return;
      }

      showMessage(
        elements.networkMessage,
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
}
