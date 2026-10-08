/** Shared types for the two source parsers and the reconciler. */

export type Actor = 'employer' | 'staff' | 'jobseeker' | 'system'

export const ACTORS: readonly Actor[] = ['employer', 'staff', 'jobseeker', 'system']

/** `1A` / `1B`, or null for a record whose title carried no option suffix. */
export type ScopeOption = '1A' | '1B' | null

/** Raised whenever a line cannot be parsed. Never skip silently: a skipped
 *  line is scope quietly vanishing (R-11.2). */
export class ParseError extends Error {
  source: string
  line: number

  constructor(source: string, line: number, message: string) {
    super(`${source}:${line} — ${message}`)
    this.name = 'ParseError'
    this.source = source
    this.line = line
  }
}

export type ParsedRelease = {
  id: string
  label: string
  name: string
  description: string
}

export type ParsedAssumption = {
  position: number
  text: string
}

export type ParsedMvpRef = {
  ref: number
  scopeOption: ScopeOption
  title: string
}

export type ParsedCapabilityRef = {
  text: string
  actor: Actor
  ref: number
}

export type ParsedPwcFeature = {
  id: string
  name: string
  foundationalBuild: string
  releaseId: string
  /** Canonical phase id, after the Onboarding-via-invite merge. */
  phaseId: string
  /** The label as written in the source, so the merge stays auditable. */
  sourcePhaseLabel: string
  displayOrder: number
  assumptions: ParsedAssumption[]
  mvpFeatures: ParsedMvpRef[]
  capabilities: ParsedCapabilityRef[]
  /** Set when the feature declares "no capabilities" with a reason. */
  capabilityNote: string | null
}

export type MappingParseResult = {
  releases: ParsedRelease[]
  features: ParsedPwcFeature[]
}

export type ParsedTableCapability = {
  text: string
  actor: Actor
  ref: number
  releaseId: string
  phaseId: string
  sourcePhaseLabel: string
}

export type SequencingParseResult = {
  releaseIds: string[]
  phaseLabels: string[]
  capabilities: ParsedTableCapability[]
  cellCount: number
  emptyCellCount: number
}
