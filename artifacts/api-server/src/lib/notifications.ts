import { eq } from "drizzle-orm";
import { db, notificationsTable, usersTable } from "@workspace/db";

type NotifyInput = {
  userId: number;
  type: string;
  title: string;
  message: string;
  relatedEntityType?: string | null;
  relatedEntityId?: number | null;
};

export async function createNotification(input: NotifyInput): Promise<void> {
  await db.insert(notificationsTable).values({
    userId: input.userId,
    type: input.type,
    title: input.title,
    message: input.message,
    relatedEntityType: input.relatedEntityType ?? null,
    relatedEntityId: input.relatedEntityId ?? null,
  });
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
    })),
  );
}
