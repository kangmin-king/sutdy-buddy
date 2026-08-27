# Student Home Redesign Context

Last Updated: 2026-08-27 13:43 KST

## Source priority

1. `docs/PRD.md` and currently working product behavior
2. Approved `STUDYBUKS Design & Product Handoff`
3. Historical mockups and conversations

## Core files

- `src/screens/student/StudentHome.tsx`: current student home UI and timer interaction.
- `src/state/AppStateContext.tsx`: Supabase data/actions; preserve in this phase.
- `src/App.tsx`: role shell, overlays, and three-tab IA.
- `src/screens/student/MockExamTimer.tsx`: independent countdown timer.
- `src/lib.ts`: missed-homework redistribution and shared selectors.

## Decisions

- Phase 1 changes presentation only; no schema, RLS, Edge Function, or product feature changes.
- Current study is the running item if one exists, otherwise the first incomplete item.
- Other incomplete items become the next-work list.
- Existing banner, linking, proposal, missed-work, mock timer, and distraction entry remain reachable.
- Navy/blue is applied through replaceable existing tokens, not embedded in data logic.


## 2026-08-21 implementation state

- StudentHome.tsx now renders completion summary, current study, then next study before secondary utilities.
- studentHomeModel.ts exposes accumulated seconds for every visible item.
- Existing timer, proposal, missed-work, mock timer, banner, invite, manager, todo overlay, and distraction-stop actions remain wired.
- Automated tests and build pass; browser visual QA still requires Chrome remote-debugging permission.
## Session recovery decision

- Recover only the newest unfinished session among today's incomplete items.
- Normalize older visible unfinished sessions to end at the next session's start time.
- Enforce one globally running study item in both the UI disabled state and start handler.
## 2026-08-26 UI refinement decisions

- Keep current study dominant; next-study actions use explicit text and 44px touch targets.
- Use calm neutral copy for missed study instead of error/red treatment.
- Keep distraction-stop entry Android-only through isNativePlatform().
- Resolve equal-timestamp unfinished sessions with one deterministic comparator for recovery and stale cleanup.

## Today-list overlay decision

- Preserve the existing read-only today-list action, but present it as a mobile bottom sheet rather than a dark top drawer.
- Treat it as a real modal: constrain width, trap and restore focus, support Escape/backdrop close, and intercept Android hardware back while open.

## Edge verification decision

- Use the isolated Edge CDP endpoint when the default Chrome remote-debugging permission flow is unavailable.
- Restore bottom-sheet focus only after the closed DOM state commits, using a zero-delay timer owned and cleaned up by the effect.
- Treat all TopAppBar icon actions as 44px minimum touch targets.

## Learning-tools hierarchy decision

- Keep progress visually calm and scalable with a single continuous task-completion track.
- Group tertiary utilities into one learning-tools surface after banners and conditional action sections.
- Preserve every utility action while preventing invite/manager/mock/todo controls from competing with current study.

## Final student-home visual contract

- TopAppBar and content share one 20px visual alignment line without wrapping sticky headers.
- Homework proposals are a named conditional action section with compact local dates and explicit receive/reject actions.
- Current study remains the only elevated primary surface; next study and utilities remain progressively quieter.

## Conditional-state visual contract

- Homework proposals show both material and assigned range so students can judge workload before accepting.
- Missed-study rows show material, unit, and page range before the carry-over action.
- Long Korean content, multiple proposals, and multiple study items must not create horizontal overflow at 390px or 360px.
