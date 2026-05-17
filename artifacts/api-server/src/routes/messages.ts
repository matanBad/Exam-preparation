import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, messagesTable, usersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

type MessageRow = typeof messagesTable.$inferSelect;

function serialize(m: MessageRow, senderName: string | null) {
  return {
    id: m.id,
    senderId: m.senderId,
    senderName,
    subject: m.subject,
    body: m.body,
    status: m.status,
    createdAt: m.createdAt.toISOString(),
    readAt: m.readAt ? m.readAt.toISOString() : null,
  };
}

router.get(
  "/messages",
  requireAuth,
  async (req, res): Promise<void> => {
    const rows = await db
      .select({
        msg: messagesTable,
        senderName: usersTable.fullName,
      })
      .from(messagesTable)
      .leftJoin(usersTable, eq(usersTable.id, messagesTable.senderId))
      .where(eq(messagesTable.recipientId, req.auth!.userId))
      .orderBy(desc(messagesTable.createdAt))
      .limit(100);
    res.json(rows.map((r) => serialize(r.msg, r.senderName)));
  },
);

router.patch(
  "/messages/read-all",
  requireAuth,
  async (req, res): Promise<void> => {
    const updated = await db
      .update(messagesTable)
      .set({ status: "read", readAt: new Date() })
      .where(
        and(
          eq(messagesTable.recipientId, req.auth!.userId),
          eq(messagesTable.status, "unread"),
        ),
      )
      .returning({ id: messagesTable.id });
    res.json({ updated: updated.length });
  },
);

router.patch(
  "/messages/:id/read",
  requireAuth,
  async (req, res): Promise<void> => {
    const id = Number.parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const [updated] = await db
      .update(messagesTable)
      .set({ status: "read", readAt: new Date() })
      .where(
        and(
          eq(messagesTable.id, id),
          eq(messagesTable.recipientId, req.auth!.userId),
        ),
      )
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Message not found" });
      return;
    }
    const [sender] = updated.senderId
      ? await db
          .select({ fullName: usersTable.fullName })
          .from(usersTable)
          .where(eq(usersTable.id, updated.senderId))
      : [];
    res.json(serialize(updated, sender?.fullName ?? null));
  },
);

export default router;
