# Security Safeguards & Compliance Profile — StadiumPulse AI 🛡️

StadiumPulse AI is architected with strict, multi-layered security measures to ensure operational reliability, protect system endpoints, and prevent data leakage or service abuse.

Below is a detailed overview of the security safeguards designed into the application:

---

## 1. Credentials & API Key Isolation

- **Strict Server-Side Isolation**: The Google Gemini API key (`GEMINI_API_KEY`) is read exclusively from the environment on the Node/Express server. It is **never** exposed, sent, or leaked to the client browser.
- **Zero Hardcoding**: No API keys, credentials, or development hashes are hardcoded within the codebase.
- **Environment Isolation**: The local `.env` configuration file is explicitly ignored in `.gitignore` using the pattern `.env*`, and only a secure, sterile `.env.example` template with placeholder values is committed to the repository.

## 2. Advanced Multi-Layered Rate Limiting

To prevent API abuse, excessive token billing, brute-force requests, and denial-of-service vectors, the server enforces independent, token-bucket rate limiters per IP address:

- **Assistant Chat Endpoint (`/api/assistant`)**: Configured with a capacity of `8` tokens and a slow refill rate of `0.5` tokens/second.
- **Operations Telemetry Endpoint (`/api/operations`)**: Generously scaled with a capacity of `30` tokens and a refill rate of `2.0` tokens/second to support dashboard polling frequencies while blocking bulk scraping.
- **Write and Configuration Endpoints (`/api/incidents`, `/api/incidents/resolve`, `/api/incidents/clear-all`, `/api/simulation/scenario`)**: Enforces a write rate-limiter with a capacity of `15` tokens and a refill rate of `1.0` token/second, preventing automated spamming of incident logs or simulation configurations.

## 3. Strict Input Validation, Payload Type Checking & Schema Enforcement

Every incoming request on writable and read-only endpoints undergoes rigorous type checks, schema validation, and value length validation before processing:

- **Malformed JSON Protection**: Pre-empts SyntaxErrors by intercepting and gracefully rejecting corrupted or malformed JSON payloads with a clean `400 Bad Request` instead of crashing or leaking raw stack traces.
- **Fan Chat Bot (`/api/assistant`)**: Ensures incoming messages are non-empty strings, capping input lengths strictly to `500` characters to prevent buffer overflow or LLM token-exhaustion attacks.
- **Manual Incident Logging (`/api/incidents`)**: Mandates that all fields (`zoneId`, `zoneName`, `severity`, `message`) are strings. Rejects requests that exceed strict character lengths (e.g., maximum of `30` for IDs, `100` for names, and `300` for message descriptions).
- **Simulation Scenario Selector (`/api/simulation/scenario`)**: Explicitly locks incoming scenario identifiers against an allowlist of valid scenarios (`"normal"`, `"crowd_rush"`, `"gate_b_emergency"`, `"extreme_rain"`, `"egress_surge"`), discarding arbitrary or unknown values immediately with a `400 Bad Request`.

## 4. Cross-Site Scripting (XSS) & HTML Escaping

- **Sanitization at Persistence Layer**: Any text submitted manually by operators (such as custom incident messages or zone reports) is programmatically escaped via a custom server-side helper function (`escapeHtml`) on `/api/incidents`. This strips out and encodes HTML tags (`<`, `>`, `&`, `"`, `'`) before they can reside in memory or render back into client viewports, preventing stored and reflected XSS.
- **Natively Safe Client Renderers**: No dangerous rendering attributes (such as React's `dangerouslySetInnerHTML`) are used anywhere in the front-end code, forcing React to render user inputs entirely as safe literal text nodes.

## 5. Explicit CORS & Advanced HTTP Security Headers

To secure client-to-server exchanges and guarantee safe visual containment:

- **Restrictive Cross-Origin Resource Sharing (CORS)**: Avoids wildcard (`*`) declarations. Only matches and allows trusted origins matching localhost developers, Google Cloud Run deployments, Vercel environments, or the Google AI Studio platform.
- **Content-Type Sniffing Protection**: Enforces `X-Content-Type-Options: nosniff` to prevent browser agents from guessing content types, mitigating MIME-sniffing exploits.
- **Cross-Site Scripting Filters**: Declares `X-XSS-Protection: 1; mode=block` to trigger active blocking in support browsers.
- **Referrer Privacy**: Restricts leakages via `Referrer-Policy: strict-origin-when-cross-origin`.
- **Frame Placement Boundaries (Anti-Clickjacking)**: Utilizes a robust Content-Security-Policy (CSP) with `frame-ancestors 'self' https://*.google.com https://*.ai.studio;` ensuring secure embedding inside the AI Studio prototyping iframe while fully protecting against frame-hijacking or clickjacking.

## 6. Unbounded Log-Growth Prevention (Memory Exhaustion Protection)

- **Capped Collections**: To prevent an attacker from executing resource-exhaustion attacks by repeatedly posting incident reports, the server caps the in-memory array of active incidents to a maximum size of `100`. Excess entries organically cycle out, protecting system heap memory.

## 7. Safe Error Response Disclosures

- **Pervasive Try-Catch Blocks**: Every API route handler is completely wrapped inside robust server-side `try-catch` statements.
- **Sterile Client Payload Messages**: The API hides internal error details, file paths, and compiler stack traces from client-facing payloads. On server exceptions, clients receive a generic, sanitized payload, while full, actionable system traces are written solely to secure server-side stdout logs.

## 8. No Personally Identifiable Information (PII) Leakage

- **Client-Side Profile Storage**: Accessible user preferences (high contrast settings, language selection, profile names) are held locally in standard client-side state and browser `localStorage`. No PII is forwarded to the backend or logged on the server.
