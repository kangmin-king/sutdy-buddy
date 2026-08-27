# Student Home Redesign Tasks

- [x] Add failing view-model tests
- [x] Implement the view model
- [x] Verify focused and full tests
- [x] Replace student-home hierarchy
- [x] Verify empty, active, paused, completed, long-content, proposal, and missed-work states
- [x] Run build
- [x] Run code review
- [x] Record verification evidence


## Verification Evidence (2026-08-21)

- Focused model test: 11/11 passed.
- Full test suite: 95/95 passed.
- Production build: passed (tsc -b and vite build).
- Code review: no Critical issues; mobile hierarchy and accessibility feedback resolved.
- Browser visual QA: empty, active, paused/resume, and refresh recovery verified at mobile width; completed and long-content states remain for manual confirmation.
## Session Recovery Verification (2026-08-26)

- Reproduced refresh loss after starting a study session.
- Added RED tests for visible newest-session recovery, stale-session normalization, and single-running-item enforcement.
- Browser verified start, refresh recovery at 24:30, pause, and preserved accumulated time.
- Final code review found no remaining actionable issues.
## UI refinement verification (2026-08-26)

- Increased primary and conditional action hit areas to at least 44px.
- Replaced punitive missed-work styling and copy with a calm neutral treatment.
- Added deterministic same-timestamp session recovery coverage.
- Confirmed Android-only distraction entry and no web FAB.
- Full test suite: 95/95 passed; production build passed.

## Action hierarchy refinement (2026-08-26)

- Moved homework proposals and yesterday's remaining study above tertiary utilities.
- Replaced icon-only proposal decisions with 44px text actions.
- Allowed long next-study details to wrap instead of truncating.
- Browser verified a 480px app shell, aligned content, six refined 44px actions, and the expected content order.
- Full test suite: 95/95 passed; production build passed.

## Today-list bottom sheet refinement (2026-08-26)

- Replaced the visually disconnected dark top overlay with a calm light bottom sheet.
- Added completed/remaining summary, item status semantics, long-content wrapping, and an empty state.
- Added dialog labeling, 44px close target, focus trap/restore, backdrop and Escape closing, safe-area padding, and Android hardware-back closing.
- Full test suite: 95/95 passed; production build passed.
- Final browser visual check is pending because the local remote-debugging daemon disconnected after Chrome requested permission again.

## Edge final visual verification (2026-08-27)

- Connected browser-harness directly to the isolated Edge CDP endpoint on port 9224.
- Confirmed authenticated student home rendering in a 480px app shell.
- Verified bottom sheet width/bottom alignment, 44px close target, Tab trap, Escape close, and trigger focus restoration.
- Verified a 390px constrained app shell has no horizontal overflow.
- Increased TopAppBar notification/logout hit targets from 36px to 44px and verified both in Edge.
- Full test suite: 104/104 passed; production build passed; final review found no Critical/Important issues.

## Learning tools consolidation (2026-08-27)

- Replaced per-item completion segments with one scalable continuous progress track.
- Consolidated invite code, linked managers, mock exam, and today-list entry into a low-emphasis learning-tools section.
- Increased manager label edit controls to 44px touch targets without changing edit behavior.
- Edge verification: mock/todo actions aligned at 44px; 390px constrained shell has no horizontal overflow.
- Full test suite: 104/104 passed; production build passed; final review found no Critical/Important issues.

## Final visual polish (2026-08-27)

- Aligned TopAppBar logo and body content while preserving sticky behavior through a direct negative-margin class.
- Added a clear homework-proposal section heading/count and student-friendly M월 D일 dates.
- Hardened long proposal and missed-study text wrapping at narrow widths.
- Edge verification: logo/body alignment exact, 390px constrained shell has no horizontal overflow, learning-tool action remains 44px.
- Final full suite: 104/104 passed; production build passed; final review found no Critical/Important issues.

## Conditional-state final QA (2026-08-27)

- Injected browser-only fixtures without changing Supabase data or leaving a product QA branch.
- Verified four today items including one completed item, elapsed time, two long next-study rows, two homework proposals, and long missed-study content.
- Found and fixed proposal ranges being hidden whenever material existed.
- Expanded missed-study context from material-only to the shared material/unit/page-range detail contract.
- Verified 390px and 360px app shells have no root horizontal overflow and all visible buttons remain at least 44px high.
- Removed all browser fixtures and restored the authenticated Edge session to live account data.
- Browser QA recording: `student-home-conditional-qa` (6 frames).
- Full test suite: 104/104 passed; production build passed.
