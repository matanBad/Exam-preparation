import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, programsTable } from "@workspace/db";
import {
  ListProgramsResponse,
  CreateProgramBody,
  ListProgramsResponseItem,
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/programs", requireAuth, async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(programsTable)
    .where(eq(programsTable.status, "active"));
  res.json(ListProgramsResponse.parse(rows));
});

router.post(
  "/programs",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const parsed = CreateProgramBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [existing] = await db
      .select({ id: programsTable.id })
      .from(programsTable)
      .where(eq(programsTable.code, parsed.data.code));
    if (existing) {
      res.status(409).json({ error: "Program code already in use" });
      return;
    }
    const [created] = await db
      .insert(programsTable)
      .values({
        name: parsed.data.name,
        code: parsed.data.code,
        status: parsed.data.status ?? "active",
      })
      .returning();
    res.status(201).json(ListProgramsResponseItem.parse(created));
  },
);

export default router;
