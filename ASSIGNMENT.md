# Backend Home Assignment: “AI Scan Review Experience”
## Context
We are building a product in the coding-agent/AI security-scanning space.
A customer gave us this vague request:
“I want to connect one of my GitHub repositories and get an AI-assisted code or
dependencies security review.
I don’t want a raw scanner report. I want to understand what matters, what is risky, and what I
should do next.
It should feel like a product experience, not just an API.”
Your task is to take this vague request and build a small E2E flow.
Expected time: ~3 hours.
## What You Need To Deliver
Build a small app/service that lets a user:
1. Submit a GitHub repository URL.
2. Start some kind of security/code scan or mocked scan.
3. Follow the scan progress.
4. See a useful result screen/API response.
5. Understand the most important risks and recommended next actions.
You decide the exact UX, API, states, data model, and flow. 

## Must Have
- Backend implementation in Node.js + TypeScript.
- A way to start a scan.
- A way to track scan progress.
- A way to review the final result.
- README explaining your product and technical decisions.
- Short explanation of how you used coding agents.