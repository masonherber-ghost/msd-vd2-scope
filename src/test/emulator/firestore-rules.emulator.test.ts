import fs from 'node:fs'
import path from 'node:path'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

/**
 * The rules are the only security boundary, so each case here is owner
 * allowed / other UID denied / unauthenticated denied. Runs against the
 * emulator only: `npm run test:rules`.
 */
const RULES_PATH = path.resolve(import.meta.dirname, '../../../firestore.rules')
const rules = fs.readFileSync(RULES_PATH, 'utf8')

// Read the pinned owner from the rules file itself, so the test can never
// drift from what is deployed.
const OWNER_UID = /uid == '([^']+)'/.exec(rules)?.[1]
if (!OWNER_UID) throw new Error('No pinned owner UID found in firestore.rules')
const OTHER_UID = 'someone-else'

let env: RulesTestEnvironment

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-vd2-scope-rules',
    firestore: { rules, host: '127.0.0.1', port: 8080 },
  })
})

afterAll(async () => {
  await env.cleanup()
})

beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `users/${OWNER_UID}/releases/R1`), { id: 'R1' })
    await setDoc(doc(ctx.firestore(), `users/${OTHER_UID}/releases/R1`), { id: 'R1' })
  })
})

const ownerDb = () => env.authenticatedContext(OWNER_UID).firestore()
const otherDb = () => env.authenticatedContext(OTHER_UID).firestore()
const anonDb = () => env.unauthenticatedContext().firestore()

describe('firestore.rules — owner subtree', () => {
  it('lets the owner read and write their own subtree, at any depth', async () => {
    await assertSucceeds(getDoc(doc(ownerDb(), `users/${OWNER_UID}/releases/R1`)))
    await assertSucceeds(
      setDoc(doc(ownerDb(), `users/${OWNER_UID}/capabilities/1`), { id: 1 }),
    )
  })

  it('denies another signed-in user the owner subtree', async () => {
    await assertFails(getDoc(doc(otherDb(), `users/${OWNER_UID}/releases/R1`)))
    await assertFails(setDoc(doc(otherDb(), `users/${OWNER_UID}/releases/R2`), { id: 'R2' }))
  })

  it('denies a signed-in user who is not the owner even their own subtree', async () => {
    // Google sign-in is open to any account; only the pinned UID gets data.
    await assertFails(getDoc(doc(otherDb(), `users/${OTHER_UID}/releases/R1`)))
    await assertFails(setDoc(doc(otherDb(), `users/${OTHER_UID}/releases/R2`), { id: 'R2' }))
  })

  it('denies unauthenticated access', async () => {
    await assertFails(getDoc(doc(anonDb(), `users/${OWNER_UID}/releases/R1`)))
    await assertFails(setDoc(doc(anonDb(), `users/${OWNER_UID}/releases/R2`), { id: 'R2' }))
  })

  it('denies everything outside users/{uid}', async () => {
    await assertFails(getDoc(doc(ownerDb(), 'releases/R1')))
    await assertFails(setDoc(doc(ownerDb(), 'releases/R1'), { id: 'R1' }))
  })
})
