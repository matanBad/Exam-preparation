import { Router, type IRouter } from "express";
import { eq, inArray } from "drizzle-orm";
import { db, coursesTable, enrollmentsTable } from "@workspace/db";

import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.get(
  "/users/:id/courses",
  requireAuth,
  async (req, res): Promise<void> => {
    const idRaw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(idRaw, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    if (
      req.auth!.role === "student" &&
      req.auth!.userId !== id
    ) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const enrolled = await db
      .select({ courseId: enrollmentsTable.courseId })
      .from(enrollmentsTable)
      .where(eq(enrollmentsTable.userId, id));
    const ids = enrolled.map((e) => e.courseId);
    const courses = ids.length
      ? await db.select().from(coursesTable).where(inArray(coursesTable.id, ids))
      : [];
    res.json(courses);
  },
);

export default router;
