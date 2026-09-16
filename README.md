# AI Scan Review Experience

A small Node.js + TypeScript + Express app for a mocked AI-assisted repository security review. It lets a user submit a GitHub repository URL, follows backend-owned simulated scan progress, and shows prioritized findings with evidence, impact, and next actions.

The scan is intentionally simulated. Repository contents are not inspected.

## User Flow

1. Open the local UI.
2. Enter a supported GitHub repository root URL.
3. Start a scan.
4. The UI polls the backend for progress every 1.5 seconds.
5. When complete, the UI shows either prioritized sample findings, no findings, or a simulated failure.
6. Use `Clear scan` to reset the client-side view and URL.

## Prerequisites

- Node.js 24 was used during development.
- npm 11 was used during development.

## Commands

```bash
npm install
npm run dev
npm test
npm run build
npm start
```

On Windows PowerShell with script execution disabled, use `npm.cmd` instead:

```powershell
npm.cmd install
npm.cmd run dev
npm.cmd test
npm.cmd run build
npm.cmd start
```

`npm run dev` starts the TypeScript source server with `tsx watch`.

`npm start` runs the built app and requires `npm run build` first.

## Local URL And Port

Default URL:

```text
http://localhost:3000
```

The server reads `PORT`:

```bash
PORT=4000 npm start
```

PowerShell:

```powershell
$env:PORT=4000; npm.cmd start
```

## Demo Repository URLs

Use these exact repository names:

```text
https://github.com/acme/api-service   -> sample findings
https://github.com/acme/clean-demo    -> no findings
https://github.com/acme/fail-demo     -> simulated failure
```

`.git` and one trailing slash are accepted and normalized before scenario selection:

```text
https://github.com/acme/clean-demo.git/
-> https://github.com/acme/clean-demo
```

## Accepted Repository URLs

Accepted URLs must:

- Use `https`.
- Use host `github.com`.
- Not include credentials.
- Not include an explicit port.
- Be a repository root URL with exactly owner and repository path segments.
- Not include query strings or fragments.
- Not include internal empty path segments such as `/acme//repo`.

Normalization:

- Trims whitespace.
- Removes one trailing slash.
- Removes a repository `.git` suffix.
- Stores and displays the canonical URL as `https://github.com/owner/repo`.

Examples rejected by validation:

```text
ftp://github.com/acme/repo
https://user:password@github.com/acme/repo
https://github.com:8443/acme/repo
https://github.com/acme/repo/issues/1
https://github.com/acme/repo?tab=readme
https://github.com/acme//repo
```

## API

### Health

```http
GET /api/health
```

Returns:

```json
{ "status": "ok" }
```

### Start Scan

```http
POST /api/scans
Content-Type: application/json
```

```json
{
  "repoUrl": "https://github.com/acme/api-service"
}
```

Relevant status codes:

- `202 Accepted`: scan created.
- `400 Bad Request`: invalid input.

### Get Scan Status

```http
GET /api/scans/:id
```

Relevant status codes:

- `200 OK`: scan found.
- `404 Not Found`: unknown scan ID.

The response includes scan state, progress, current step, timestamps, and results when available.

### Get Results

```http
GET /api/scans/:id/results
```

Relevant status codes:

- `200 OK`: completed scan results.
- `404 Not Found`: unknown scan ID.
- `409 Conflict`: scan is not completed yet.

## Scan States

```text
queued
cloning
analyzing_dependencies
analyzing_code
prioritizing_findings
completed
failed
```

Progress and state transitions are owned by the backend service, not the UI.

## Decisions

- Minimal static UI served by Express: the assignment needs a product experience, but not a frontend framework. A static page keeps setup small, makes the flow easy to review, and avoids adding build tooling unrelated to the backend exercise.
- Node.js + TypeScript + Express backend: this matches the assignment requirement and keeps the API implementation explicit and easy to inspect.
- In-memory scan storage using a `Map`: scans are looked up by ID, so `Map<string, Scan>` is the simplest fit. It avoids database setup for a three-hour mocked flow while making the restart limitation obvious.
- Backend-owned scan state and progress: the UI does not invent progress. It renders the state returned by the API, which keeps scan lifecycle rules in one place.
- UI polling instead of WebSockets or SSE: polling is enough for simulated progress, works with plain HTTP, and is easier to reason about for refresh/resume behavior. WebSockets or SSE would add complexity without improving this mocked assignment flow.
- Deterministic mock scenarios based on exact canonical repository name: this makes demos and tests repeatable and avoids surprising behavior from substrings in owners, query strings, or unrelated repository names.
- Results are product-oriented: severity, location/evidence, why it matters, and concrete next action.
- No hidden randomness, no real scanner output, and explicit simulated-scan labeling.

## Clear Scan

`Clear scan` resets the client-side view:

- Clears the `scanId` from the page URL.
- Hides current progress, results, errors, and warnings.
- Resets displayed scan text and progress.
- Invalidates the current frontend tracking generation.
- Aborts in-flight client polling and start requests.
- Prevents a late pending `POST /api/scans` response from restoring a cleared scan.

It does not cancel backend processing for a scan that was already created. Backend scans are in-memory timers and continue until completion or failure.

## Limitations

- No repository inspection.
- No live GitHub integration.
- No runtime LLM calls.
- No authentication.
- No persistent storage.
- Scans are lost on server restart.
- Mock findings are sample product data, not real security findings.

## Coding-Agent Usage

The implementation and tests were generated iteratively with a coding agent in this repository. I used the agent to scaffold the Express/TypeScript app, implement the deterministic mock scan service, build the static UI, add validation, and add regression tests.

The product constraints and review feedback came from the human reviewer during the conversation, including deterministic scenarios, stricter URL validation, stale-response handling, clear-scan behavior, timeout handling, and lockfile registry requirements. The backend flow was also manually verified by the reviewer. Verification performed by the agent was limited to command-line tests, builds, lockfile checks, and small server/static asset smoke checks; no browser automation was claimed.

## With More Time

- Replace mocked scenarios with real repository ingestion and scanner integration.
- Add authentication and GitHub OAuth.
- Persist scans and results in a database.
- Add cancellation support on the backend.
- Add richer result grouping, filtering, and remediation workflow.
- Add end-to-end browser tests for the UI.
