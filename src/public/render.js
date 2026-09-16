import { hide, show, showMessage } from "./dom.js";

export function createRenderer(elements, isCurrentTracking, document) {
  function renderScan(scan, generation) {
    if (!isCurrentTracking(generation)) {
      return;
    }

    show(elements.scanPanel);
    show(elements.progressWrap);
    elements.scanHeading.textContent = `Scan for ${scan.repoUrl}`;
    elements.scanState.textContent = formatState(scan.state);
    elements.scanState.className = `state-badge state-${scan.state}`;
    elements.currentStep.textContent =
      scan.currentStep || "Waiting for scan updates.";
    elements.progressBar.value = scan.progress || 0;
    elements.progressPercent.textContent = `${scan.progress || 0}%`;

    hide(elements.scanError);

    if (scan.state === "failed") {
      hide(elements.resultsPanel);
      showMessage(
        elements.scanError,
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

    show(elements.scanPanel);
    hide(elements.progressWrap);
    hide(elements.resultsPanel);
    hide(elements.networkMessage);
    elements.scanHeading.textContent = "Scan unavailable";
    elements.scanState.textContent = "Unavailable";
    elements.scanState.className = "state-badge state-failed";
    elements.currentStep.textContent = "";
    elements.progressBar.value = 0;
    elements.progressPercent.textContent = "";
    showMessage(
      elements.scanError,
      "Scan not found. It may have expired or the backend may have restarted. Start a new scan to continue."
    );
  }

  function resetDisplayedScan() {
    hide(elements.formError);
    hide(elements.scanPanel);
    hide(elements.progressWrap);
    hide(elements.networkMessage);
    hide(elements.scanError);
    hide(elements.resultsPanel);
    hide(elements.emptyResults);
    show(elements.findingsList);
    elements.findingsList.replaceChildren();
    elements.scanHeading.textContent = "Scan status";
    elements.scanState.textContent = "Queued";
    elements.scanState.className = "state-badge";
    elements.currentStep.textContent = "Waiting for scan updates.";
    elements.progressBar.value = 0;
    elements.progressPercent.textContent = "0%";
    elements.resultSummary.textContent = "";
    elements.addressFirst.textContent = "";
    elements.riskLevel.textContent = "None";
    elements.riskLevel.className = "risk-badge";
  }

  function renderResults(result, generation) {
    if (!isCurrentTracking(generation)) {
      return;
    }

    show(elements.resultsPanel);
    elements.riskLevel.textContent = result.riskLevel;
    elements.riskLevel.className = `risk-badge risk-${result.riskLevel}`;
    elements.resultSummary.textContent = result.summary;
    elements.addressFirst.textContent = result.addressFirst;

    elements.findingsList.replaceChildren();

    if (!result.findings || result.findings.length === 0) {
      show(elements.emptyResults);
      hide(elements.findingsList);
      return;
    }

    hide(elements.emptyResults);
    show(elements.findingsList);

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
      elements.findingsList.append(item);
    }
  }

  return {
    renderScan,
    renderUnavailableScan,
    resetDisplayedScan
  };
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

function formatState(state) {
  return String(state || "unknown").replaceAll("_", " ");
}
