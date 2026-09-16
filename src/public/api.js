import { REQUEST_TIMEOUT_MS } from "./config.js";

export function createApi({ window, fetch, AbortController }) {
  return {
    requestJsonWithTimeout: (url, options, controller = new AbortController()) =>
      requestJsonWithTimeout({ window, fetch }, url, options, controller)
  };
}

export async function requestJsonWithTimeout(
  { window, fetch },
  url,
  options,
  controller
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

export function isAbortError(error) {
  return error instanceof Error && error.name === "AbortError";
}

export function isTimeoutError(error) {
  return error instanceof Error && error.name === "TimeoutError";
}

export function isInvalidResponseError(error) {
  return error instanceof Error && error.name === "InvalidResponseError";
}

export function invalidResponseError() {
  const error = new Error("Invalid response");
  error.name = "InvalidResponseError";
  return error;
}

export function isScanResponse(body) {
  return (
    body &&
    typeof body.id === "string" &&
    typeof body.repoUrl === "string" &&
    typeof body.state === "string" &&
    typeof body.progress === "number"
  );
}

export function getErrorMessage(body, fallback) {
  return body && typeof body.error === "string" ? body.error : fallback;
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
