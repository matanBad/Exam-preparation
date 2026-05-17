import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, notificationsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

function serialize(n: typeof notificationsTable.$inferSelect) {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    message: n.message,
    relatedEntityType: n.relatedEntityType,
    relatedEntityId: n.relatedEntityId,
    status: n.status,
    createdAt: n.createdAt.toISOString(),
    readAt: n.readAt ? n.readAt.toISOString() : null,
  };
}

router.get(
  "/notifications",
  requireAuth,
  async (req, res): Promise<void> => {
    const rows = await db
      .select()
      .from(notificationsTable)
      .where(eq(notificationsTable.userId, req.auth!.userId))
      .orderBy(desc(notificationsTable.createdAt))
      .limit(100);
    res.json(rows.map(serialize));
  },
);

router.patch(
  "/notifications/read-all",
  requireAuth,
  async (req, res): Promise<void> => {
    const updated = await db
      .update(notificationsTable)
      .set({ status: "read", readAt: new Date() })
      .where(
        and(
          eq(notificationsTable.userId, req.auth!.userId),
          eq(notificationsTable.status, "unread"),
        ),
      )
      .returning({ id: notificationsTable.id });
    res.json({ updated: updated.length });
  },
);

router.patch(
  "/notifications/:id/read",
  requireAuth,
  async (req, res): Promise<void> => {
    const id = Number.parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const [updated] = await db
      .update(notificationsTable)
      .set({ status: "read", readAt: new Date() })
      .where(
        and(
          eq(notificationsTable.id, id),
          eq(notificationsTable.userId, req.auth!.userId),
        ),
      )
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Notification not found" });
      return;
    }
    res.json(serialize(updated));
  },
);

export default router;
