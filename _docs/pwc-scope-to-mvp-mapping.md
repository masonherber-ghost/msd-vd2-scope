# PWC VD2 P1 Scope to MVP Features & Sequenced Capabilities Mapping

---

## 📦 Release 1.1 (MVP1.1): Controlled Pilot (Core Onboarding & Spot Vacancy)
**Description:** Invitation access for a small, trusted cohort of known employers who can post and manage new spot/non-immigration vacancies. Reduces staff effort in validating and publishing vacancies while keeping the client experience current.

### 📂 Phase: Onboarding via invite

#### 🔹 PWC Feature: Receive employer portal invite (F-001)
* **Included in foundational build:** Employer receives a controlled invitation and entry link to the portal.
* **Assumptions:**
  * CIAM limited to delegated auth only.
  * Assumes Salesforce workflow to drive/support the invite process.
  * Standard Salesforce invite process pattern support.
  * Assumes the invitation will be via an email only.
  * Assumes the link will be personalised and unique to the identified Employer User and will expire upon an agreed time frame if not actioned by the Employer User.
  * Assumes the Employer User will need to contact MSD to request a re-invitation.
  * Assumes no limitations to the number of reinvitations that can be issued and the decision to re-issue (or not) will be up to Staff discretion.
  * Assumes one active Invitation at a given point in time per Employer User, i.e., a reinvitation before the prior invitation expires will result in the prior invitation being inactive.
* **MVP Feature Mapping:**
  * `938 - Staff can Create and Manage Additional Employer Portal Users (Option 1A)`
* **Sequenced Release Capabilities (`R1-sequenced-release-capabilities-table.md`):**
  * • Manual contacts & relationships creation (staff, 938)
  * • Invite employer to register with secure link (staff, 938)
  * • Receive secure email invite to the portal (employer, 938)
  * • Search and find employer (staff, 938)
  * • History logging and audit trail (system, 938)
  * • Create and manage additional users (staff, 938)

---

#### 🔹 PWC Feature: Invite employer (F-002)
* **Included in foundational build:** Staff can invite an identified employer to access the service.
* **Assumptions:**
  * Assumes the invitation to register for the Employer portal is sent out via a manual action (e.g., click of a button or similar) to one single User per identified Employer.
  * Assumes access to the button (or the action/workflow behind the button or similar mechanism) is controlled by a new RBAC that is manually applied to an identified group of Staff.
  * Assumes the Employer is pre-verified and the chosen Employer User (Contact) to receive the invitation is set up as a primary Contact, and deduplicated, for the Employer in CMS.
* **MVP Feature Mapping:**
  * `938 - Staff can Create and Manage Additional Employer Portal Users (Option 1A)`
* **Sequenced Release Capabilities (`R1-sequenced-release-capabilities-table.md`):**
  * • Manual contacts & relationships creation (staff, 938)
  * • Invite employer to register with secure link (staff, 938)
  * • Receive secure email invite to the portal (employer, 938)
  * • Search and find employer (staff, 938)
  * • History logging and audit trail (system, 938)
  * • Create and manage additional users (staff, 938)

---

### 📂 Phase: Access & onboarding

#### 🔹 PWC Feature: CIAM authentication (F-006)
* **Included in foundational build:** Secure employer authentication through the agreed identity service.
* **Assumptions:**
  * CIAM authentication will be required in any version of the MVP Release 1 scope. Both Option 1A and Option 1B will need this.
  * Assumes CIAM will be fully responsible to ensure they provide a fit-for-purpose solution to SEP to enable employer authentication.
  * Assumes AEM is going to need to maintain session between authenticated and unauthenticated states. Same functionality is required by SF.
* **MVP Feature Mapping:**
  * `941 - Employer Portal Landing Page and Account Overview`
  * `946 - Employer Portal User Access and Permissions`
* **Sequenced Release Capabilities (`R1-sequenced-release-capabilities-table.md`):**
  * • View authenticated landing page / dashboard (employer, 941)
  * • Suspension / deactivation alerts (employer, 941)
  * • View authenticated landing page (employer, 941)
  * • CIAM register & login authentication (employer, 941)
  * • MVP single permission set (system, 946)

---

#### 🔹 PWC Feature: User account creation (F-007)
* **Included in foundational build:** Employer user can establish an individual account.
* **Assumptions:**
  * Assumes a user account can ONLY be linked to one employer.
  * Assumes self-service account creation is deferred to Release 1.9 (Scale Up).
* **MVP Feature Mapping:**
  * `946 - Employer Portal User Access and Permissions (Option 1A)`
* **Sequenced Release Capabilities (`R1-sequenced-release-capabilities-table.md`):**
  * • MVP single permission set (system, 946)

---

#### 🔹 PWC Feature: Account access recovery (F-008)
* **Included in foundational build:** Routine access recovery is available without staff intervention.
* **Assumptions:**
  * For Release 1, assumes this will be handled via CIAM/upstream IDPs (for credentials, lockout, etc.) and SF manual process to reset/reinvite as required.
* **MVP Feature Mapping:**
  * `937 - Employer Account and User Access Recovery`
* **Sequenced Release Capabilities (`R1-sequenced-release-capabilities-table.md`):**
  * *(No direct individual capabilities mapped in Release 1.1–1.3 table)*

---

#### 🔹 PWC Feature: Registration and login page content (F-014)
* **Included in foundational build:** Provides instructions, consent, and guidance through registration and login.
* **Assumptions:**
  * Assuming this will be required for Option 1A as well.
  * Assumes that other than T&Cs, registration and login page content will be static, provided by Content teams, and finalised before build.
* **MVP Feature Mapping:**
  * `943 - Employer Portal Onboarding Experience`
  * `951 - Register for the Employer Portal - New organisation (Option 1A)`
* **Sequenced Release Capabilities (`R1-sequenced-release-capabilities-table.md`):**
  * • View basic guidance, next steps and help text (employer, 943)
  * • Electronic T&Cs acceptance (employer, 951)

---

### 📂 Phase: Employer Profile & Portal

#### 🔹 PWC Feature: Authenticated homepage / dashboard (F-019)
* **Included in foundational build:** Provides a clear entry point and links/statuses needed to continue the journey.
* **Assumptions:**
  * Assumes there will be re-work required later when portal strategy design is further understood.
  * Assumes all data that must be visible on this dashboard will be stored in SF and not fetched via APIs.
* **MVP Feature Mapping:**
  * `941 - Employer Portal Landing Page and Account Overview`
  * `955 - IA / Global UX for Employer Portal`
* **Sequenced Release Capabilities (`R1-sequenced-release-capabilities-table.md`):**
  * • View authenticated landing page / dashboard (employer, 941)
  * • View authenticated landing page (employer, 941)
  * • Navigation and portal structure (employer, 955)
  * • Render unauth and authenticated states (system, 955)

---

#### 🔹 PWC Feature: Suspend or deactivate employers (F-027)
* **Included in foundational build:** Staff can prevent access where required for risk, closure, or misuse.
* **Assumptions:**
  * Assumes manual processes/SOPs will be required and people trained on how to deactivate/suspend a user from an account/employer profile in multiple systems (CMS and SF).
  * Assumes notification will be sent to all account users when an account is suspended. Assumes an approval process is required for suspension/deactivation.
  * Assumes a report will be available to view accounts in this workflow.
  * Assuming a single workflow whether account is suspended or deactivated for any reason.
* **MVP Feature Mapping:**
  * `949 - Deactivate, Suspend, Close and Reactivate Employer Profile and Users`
* **Sequenced Release Capabilities (`R1-sequenced-release-capabilities-table.md`):**
  * • Deactivate or permanently close a specific individual employer user account & provide reasons (staff, 949)
  * • Suspend / reinstate portal access for an employer organisation & provide reasons (staff, 949)

---

#### 🔹 PWC Feature: Set relationship manager (F-028)
* **Included in foundational build:** Staff can maintain the relevant relationship assignment.
* **Assumptions:**
  * Assumes information is maintained via a simple text field.
  * Assumes no workflow linked to this data/information.
  * Assumes reporting outside of SF.
* **MVP Feature Mapping:**
  * `965 - Set Regional Relationship Manager`
* **Sequenced Release Capabilities (`R1-sequenced-release-capabilities-table.md`):**
  * • Assign or reassign relationship manager (staff, 965)

---

#### 🔹 PWC Feature: Navigation and portal structure (F-032)
* **Included in foundational build:** Provides coherent navigation across profile, vacancies, applications, outcomes, and support.
* **Assumptions:**
  * Assuming TVA structure (2 systems).
  * Dependency on CIAM big rock required on session times etc. that will impact architecture/design work.
* **MVP Feature Mapping:**
  * `955 - IA / Global UX for Employer Portal`
* **Sequenced Release Capabilities (`R1-sequenced-release-capabilities-table.md`):**
  * • Navigation and portal structure (employer, 955)
  * • Render unauth and authenticated states (system, 955)

---

### 📂 Phase: Manage Vacancies

#### 🔹 PWC Feature: Create vacancy (F-035)
* **Included in foundational build:** Employer enters the structured information required for a usable vacancy.
* **Assumptions:**
  * Assumes the reuse of the current existing Vacancy form as-is with a number of contextual fields prepopulated for the Employer User.
* **MVP Feature Mapping:**
  * `939 - Employer Vacancy Submission (Create and Submit)`
* **Sequenced Release Capabilities (`R1-sequenced-release-capabilities-table.md`):**
  * • Create & submit vacancy (employer, 939)

---

#### 🔹 PWC Feature: Submit vacancy (F-036)
* **Included in foundational build:** Employer confirms and submits the vacancy into MSD review.
* **Assumptions:**
  * Assumes the reuse of current existing Vacancy form review and submission as-is with no changes to validation rules or workflow (i.e. vacancies will still go to MSD staff for review and publication).
* **MVP Feature Mapping:**
  * `939 - Employer Vacancy Submission (Create and Submit)`
* **Sequenced Release Capabilities (`R1-sequenced-release-capabilities-table.md`):**
  * • Create & submit vacancy (employer, 939)

---

#### 🔹 PWC Feature: View vacancy status (F-037)
* **Included in foundational build:** Employer can see the vacancy’s core lifecycle status.
* **Assumptions:**
  * Assumes all statuses of a vacancy lifecycle are visible to the employer with no requirement to aggregate or hide any stages.
* **MVP Feature Mapping:**
  * `968 - Vacancy Visibility and Vacancy Landing Experience`
* **Sequenced Release Capabilities (`R1-sequenced-release-capabilities-table.md`):**
  * • View list of vacancies & statuses (employer, 968)

---

#### 🔹 PWC Feature: Save draft and resume vacancy (F-038)
* **Included in foundational build:** Employer can save incomplete work and return later.
* **Assumptions:**
  * Assumes out-of-the-box Salesforce capability for saving an incomplete Omniscript to be used.
  * Assumes abandoned vacancy submission forms will need to be cleaned up/deleted automatically after a predefined period.
  * Assumes abandoned vacancy submission forms will not need to be archived and held for 7 years.
* **MVP Feature Mapping:**
  * `940 - Save Draft Vacancy and Resume`
* **Sequenced Release Capabilities (`R1-sequenced-release-capabilities-table.md`):**
  * • Discard draft vacancies (employer, 940)
  * • Save draft and resume vacancy (employer, 940)

---

#### 🔹 PWC Feature: Receive vacancy-related email notifications (F-039)
* **Included in foundational build:** Employer receives essential vacancy status and action notifications by email.
* **Assumptions:**
  * Assumes all existing vacancy-related email notifications will be sent as per current business rules to the Vacancy Owner.
  * Assumes incomplete vacancy forms will require a new email notification to prompt completion.
* **MVP Feature Mapping:**
  * `947 - Staff Can Review and Publish Vacancies Submitted by Employers`
  * `970 - Essential Employer Operational Notifications`
* **Sequenced Release Capabilities (`R1-sequenced-release-capabilities-table.md`):**
  * • Receive vacancy related notifications (employer, 947)
  * • Employer Operational Notifications (system, 970)
  * • Deliver essential operational notifications through the shared notification service (system, 970)

---

#### 🔹 PWC Feature: Vacancy lifecycle workflow (F-044)
* **Included in foundational build:** Controls allowed vacancy states and transitions from draft through closure.
* **Assumptions:**
  * Assumes no changes to the current vacancy lifecycle.
  * Assumes Employer Users will be allowed certain actions to transition a vacancy through stages (e.g. Published to Withdrawn).
  * Assumes if Employer Users transition stages, mandatory information will be prompted prior to transition.
* **MVP Feature Mapping:**
  * `944 - Vacancy Lifecycle Transitions`
* **Sequenced Release Capabilities (`R1-sequenced-release-capabilities-table.md`):**
  * • Request to withdraw vacancy (employer, 944)
  * • Receive vacancy withdrawal request (system, 944)
  * • Application lifecycle workflow (system, 944)
  * • Vacancy lifecycle workflow (system, 944)

---

#### 🔹 PWC Feature: Vacancy quality assurance (F-045)
* **Included in foundational build:** Provides required validation and staff checks before publication.
* **Assumptions:**
  * Assumes no changes to the current vacancy review process that staff undertake.
  * Assumes no automated checks to be built into the vacancy form other than current business rules.
* **MVP Feature Mapping:**
  * `947 - Staff Can Review and Publish Vacancies Submitted by Employers`
* **Sequenced Release Capabilities (`R1-sequenced-release-capabilities-table.md`):**
  * • Viewing the relevant employer compliance or risk information needed to complete the vacancy review (staff, 947)
  * • Review & publish vacancies. Staff can also request specific corrections to vacancies (staff, 947)
  * • Hold, suspend or decline vacancy (staff, 947)

---

#### 🔹 PWC Feature: Employer email notifications (F-046)
* **Included in foundational build:** Sends essential operational notifications for vacancy and recruitment events.
* **Assumptions:**
  * Assumes all existing vacancy-related email notifications will be sent as per current business rules to the Vacancy Owner.
* **MVP Feature Mapping:**
  * `970 - Essential Employer Operational Notifications`
* **Sequenced Release Capabilities (`R1-sequenced-release-capabilities-table.md`):**
  * • Employer Operational Notifications (system, 970)
  * • Deliver essential operational notifications through the shared notification service (system, 970)

---

#### 🔹 PWC Feature: Review vacancies (F-050)
* **Included in foundational build:** Staff assess completeness, suitability, and compliance before publication.
* **Assumptions:**
  * Assumes no changes to the current vacancy review process that staff undertake.
* **MVP Feature Mapping:**
  * `947 - Staff Can Review and Publish Vacancies Submitted by Employers`
* **Sequenced Release Capabilities (`R1-sequenced-release-capabilities-table.md`):**
  * • Viewing the relevant employer compliance or risk information needed to complete the vacancy review (staff, 947)
  * • Record review decision reasons (staff, 947)
  * • Review & publish vacancies (staff, 947)

---

#### 🔹 PWC Feature: Publish vacancy (F-051)
* **Included in foundational build:** Authorised staff publish an approved vacancy to the appropriate channel.
* **Assumptions:**
  * Assumes no changes to the current vacancy review process that staff undertake.
  * Assumes no auto-publish for approved/trusted employers.
* **MVP Feature Mapping:**
  * `947 - Staff Can Review and Publish Vacancies Submitted by Employers`
* **Sequenced Release Capabilities (`R1-sequenced-release-capabilities-table.md`):**
  * • Review & publish vacancies (staff, 947)

---

## 📦 Release 1.2 (MVP1.2): Client Applications & Referral Pipeline
**Description:** Clients can apply directly for vacancies by attaching CVs and cover letters. Enables jobseekers to securely upload and download CVs, apply directly to published listings, and track applications, while giving employers read-only candidate folders.

### 📂 Phase: Document Management

#### 🔹 PWC Feature: Upload CV (F-057)
* **Included in foundational build:** Jobseeker provides a CV for application and employer review.
* **Assumptions:**
  * Functionality served via AEM; document storage solution available on SF.
  * Jobseeker can select which CV to use for the application.
  * Auditability of download/access required for security compliance.
  * Migration of historical CMS CVs handled via Document storage solution.
  * Editing CVs is done by downloading and uploading the updated CV (editable format in `.docx` only).
  * Document management capability for managing multiple copies of CVs is out of scope.
* **MVP Feature Mapping:**
  * `956 - Download the JSP Generated CV`
  * `958 - Client CV Upload and Storage`
* **Sequenced Release Capabilities (`R1-sequenced-release-capabilities-table.md`):**
  * • Upload personal CV (jobseeker, 958)
  * • Download the existing JSP-generated CV in an editable format (jobseeker, 956)
  * • Opening and modifying the editable CV file in external word processors (jobseeker, 956)
  * • Replace currently stored CV on the portal (jobseeker, 958)
  * • Download the JSP generated CV on behalf of jobseekers (staff, 956)
  * • Upload CV on behalf of the jobseeker (staff, 958)
  * • View confirmation of a successful CV upload (jobseeker, 958)

---

#### 🔹 PWC Feature: Document management (F-074)
* **Included in foundational build:** Securely stores and presents the CV and foundational application documents.
* **Assumptions:**
  * Uploaded CVs/documents directly loaded to enterprise Document Storage solution (not stored in AEM/SF/Mulesoft).
  * Malware scanning handled by Document Storage solution.
  * SF retrieves required metadata from document storage to control access.
  * Employers will be able to download CVs.
* **MVP Feature Mapping:**
  * `960 - Document Metadata and Lifecycle Management`
  * `963 - Access Controls and Security`
  * `964 - AEM Integration with Document Solutions for Client Uploads`
  * `966 - Retention and Archiving Policies for Client Documents`
* **Sequenced Release Capabilities (`R1-sequenced-release-capabilities-table.md`):**
  * • Document access Controls & Security (system, 963)
  * • Document lifecycle states (system, 960)
  * • Retention & Archiving Policies (system, 966)
  * • Document metadata capture on upload (system, 960)
  * • Scanning uploaded files for malware and security vulnerabilities (system, 958)
  * • AEM integration with Document solutions for client uploads (system, 964)

---

### 📂 Phase: Applications & Referrals

#### 🔹 PWC Feature: Apply directly for job (F-058)
* **Included in foundational build:** Jobseeker submits a direct application against a published vacancy.
* **Assumptions:**
  * Assumes no changes to current jobseeker application process for a published vacancy regardless of source channel.
* **MVP Feature Mapping:**
  * `978 - Clients can Create and Submit Applications for Direct Apply`
* **Sequenced Release Capabilities (`R1-sequenced-release-capabilities-table.md`):**
  * • Attach stored CV to application (jobseeker, 978)
  * • Apply directly for job (jobseeker, 978)
  * • View and track direct applications (jobseeker, 978)

---

#### 🔹 PWC Feature: Application lifecycle workflow (F-073)
* **Included in foundational build:** Controls core application states from submission to outcome.
* **Assumptions:**
  * Assumes no changes to current application lifecycle, including referrals.
* **MVP Feature Mapping:**
  * `971 - Clients and Staff Can View and Track Applications`
* **Sequenced Release Capabilities (`R1-sequenced-release-capabilities-table.md`):**
  * • View current and previous job applications & outcomes (jobseeker, 971)
  * • View client job applications and statuses (jobseeker, 971)
  * • View and track application status and activity (jobseeker, 971)

---

### 📂 Phase: Employer Recruitment

#### 🔹 PWC Feature: View direct vacancy applications (F-064)
* **Included in foundational build:** Employer can access applications submitted directly against their vacancy.
* **Assumptions:**
  * Assumes employers only access applications shortlisted by MSD staff as per current process.
  * Assumes information available to employer is read-only and present in SF, except CVs.
  * Assumes CV accessible via URL to Document Storage system.
* **MVP Feature Mapping:**
  * `979 - Employers and Staff can View Applications`
* **Sequenced Release Capabilities (`R1-sequenced-release-capabilities-table.md`):**
  * • View jobseeker Applications (employer, 979)
  * • View essential applicant details (JSP) (employer, 979)
  * • View Applications (employer, 979)
  * • View / Download the JSP generated CV (employer, 979)
  * • View direct vacancy applications (employer, 979)

---

#### 🔹 PWC Feature: View applicant-related email notifications (F-065)
* **Included in foundational build:** Employer is notified of relevant application events by email.
* **Assumptions:**
  * Assumes all existing application-related email notifications sent per current business rules to Vacancy Owner.
* **MVP Feature Mapping:**
  * `985 - Employers and Staff can Receive Notifications of New Applicants and Withdrawals`
* **Sequenced Release Capabilities (`R1-sequenced-release-capabilities-table.md`):**
  * • Receive email notifications of new applications and withdrawals (employer, 985)
  * • Receive Notifications of New Applicants and Withdrawals (employer, 985)
  * • Triggering email notifications for new applications, withdrawal or progression (system, 985)

---

### 📂 Phase: Manage Vacancies

#### 🔹 PWC Feature: Close vacancy (F-086)
* **Included in foundational build:** Employer or authorised staff closes the vacancy when recruitment ends.
* **Assumptions:**
  * Assumes no changes to current staff closure processes.
  * Assumes introduction of actions for employers to close/withdraw vacancies with mandatory validations.
* **MVP Feature Mapping:**
  * `972 - Employers and Staff Can Record Vacancy Outcomes and Close Vacancies`
* **Sequenced Release Capabilities (`R1-sequenced-release-capabilities-table.md`):**
  * • Extend vacancy (employer, 972)

---

### 📂 Phase: Outcomes & Support

#### 🔹 PWC Feature: View employer help content (F-089)
* **Included in foundational build:** Employer can access essential guidance for common tasks.
* **Assumptions:**
  * Assuming one source of content served to both authenticated and unauthenticated users via AEM / Salesforce Experience Cloud.
* **MVP Feature Mapping:**
  * `984 - Links to Employment Related Support Information`
* **Sequenced Release Capabilities (`R1-sequenced-release-capabilities-table.md`):**
  * • Links to employment related support information (employer, 984)
  * • Tap links to view help documents (employer, 984)

---

## 📦 Release 1.3 (MVP1.3): Interactive Recruitment & Progression
**Description:** Employer can manage application shortlisting, filtering, sorting, and recruitment outcome processes, with jobseeker application withdrawal actions.

### 📂 Phase: Employer Recruitment

#### 🔹 PWC Feature: Shortlist applicants (F-077)
* **Included in foundational build:** Employer identifies applicants to progress.
* **Assumptions:**
  * Assumes downloading applicant CVs is part of shortlisting.
  * Assumes fields for employer users to indicate progress/no-progress per applicant.
  * Assumes free-text fields screened for inappropriate language.
* **MVP Feature Mapping:**
  * `990 - Employers and Staff can Manage Applicant Progression and Outcomes`
* **Sequenced Release Capabilities (`R1-sequenced-release-capabilities-table.md`):**
  * • Shortlist / progress candidates (employer, 990)
  * • Manage Applicant Progression and Outcomes (employer, 990)

---

#### 🔹 PWC Feature: Decline applicants (F-078)
* **Included in foundational build:** Employer records that an applicant will not progress.
* **Assumptions:**
  * Assumes introduction of fields to indicate applicant progression status.
  * Assumes free-text fields screened for inappropriate/abusive language.
* **MVP Feature Mapping:**
  * `990 - Employers and Staff can Manage Applicant Progression and Outcomes`
* **Sequenced Release Capabilities (`R1-sequenced-release-capabilities-table.md`):**
  * • Shortlist / progress candidates (employer, 990)
  * • Manage Applicant Progression and Outcomes (employer, 990)

---

#### 🔹 PWC Feature: Filter and sort applicants / applications (F-079)
* **Included in foundational build:** Employer can organise applications using essential criteria.
* **Assumptions:**
  * Assumes filter and sort criteria are available in Salesforce and on relevant records.
* **MVP Feature Mapping:**
  * `980 - Employers and Staff Can Filter and Sort Applications`
* **Sequenced Release Capabilities (`R1-sequenced-release-capabilities-table.md`):**
  * • Filter and sort applications (employer, 980)
  * • Filter and Sort Applications (employer, 980)
  * • Applications sort, filtering & pagination (employer, 980)

---

### 📂 Phase: Outcomes & Support

#### 🔹 PWC Feature: Record recruitment outcome (F-085)
* **Included in foundational build:** Employer records whether recruitment succeeded and the relevant outcome.
* **Assumptions:**
  * Assumes current vacancy outcome process and fields are sufficient and exposed to employers.
  * Assumes current application outcome process for jobseekers is sufficient.
  * Assumes APIs ensuring referral/shortlisting/outcome flow to CMS are sufficient.
* **MVP Feature Mapping:**
  * `972 - Employers and Staff Can Record Vacancy Outcomes and Close Vacancies`
  * `990 - Employers and Staff can Manage Applicant Progression and Outcomes`
* **Sequenced Release Capabilities (`R1-sequenced-release-capabilities-table.md`):**
  * • Extend vacancy (employer, 972)
  * • Shortlist / progress candidates (employer, 990)
  * • Manage Applicant Progression and Outcomes (employer, 990)

---

#### 🔹 PWC Feature: Receive outcome notifications (F-090)
* **Included in foundational build:** Jobseeker receives the appropriate application/recruitment outcome notification.
* **Assumptions:**
  * Assuming generic notifications for clients and basic reason capture on employer side.
* **MVP Feature Mapping:**
  * `977 - IA / Global UX for Client Communication`
* **Sequenced Release Capabilities (`R1-sequenced-release-capabilities-table.md`):**
  * • Receive application-related notifications (jobseeker, 977)

---

## 📦 Release 1.9 (MVP1.9 / GA & Scale-Up): General Availability & Scale-Up
**Description:** Scale up - new and existing employers can self-register digitally (Option 1B) and post vacancies including immigration. Captures self-service registration, role management, non-transactional employer help resources, and advanced vacancy utilities.

### 📂 Phase: Onboarding via invite

#### 🔹 PWC Feature: Send bulk invite campaign (F-003)
* **Included in foundational build:** Staff can issue invitations to an agreed employer cohort in bulk.
* **Assumptions:**
  * Based on assumption that only up to 10 users (2–3 organisations) will be invited manually for Release 1.
* **MVP Feature Mapping:**
  * `938 - Staff can Create and Manage Additional Employer Portal Users`
* **Sequenced Release Capabilities (`R1-sequenced-release-capabilities-table.md`):**
  * • Create and manage additional users (staff, 938)

---

### 📂 Phase: Access & onboarding

#### 🔹 PWC Feature: Browse landing-page content (F-005)
* **Included in foundational build:** Basic public content explains the service and how an employer accesses it.
* **Assumptions:**
  * Assumes content pages and fragments delivered as part of feature.
  * Assumes use of existing design/style systems.
* **MVP Feature Mapping:**
  * `1052 - Public Employer Landing Page and Service Proposition`
* **Sequenced Release Capabilities (`R1-sequenced-release-capabilities-table.md`):**
  * • Landing page content & content migration (system, 1052)
  * • Browse landing / home page content (employer, 1052)

---

#### 🔹 PWC Feature: Register for portal self-service (F-009)
* **Included in foundational build:** Invited or new self-registering employer completes information to activate portal access.
* **Assumptions:**
  * Unauthenticated open-market self-registration journey.
* **MVP Feature Mapping:**
  * `951 - Register for the Employer Portal - New organisation (Option 1B)`
  * `991 - Register for the Employer Portal - Existing employment relationship`
* **Sequenced Release Capabilities (`R1-sequenced-release-capabilities-table.md`):**
  * • Electronic T&Cs acceptance (employer, 951)
  * • Register for the Employer Portal - New organisation (employer, 951)
  * • Salesforce-to-portal organisation record provisioning (system, 951)
  * • Allocate employer primary contact (staff, 991)
  * • Portal registration for existing employers (employer, 991)

---

#### 🔹 PWC Feature: Register company and contacts (F-010)
* **Included in foundational build:** Staff or self-service can establish or locate the organisation and core contact records.
* **Assumptions:**
  * Minimum dataset required to establish or locate organisation.
* **MVP Feature Mapping:**
  * `951 - Register for the Employer Portal - New organisation (Option 1B)`
  * `991 - Register for the Employer Portal - Existing employment relationship`
* **Sequenced Release Capabilities (`R1-sequenced-release-capabilities-table.md`):**
  * • Electronic T&Cs acceptance (employer, 951)
  * • Register for the Employer Portal - New organisation (employer, 951)

---

#### 🔹 PWC Feature: Verify employer (F-011)
* **Included in foundational build:** Staff or automated mechanisms verify organisation and user legitimacy.
* **Assumptions:**
  * Verification status and authority handling for organization legitimacy.
* **MVP Feature Mapping:**
  * `948 - Employer Verification Methods (Option 1B)`
* **Sequenced Release Capabilities (`R1-sequenced-release-capabilities-table.md`):**
  * • Record manual verification outcome (staff, 948)
  * • Staff-led Manual employer verification (staff, 948)
  * • Verification outcome recording (staff, 948)

---

#### 🔹 PWC Feature: Landing-page content management (F-013)
* **Included in foundational build:** Supports publishing and maintaining essential public access content.
* **Assumptions:**
  * Managed via AEM; English-only scope; existing VD1 content workflows reused.
* **MVP Feature Mapping:**
  * `1052 - Public Employer Landing Page and Service Proposition`
* **Sequenced Release Capabilities (`R1-sequenced-release-capabilities-table.md`):**
  * • Landing page content & content migration (system, 1052)
  * • Browse landing / home page content (employer, 1052)

---

### 📂 Phase: Employer Profile & Portal

#### 🔹 PWC Feature: View and edit user profile (F-016)
* **Included in foundational build:** User maintains their own basic personal and contact details.
* **Assumptions:**
  * Dependency on MDM for self-service edits; CMS-mastered fields remain read-only.
* **MVP Feature Mapping:**
  * `945 - Employer User Contact Details`
* **Sequenced Release Capabilities (`R1-sequenced-release-capabilities-table.md`):**
  * • View & edit contact preferences (employer, 945)
  * • View and update user profile & preferences (employer, 945)
  * • View & edit user profile (employer, 945)

---

#### 🔹 PWC Feature: View and edit contact preferences (F-017)
* **Included in foundational build:** User maintains essential contact preferences.
* **Assumptions:**
  * Dependency on MDM for self-service edits; email-only contact preference assumptions.
* **MVP Feature Mapping:**
  * `945 - Employer User Contact Details`
* **Sequenced Release Capabilities (`R1-sequenced-release-capabilities-table.md`):**
  * • View & edit contact preferences (employer, 945)

---

#### 🔹 PWC Feature: View and edit organisation profile (F-018)
* **Included in foundational build:** Employer can view organisation data and update permitted low-risk fields.
* **Assumptions:**
  * Assuming no direct editing of controlled fields until MDM is in place.
* **MVP Feature Mapping:**
  * `942 - Maintain Employer Organisation Details`
* **Sequenced Release Capabilities (`R1-sequenced-release-capabilities-table.md`):**
  * • View and update agreed low-risk organisation information (employer, 942)
  * • Update controlled org data (staff, 942)
  * • Sharing org data to vacancy and recruitment flows (system, 942)
  * • Enforcing validation and permissions for profile updates (system, 942)
  * • View and update org profile & preferences (employer, 942)

---

#### 🔹 PWC Feature: Manage and invite additional users (F-020)
* **Included in foundational build:** Employer can add or manage additional users at a basic level.
* **Assumptions:**
  * Single user profile initially; employer self-administration delivered in later release.
* **MVP Feature Mapping:**
  * `952 - Employers Can Invite and Manage Additional Portal Users`
* **Sequenced Release Capabilities (`R1-sequenced-release-capabilities-table.md`):**
  * • Assign / reassign org primary contact (employer, 952)
  * • Manage and invite additional users (employer, 952)

---

#### 🔹 PWC Feature: Maintain enterprise data (F-026)
* **Included in foundational build:** Staff maintain controlled organisation information in authoritative environment.
* **Assumptions:**
  * Staff maintain controlled organisation information in CMS/Salesforce.
* **MVP Feature Mapping:**
  * `942 - Maintain Employer Organisation Details`
  * `962 - Salesforce–CMS Integration for Release 1`
* **Sequenced Release Capabilities (`R1-sequenced-release-capabilities-table.md`):**
  * • Update controlled org data (staff, 942)
  * • Reconciling and maintaining employer records consistently across Salesforce and CMS (system, 962)

---

#### 🔹 PWC Feature: View organisation compliance (F-029)
* **Included in foundational build:** Staff can access minimum compliance information needed for decisions.
* **Assumptions:**
  * Assumes key interactions are logged and available to audit in relation to verification.
* **MVP Feature Mapping:**
  * `953 - Staff can View Organisation Compliance`
* **Sequenced Release Capabilities (`R1-sequenced-release-capabilities-table.md`):**
  *(Mapped under Release 2+ in table)*

---

### 📂 Phase: Outcomes & Support

#### 🔹 PWC Feature: Request support enquiry (F-087)
* **Included in foundational build:** Employer can submit a basic support request.
* **Assumptions:**
  * Salesforce OOTB case form with <20 fields; assigned to new staff queue; no automated SLAs.
* **MVP Feature Mapping:**
  * `969 - Employers Can Request Support`
* **Sequenced Release Capabilities (`R1-sequenced-release-capabilities-table.md`):**
  * • Submit a simple support request for a specific vacancy (employer, 969)
  * • Submit a simple support request (employer, 969)

---

#### 🔹 PWC Feature: View status of support enquiries (F-088)
* **Included in foundational build:** Employer can see basic indication that enquiry is open or resolved.
* **Assumptions:**
  * OOTB SF Service Cloud ticketing capability; lifecycle of 4–5 stages; no complex workflows.
* **MVP Feature Mapping:**
  * `969 - Employers Can Request Support`
* **Sequenced Release Capabilities (`R1-sequenced-release-capabilities-table.md`):**
  * • Submit a simple support request (employer, 969)

---

#### 🔹 PWC Feature: Support enquiry status and queue management (F-092)
* **Included in foundational build:** Staff can receive, allocate, and resolve foundational employer enquiries.
* **Assumptions:**
  * OOTB SF Service Cloud ticketing; staff can pick up and reassign requests.
* **MVP Feature Mapping:**
  * `969 - Employers Can Request Support`
* **Sequenced Release Capabilities (`R1-sequenced-release-capabilities-table.md`):**
  * • Submit a simple support request (employer, 969)
