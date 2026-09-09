> [!WARNING]
> **status: future — NOT ACTIVE.** This project currently uses SQLite (`better-sqlite3`) via Express.
> This file describes a **planned** Firebase target state. Do **not** follow it for day-to-day work —
> data changes follow `rules-database.md`. Read this only when running `/migration-plan`, or when
> explicitly asked about the Firebase migration.

# Anthropic API via Cloud Functions + Prompt Management Guide

---

## Architecture

**API key in Functions secrets only** — never in frontend code, never a `VITE_` variable, never in `.env` at the repo root.

**Request flow:** Component → hook (`src/hooks/useBrainDump.ts`) → `apiClient.brainDump.*` in `src/lib/firestore-client.ts` → `httpsCallable` → Cloud Function (`functions/src/index.ts`) → Anthropic. The frontend never calls Anthropic directly, and components never call `httpsCallable` directly.

**Auth guard replaces rate limiting** — every callable's first line asserts `request.auth.uid === OWNER_UID` and throws `HttpsError('permission-denied')` otherwise. Only the single authorised user can invoke the functions, so express-rate-limit's job is done by auth.

**No Firestore writes inside functions** — functions are pure AI calls (input → model → structured output). All persistence (sessions, items, created tasks) happens client-side in `firestore-client.ts`, so the surgical cache updates keep working.

---

## Cloud Functions

**`functions/src/index.ts`** — all Anthropic calls live here as v2 `onCall` functions (currently `generateOutline`, `convertOutline`).

**SDK + secret setup:**
```ts
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import Anthropic from '@anthropic-ai/sdk'

const anthropicApiKey = defineSecret('ANTHROPIC_API_KEY')

export const myFunction = onCall({ secrets: [anthropicApiKey] }, async (request) => {
  assertOwner(request.auth?.uid)
  const client = new Anthropic({ apiKey: anthropicApiKey.value() }) // inside the handler
  ...
})
```

**Secrets:**
- Production: `npx firebase functions:secrets:set ANTHROPIC_API_KEY` (or pipe with `--data-file -`)
- Emulator: gitignored `functions/.secret.local` (`ANTHROPIC_API_KEY=…`)

**Error handling:**
- Throw `HttpsError` with a user-meaningful code (`invalid-argument`, `permission-denied`, `internal`) — never leak raw Anthropic errors to the client
- Validate inputs before calling the model; validate/parse model output (strip code fences, `JSON.parse` in try/catch, check required shapes) before returning

---

## Prompt Management

Prompts live **inline in `functions/src/index.ts`**, one system prompt per function, alongside its `model` and `max_tokens`. (The old `server/prompts.json` went with the Express server — with two prompts, colocation beats indirection. If prompt count grows, extract to a `functions/src/prompts.ts` module, still versioned with the functions code.)

**Dynamic context comes from the client**: current rocks/layers/open-task context is passed in the callable payload, built from the already-cached base queries (0 extra reads). Never hardcode the rock list in a prompt; never fetch it inside the function.

**Model selection:**
- `claude-sonnet-4-6` — complex reasoning, nuanced tasks
- `claude-haiku-4-5-20251001` — simpler, faster, cheaper operations (both current functions use this)

**API call shape:**
```ts
const message = await client.messages.create({
  model: 'claude-haiku-4-5-20251001',
  max_tokens: 1200,
  system: systemPrompt,
  messages: [{ role: 'user', content: filledContent }],
})
const content = message.content[0]
if (content.type !== 'text') throw new HttpsError('internal', 'Unexpected response type from AI')
```

---

## Frontend

- **`firestore-client.ts`** wraps each callable (`httpsCallable(functions, 'name')`) plus any associated Firestore persistence, exposing one typed method per user action.
- **Hooks** (`useBrainDump.ts`) wrap those methods in TanStack `useMutation` — loading/error/success state lives there; components stay declarative.
- After a mutation that creates tasks (e.g. dump confirm), invalidate `['tasks']` once — never a fan-out.

---

## Adding a new AI capability — step by step

1. Add a v2 `onCall` function in `functions/src/index.ts` — `secrets: [anthropicApiKey]`, owner-UID guard first line, prompt + model + max_tokens colocated, output validated
2. `npm --prefix functions run build`, then verify against the emulator (`npm run emulators` — functions run locally with `.secret.local`, no deploy needed)
3. Add a typed wrapper in `src/lib/firestore-client.ts` (callable + any Firestore writes)
4. Add/extend a hook in `src/hooks/` with `useMutation`
5. Wire into the UI via the hook — never call the client directly from a component
6. Deploy: `npx firebase deploy --only functions` (Blaze required; predeploy runs the build)
7. Verify an unauthenticated / wrong-UID call is rejected, and that a missing secret fails with a clean error, not a stack trace

---

## Testing

- Mock at the boundary — `vi.mock('@/lib/firestore-client')` in hook tests; never call real functions or Anthropic in tests
- Test input validation and output parsing (fence-stripping, invalid JSON) as pure logic where possible
- End-to-end: the emulator suite (`scripts/emulator-smoke.ts` shows the pattern — sign in, call the function, assert on the response)
- Keep `vi.mock('@/lib/firebase')` in any test that transitively imports the SDK — `src/lib/firebase.ts` initialises on import
