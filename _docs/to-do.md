Filters:

Add source filter back - check and ensure works how I need it to

Detail panel:
- ~~Add ability to resolve conflicts in the feature detail view~~ — **done.** Same states and
  note as the reconciliation queue, recorded against the link. PRD R-8.22.

Tabs:
- ~~Add option for By 'MSD feature'~~ — **done.** Third tab on the scope map; cards are MVP
  records, the panel lists the citing PwC features (F-numbers) and the capabilities the
  record owns. Placement rule and its caveats: PRD R-8.20 / R-8.21.
- Add option for 'By capability': this would list out cards for each capability. Detail for this would be the related MSD feature and PWC feature

Data: 
- Run review of PWC data to see if data is matching and if there are any data conflicts
- Review new doc of MSD existing features and include matched against the capabiltiies
- ~~Apply the approved R1.1 MSD feature list~~ — **done.** Release 1.1 now holds exactly the
  12 approved refs. See PRD OV-004…OV-006. Two things to come back to:
  - **943, 949, 965, 970, 976** were parked in 1.2 with no evidence — every PwC feature
    citing them is itself in 1.1, and nothing cites 976 at all. Needs a real home.
  - **F-001 and F-002** stay in 1.1 but cite ref 938, which was descoped to 1.4. That is 12
    of the 42 release conflicts. Either those two pilot features should not cite 938, or
    938's capabilities are over-attributed (its 6 include "Invite employer to register" and
    "Receive secure email invite", which read like F-001/F-002's own pilot work).
  - **F-086** stays in 1.2 while ref 972 moved into the pilot — 1 conflict. Decide whether
    the whole of 972 belongs in R1.1.
- ~~Split Option A / Option B into separate features~~ — **done.** PRD OV-007/OV-008; both
  carry `(Option A)` / `(Option B)` in the title for traceability.
