---
description: Rules for calling the Anthropic API from the Express server and managing prompts
---

# Anthropic API via Express + Prompt Management

---

## Constraining model output — read this first

The product decides what the AI is *for*; these constraints apply to every AI feature regardless:

- **Constrain the output shape.** Use the system prompt (and structured outputs where it fits) to force short, bounded responses. Never return free-form open-ended text straight into the UI.
- **Structured-output schemas do not support `minItems` above 1.** A schema asking for an array of exactly N items is rejected with a 400. To require a fixed number of things, use named properties (`optionA`, `optionB`) and map them to an array in the service — the shape is then guaranteed by construction, and the client contract stays whatever you want it to be.
- **Never echo raw model output into the UI without bounds.** Cap length server-side and validate the shape before it reaches the client.
- **Handle refusals explicitly.** Check `stop_reason` — a `refusal` must surface as a clear, non-alarming message, never a raw error or an empty panel.
- **Tone and content constraints are a server responsibility.** Put them in the system prompt in `prompts.json`, not in client code where they can be bypassed.
- **Never log user-entered text to an external service.** Server-side logs of prompt inputs must be scrubbed or omitted.

## Architecture

The browser never talks to Anthropic. Every AI call goes:

```
component → hook (src/hooks/) → api-client (src/lib/api-client.ts)
          → POST /api/ai/* (Express, rate-limited)
          → server/services/anthropic-service.ts → Anthropic API
```

**The API key is server-side only.** It lives in `server/.env` as `ANTHROPIC_API_KEY` and is never prefixed `VITE_` — a `VITE_` var is compiled into the client bundle and is therefore public. Add the key to `server/.env.example` as an empty placeholder; never commit a real value.

---

## SDK and model

Use the official SDK — `npm install @anthropic-ai/sdk`. Never hand-roll `fetch` against the REST endpoint, and never use an OpenAI-compatible shim.

```ts
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic() // reads ANTHROPIC_API_KEY from the environment
```

Default model: **`claude-opus-5`**. Use the exact model ID string — never append a date suffix. Do not downgrade to a cheaper model to save cost; that is the user's decision.

Default request shape:

```ts
const response = await client.messages.create({
  model: 'claude-opus-5',
  max_tokens: 16000,
  thinking: { type: 'adaptive' },
  system: systemPrompt,
  messages: [{ role: 'user', content: userPrompt }],
})
```

- **Adaptive thinking** (`thinking: { type: 'adaptive' }`) for anything non-trivial. `budget_tokens` is removed on this model and returns a 400.
- **Stream** any request with long input, long output, or a high `max_tokens` — it avoids HTTP timeouts. Use `client.messages.stream(...)` and `.finalMessage()` when you don't need individual events.
- `response.content` is a discriminated union — narrow on `block.type === 'text'` before reading `block.text`.
- Assistant prefill is not supported on this model. Constrain output shape with the system prompt or structured outputs instead.

---

## Prompt Management

**All prompts live in `server/prompts.json`.** Never inline a prompt string in a service or route.

```json
{
  "vacancy.summarise": {
    "system": "You are a concise summarisation assistant.",
    "user": "Summarise the {{record_type}} described here: {{details}}."
  }
}
```

- Placeholders use `{{variable}}` syntax.
- Substitute and **sanitise** at runtime — never interpolate raw user input without escaping. Treat every user-supplied value as untrusted.
- A missing placeholder value is an error, not an empty string.
- Changing a prompt is a reviewable change; keep prompt edits in their own commit where practical.

---

## Routes

- All AI routes live under `/api/ai/` in `server/routes/`.
- **Never `throw` inside an `async` route handler.** Express 4 does not catch rejected promises, so the throw becomes an unhandled rejection that kills the process instead of reaching the error middleware. Use `next(err); return`. This applies to validation guards at the top of the handler, not just to the provider call — those are the easiest to get wrong because the same `throw` is safe in a synchronous handler.
- **Every AI route is rate-limited** with `express-rate-limit`. An unlimited AI endpoint is a billing incident waiting to happen.
- Catch provider errors and return a user-friendly message — never leak a stack trace or the raw provider error to the client. Use the SDK's typed errors, most specific first:

```ts
import Anthropic from '@anthropic-ai/sdk'

try {
  // ...
} catch (error) {
  if (error instanceof Anthropic.RateLimitError) { /* 429 → "busy, try again" */ }
  else if (error instanceof Anthropic.AuthenticationError) { /* 500 → log, generic message */ }
  else if (error instanceof Anthropic.APIError) { /* map error.status */ }
}
```

- Always check `response.stop_reason` before reading content — `refusal` and `max_tokens` are not failures at the HTTP level and will otherwise surface as empty or truncated output.

---

## Frontend

- Add a typed function to `src/lib/api-client.ts` for each AI endpoint.
- Wrap it in a TanStack Query `useMutation` in `src/hooks/` (e.g. `src/hooks/useVacancySummary.ts`).
- Never call `fetch` directly from a component.
- AI calls are slow — always surface pending and error states in the UI.

---

## Adding a new AI capability — step by step

1. Add the prompt to `server/prompts.json` with `{{placeholders}}`.
2. Add a method to `server/services/anthropic-service.ts` that loads the prompt, substitutes, sanitises, and calls the API.
3. Add a rate-limited route under `/api/ai/` in `server/routes/`.
4. Add a typed function to `src/lib/api-client.ts`.
5. Add a hook in `src/hooks/` wrapping a TanStack Query mutation.
6. Wire the hook into the UI with pending and error states.
7. Add tests — **mock the provider at the boundary** (mock `anthropic-service`, not the SDK internals). Never call the real API in a test.

---

## Testing

- Mock at the service boundary. Tests must never make a real API call — it costs money and is non-deterministic.
- Test prompt substitution directly: given a template and variables, assert the resolved string.
- Test that a missing or invalid API key produces a user-friendly error, not a stack trace.
- Test the rate limiter rejects past the threshold.
