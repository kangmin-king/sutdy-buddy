# Student Home Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans task-by-task.

**Goal:** Replace the student home presentation with an execution-first hierarchy while preserving every existing data, timer, proposal, redistribution, push, and navigation contract.

**Architecture:** Keep `AppStateContext` actions and Supabase contracts unchanged. Add a pure student-home view-model module that selects current, next, completed, and elapsed states; render those states in `StudentHome.tsx` using the existing primitives and Tailwind tokens.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Vitest, Supabase, Capacitor.

**Spec:** `docs/PRD.md` plus the approved `STUDYBUKS Design & Product Handoff` supplied in the task.

## Global Constraints

- Preserve the student tabs in the order calendar, home, planner.
- General study time is accumulated elapsed time, never a countdown or goal percentage.
- Preserve homework origin, self-plan origin, proposals, missed-work redistribution, mock timer entry, banners, manager links, distraction stop, and global error handling.
- Do not add product features or database migrations.
- Do not change Supabase/RLS contracts in this phase.

---

### Task 1: Lock the student-home selection contract

**Files:**
- Create: `src/screens/student/studentHomeModel.ts`
- Create: `src/screens/student/studentHomeModel.test.ts`

**Interfaces:**
- Produces: `buildStudentHomeModel(items, sessionsByItemId, runningSessionIds, nowMs)`.
- Returns: completion counts, current item, next items, and per-item accumulated seconds.

- [ ] Write tests for empty, first-item, running-item, paused-item, completed-item, and multiple-session accumulation.
- [ ] Run the focused test and confirm failure because the module is missing.
- [ ] Implement the pure selector with stable order and no mutation.
- [ ] Run the focused test and the complete test suite.

### Task 2: Replace the student-home hierarchy

**Files:**
- Modify: `src/screens/student/StudentHome.tsx`

**Interfaces:**
- Consumes: `buildStudentHomeModel` from Task 1.
- Preserves: all existing `actions` calls and overlay/navigation callbacks.

- [ ] Render the daily completion summary first.
- [ ] Render one current/first study area with subject, origin, material/range, accumulated time, and the valid state action.
- [ ] Render remaining work as lower-emphasis rows with direct start actions.
- [ ] Keep proposals, missed work, mock timer, banner, invite code, manager chips, and distraction integration available at lower hierarchy.
- [ ] Verify long text, empty state, and safe-area spacing.

### Task 3: Regression verification

**Files:**
- Modify only if a failing regression test exposes a defect.

- [ ] Run `npm test` and require a clean pass.
- [ ] Run `npm run build` and require a clean pass.
- [ ] Exercise start, pause, resume, complete, proposal accept/reject, missed-work copy, tabs, and mock timer in the local app.
- [ ] Review the diff for accidental data/action changes.
- [ ] Request a code review and resolve every actionable issue.

