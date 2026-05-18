import { Router, type IRouter } from "express";
import { eq, inArray } from "drizzle-orm";
import {
  db,
  coursesTable,
  courseOfferingsTable,
  usersTable,
} from "@workspace/db";

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
    if (req.auth!.role === "student" && req.auth!.userId !== id) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    // Strategy A: course access derives from course_offerings, not enrollments.
    const [target] = await db
      .select({ id: usersTable.id, role: usersTable.role, programId: usersTable.programId })
      .from(usersTable)
      .where(eq(usersTable.id, id));
    if (!target) {
      res.json([]);
      return;
    }
    let courseIds: number[] = [];
    if (target.role === "student") {
      if (!target.programId) {
        res.json([]);
        return;
      }
      const rows = await db
        .selectDistinct({ courseId: courseOfferingsTable.courseId })
        .from(courseOfferingsTable)
        .where(eq(courseOfferingsTable.programId, target.programId));
      courseIds = rows.map((r) => r.courseId);
    } else if (target.role === "lecturer") {
      const rows = await db
        .selectDistinct({ courseId: courseOfferingsTable.courseId })
        .from(courseOfferingsTable)
        .where(eq(courseOfferingsTable.lecturerId, target.id));
      courseIds = rows.map((r) => r.courseId);
    } else {
      // admin -> all courses
      const rows = await db.select({ id: coursesTable.id }).from(coursesTable);
      courseIds = rows.map((r) => r.id);
    }
    const courses = courseIds.length
      ? await db
          .select()
          .from(coursesTable)
          .where(inArray(coursesTable.id, courseIds))
      : [];
    res.json(courses);
  },
);

export default router;
