import { and, desc, eq, gte, isNull } from "drizzle-orm";
import { db, notificationsTable, usersTable } from "@workspace/db";

type NotifyInput = {
  userId: number;
  type: string;
  title: string;
  message: string;
  relatedEntityType?: string | null;
  relatedEntityId?: number | null;
  actionUrl?: string | null;
};

export async function createNotification(input: NotifyInput): Promise<number> {
  const [row] = await db
    .insert(notificationsTable)
    .values({
      userId: input.userId,
      type: input.type,
      title: input.title,
      message: input.message,
      relatedEntityType: input.relatedEntityType ?? null,
      relatedEntityId: input.relatedEntityId ?? null,
      actionUrl: input.actionUrl ?? null,
    })
    .returning({ id: notificationsTable.id });
  return row!.id;
}

export async function notifyUsersByRole(
  role: "student" | "lecturer" | "admin",
  payload: Omit<NotifyInput, "userId">,
): Promise<void> {
  const recipients = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.role, role));
  if (recipients.length === 0) return;
  await db.insert(notificationsTable).values(
    recipients.map((r) => ({
      userId: r.id,
      type: payload.type,
      title: payload.title,
      message: payload.message,
      relatedEntityType: payload.relatedEntityType ?? null,
      relatedEntityId: payload.relatedEntityId ?? null,
      actionUrl: payload.actionUrl ?? null,
    })),
  );
}

type DedupInput = NotifyInput & {
  // Restrict the duplicate-check to notifications created at/after this instant.
  // Used by per-day notifications (e.g. study reminders) so a new one can be
  // created once the window rolls over.
  since?: Date;
};

// Create a notification only if an equivalent one does not already exist for the
// user. Equivalence = same type + same relatedEntityType + same relatedEntityId,
// optionally constrained by a time window (`since`). Returns the id of the
// existing or newly-created row.
//
// This is the single choke point for notification de-duplication across the
// engagement service: milestones, streaks, weak-area alerts and study reminders
// all route through here so a refresh / re-run never produces duplicates. Entity
// alerts (weak_area_alert, recommendation_alert) dedup permanently by entity —
// read state does not reset the dedup, so one weakness yields exactly one alert.
export async function createNotificationIfNotExists(
  input: DedupInput,
): Promise<{ id: number; created: boolean }> {
  const conditions = [
    eq(notificationsTable.userId, input.userId),
    eq(notificationsTable.type, input.type),
  ];
  if (input.relatedEntityType == null) {
    conditions.push(isNull(notificationsTable.relatedEntityType));
  } else {
    conditions.push(
      eq(notificationsTable.relatedEntityType, input.relatedEntityType),
    );
  }
  if (input.relatedEntityId == null) {
    conditions.push(isNull(notificationsTable.relatedEntityId));
  } else {
    conditions.push(
      eq(notificationsTable.relatedEntityId, input.relatedEntityId),
    );
  }
  if (input.since) {
    conditions.push(gte(notificationsTable.createdAt, input.since));
  }

  const [existing] = await db
    .select({ id: notificationsTable.id })
    .from(notificationsTable)
    .where(and(...conditions))
    .orderBy(desc(notificationsTable.createdAt))
    .limit(1);
  if (existing) {
    return { id: existing.id, created: false };
  }

  const id = await createNotification(input);
  return { id, created: true };
}
