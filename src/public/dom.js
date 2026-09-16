export function getElements(document) {
  return {
    form: requiredElement(document, "#scan-form"),
    repoInput: requiredElement(document, "#repo-url"),
    startButton: requiredElement(document, "#start-button"),
    clearButton: requiredElement(document, "#clear-button"),
    exampleButtons: document.querySelectorAll("[data-example-url]"),
    formError: requiredElement(document, "#form-error"),
    scanPanel: requiredElement(document, "#scan-panel"),
    scanHeading: requiredElement(document, "#scan-heading"),
    scanState: requiredElement(document, "#scan-state"),
    progressWrap: requiredElement(document, "#progress-wrap"),
    currentStep: requiredElement(document, "#current-step"),
    progressPercent: requiredElement(document, "#progress-percent"),
    progressBar: requiredElement(document, "#progress-bar"),
    networkMessage: requiredElement(document, "#network-message"),
    scanError: requiredElement(document, "#scan-error"),
    resultsPanel: requiredElement(document, "#results-panel"),
    riskLevel: requiredElement(document, "#risk-level"),
    resultSummary: requiredElement(document, "#result-summary"),
    addressFirst: requiredElement(document, "#address-first"),
    emptyResults: requiredElement(document, "#empty-results"),
    findingsList: requiredElement(document, "#findings-list")
  };
}

export function show(element) {
  element.hidden = false;
}

export function hide(element) {
  element.hidden = true;
}

export function showMessage(element, message) {
  element.textContent = message;
  show(element);
}

function requiredElement(document, selector) {
  const element = document.querySelector(selector);
  if (!element) {
    throw new Error(`Missing UI element ${selector}`);
  }

  return element;
}
