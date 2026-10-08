# AI features (Anthropic API)

**The app has no AI features today.** Nothing calls a model, and the Firebase
project (`vd2-scope`) is on the Spark plan, which cannot run Cloud Functions.
This file is how one gets added.

> The Express server this file used to describe — `/api/ai/*` routes,
> `express-rate-limit`, `server/prompts.json` — was deleted in the serverless
> migration (2026-10-09). There is no server to put an AI route on.

---

## Architecture

A model call needs a secret, and nothing in the browser or on the static host
can keep one. So it runs in a **Cloud Function**:

```
component → hook (src/hooks/) → src/lib/ai-client.ts → httpsCallable
          → functions/src/index.ts (v2 onCall) → Anthropic
```

- **Upgrade the project to Blaze first.** Functions do not deploy on Spark.
- **The API key is a Functions secret only** — never in the client, never a
  `VITE_` variable, never in a root `.env`.
  - Production: `npx firebase functions:secrets:set ANTHROPIC_API_KEY`
  - Emulator: gitignored `functions/.secret.local`
- **The owner guard replaces rate limiting.** Every callable's first line
  asserts `request.auth?.uid === OWNER_UID` (the UID pinned in
  `firestore.rules`) and throws `HttpsError('permission-denied')` otherwise.
  An unguarded AI endpoint is a billing incident waiting to happen.
- **Functions stay pure: input → model → structured output.** No Firestore
  access inside a function. Persistence happens in the browser through a
  planner (`rules-firebase.md`), so validation, counters and the held store
  keep working. Context the model needs — rows, the graph — is passed in the
  payload, built from what the client already holds: zero extra reads.
- **Components never call `httpsCallable` directly** — `ai-client.ts` wraps
  each callable, a hook wraps that in `useMutation`, and the UI shows pending
  and error states (AI calls are slow).

### Calls over ~60 seconds: two timeouts

- the function: `onCall({ timeoutSeconds: 540, … })` — the v2 default is 60
- the caller: `httpsCallable(functions, name, { timeout: 540000 })` — the SDK
  default is **70s**, the easier one to miss

They fail differently; set both. (The site is on cPanel, not behind a Firebase
Hosting rewrite, so Hosting's hard 60s ceiling does not apply.)

---

## Constraining model output — applies to every AI feature

- **Constrain the shape.** Structured outputs (`output_config.format` with a
  Zod schema via `client.messages.parse()`) for anything the app parses. Never
  put free-form text straight into the UI.
- **Structured-output schemas do not support `minItems` above 1.** To require a
  fixed number of things use named properties (`optionA`, `optionB`) and map
  them to an array in the function.
- **Bound and validate** before returning: cap lengths, check enums and ranges
  a schema cannot express.
- **Check `stop_reason`.** `refusal` and `max_tokens` are not HTTP errors; they
  surface as empty or truncated output unless handled. A refusal becomes a
  clear, non-alarming message.
- **Tone and content constraints are a function-side responsibility** — in the
  prompt, never in client code where they can be bypassed.
- **Never log user-entered text** to an external service.

## SDK and model

- The official SDK, `@anthropic-ai/sdk`, created inside the handler with the
  secret's value. Never hand-rolled `fetch`, never an OpenAI-compatible shim.
- Default model **`claude-opus-5`**, exact ID, no date suffix. Choosing a
  cheaper model is the user's decision, not a default.
- Adaptive thinking (`thinking: { type: 'adaptive' }`) for anything
  non-trivial; it shares `max_tokens`, so budget for both. No `temperature` or
  `budget_tokens` — both are rejected.
- Stream (`client.messages.stream(…).finalMessage()`) for long inputs or
  outputs.
- `response.content` is a union — narrow on `block.type === 'text'`.

## Prompts

In `functions/src/prompts.ts`, versioned with the functions: one entry per
action with its system prompt, `{{placeholder}}` template, model and
`max_tokens`. Substitute and sanitise at runtime; a missing placeholder value
is an error, not an empty string. Prompt edits are reviewable changes — keep
them in their own commit where practical.

## Errors

Map SDK errors to `HttpsError` with a user-meaningful code, most specific
first — `RateLimitError` → `resource-exhausted` ("busy, try again"),
`AuthenticationError` → `internal` (log it, generic message),
other `APIError` → by status. Never return a raw provider error or a stack.

## Testing

- Mock at the boundary: hook and component tests mock `@/lib/ai-client`;
  function tests mock the SDK. Never call the real API in a test.
- Test placeholder substitution, missing-placeholder rejection, output
  validation and refusal handling as pure logic.
- Against the emulator: a wrong-UID call is rejected, and a missing secret
  fails with a clean error, not a stack trace.
