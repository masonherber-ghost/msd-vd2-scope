import { ParseError } from './scope-types.js'

/**
 * The 7 phases from the journey diagram are canonical — names, order and epic
 * refs. This overrides the phase naming and ordering in both source documents
 * (PRD §4).
 */
export type CanonicalPhase = {
  id: string
  name: string
  epicRef: string
  epicDescription: string
  displayOrder: number
}

export const CANONICAL_PHASES: readonly CanonicalPhase[] = [
  {
    id: 'access-and-onboarding',
    name: 'Access & Onboarding',
    epicRef: '179',
    epicDescription: 'Employer Registration & Employer portal onboarding',
    displayOrder: 1,
  },
  {
    id: 'employer-profile-and-portal',
    name: 'Employer Profile & Portal',
    epicRef: '176',
    epicDescription: 'Manage employer profile — internal/external portal',
    displayOrder: 2,
  },
  {
    id: 'manage-vacancies',
    name: 'Manage Vacancies',
    epicRef: '177',
    epicDescription: 'Employer can create and manage vacancies',
    displayOrder: 3,
  },
  {
    id: 'document-management',
    name: 'Document Management',
    epicRef: '178',
    epicDescription:
      'Clients and employers can manage documents to support applications, shortlisting and vacancies',
    displayOrder: 4,
  },
  {
    id: 'applications-and-referrals',
    name: 'Applications & Referrals',
    // 186 also appears on Employer Recruitment. Stored faithfully and NOT
    // enforced unique — very likely a diagram typo (PRD D-2).
    epicRef: '186',
    epicDescription: 'Staff and clients can create and manage applications',
    displayOrder: 5,
  },
  {
    id: 'employer-recruitment',
    name: 'Employer Recruitment',
    epicRef: '186',
    epicDescription: 'Employers can Manage Recruitment Against Vacancies',
    displayOrder: 6,
  },
  {
    id: 'outcomes-and-support',
    name: 'Outcomes & Support',
    epicRef: '192',
    epicDescription: 'Employers can communicate with MSD and access support',
    displayOrder: 7,
  },
]

/**
 * "Onboarding via invite" is an 8th grouping in both sources that the
 * canonical diagram does not have. It folds into Access & Onboarding
 * (PRD §4).
 *
 * Both parsers store the *canonical* name as `source_phase_label`, not the
 * document's own heading. Storing the heading made the two documents' words
 * for one phase read as a placement disagreement — 12 of them, every one
 * saying "these are the same phase". The merge stays auditable here, in the
 * alias table below, which is where a declared rule belongs; the source
 * documents are unedited and still say what they say.
 */
export const MERGED_PHASE_LABEL = 'Onboarding via invite'

const BY_NORMALISED = new Map<string, CanonicalPhase>()

function normalise(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, ' ')
}

for (const phase of CANONICAL_PHASES) {
  BY_NORMALISED.set(normalise(phase.name), phase)
}
// The merge: both sources use these two interchangeably.
BY_NORMALISED.set(
  normalise(MERGED_PHASE_LABEL),
  CANONICAL_PHASES[0], // Access & Onboarding
)

/** True when this label was folded rather than matched directly. */
export function isMergedPhaseLabel(label: string): boolean {
  return normalise(label) === normalise(MERGED_PHASE_LABEL)
}

/**
 * Resolves a source phase label to its canonical phase. Case- and
 * whitespace-insensitive, because the two documents differ in casing
 * ("Access & Onboarding" vs "Access & onboarding").
 *
 * Throws rather than guessing: an unrecognised heading means the source
 * changed shape and the import must stop (R-11.2).
 */
export function toCanonicalPhase(
  label: string,
  source: string,
  line: number,
): CanonicalPhase {
  const phase = BY_NORMALISED.get(normalise(label))
  if (!phase) {
    throw new ParseError(source, line, `Unrecognised phase label "${label}"`)
  }
  return phase
}
