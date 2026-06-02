---
name: Engagement notification dedup
description: How weak-area / recommendation / reminder notifications avoid duplicates in the engagement service.
---

# Engagement notification de-duplication

All engagement notifications route through `createNotificationIfNotExists` in
`artifacts/api-server/src/lib/notifications.ts`. Equivalence = same `userId` +
`type` + `relatedEntityType` + `relatedEntityId`, optionally narrowed by a
`since` time window.

## Rules

- **Entity alerts** (`weak_area_alert`, `recommendation_alert`) dedup
  **permanently by entity** — one weakness/recommendation yields exactly one
  alert, ever. Do NOT reintroduce a read-state-based dedup.
  **Why:** an earlier `onlyWhileUnread` flag let a fresh alert regenerate after
  the student marked the previous one read, which violated the "no duplicate
  weak_area_alerts" requirement. The flag was removed.
- **Study reminders** dedup per calendar day via `since: startOfToday()` so a
  new one can be created once the day rolls over (max 1/day).
- **Milestones** dedup via the `student_milestones` unique `(userId,
  milestoneKey)` index; a notification is only emitted when a fresh milestone
  row is actually inserted.

## How to apply

When adding a new engagement notification, decide its dedup scope: permanent
(entity), per-window (`since`), or unique-index-gated (milestones). There is no
DB-level unique constraint on notifications, so dedup is check-then-insert —
acceptable here because dashboard loads are low-concurrency per user.
