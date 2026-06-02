import { and, eq } from "drizzle-orm";
import {
  db,
  usersTable,
  courseOfferingsTable,
  enrollmentsTable,
} from "@workspace/db";

// Strategy A access check: a student may access a course only if it is offered
// in their program AND they hold an active enrollment in it. Returns an error
// object to send (with the given status) or null when access is allowed.
export async function checkStudentCourseAccess(
  userId: number,
  courseId: number,
): Promise<{ status: number; error: string } | null> {
  const [me] = await db
    .select({ programId: usersTable.programId })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  if (!me?.programId) {
    return { status: 403, error: "Student is not assigned to a program" };
  }
  const [off] = await db
    .select({ id: courseOfferingsTable.id })
    .from(courseOfferingsTable)
    .where(
      and(
        eq(courseOfferingsTable.courseId, courseId),
        eq(courseOfferingsTable.programId, me.programId),
      ),
    );
  if (!off) {
    return { status: 403, error: "This course is not offered in your program" };
  }
  const [enr] = await db
    .select({ id: enrollmentsTable.id })
    .from(enrollmentsTable)
    .where(
      and(
        eq(enrollmentsTable.userId, userId),
        eq(enrollmentsTable.courseId, courseId),
        eq(enrollmentsTable.enrollmentStatus, "active"),
      ),
    );
  if (!enr) {
    return { status: 403, error: "You are not enrolled in this course" };
  }
  return null;
}

// All course ids a student may currently access under Strategy A: offered in
// their program and actively enrolled. Returns an empty set when the student
// has no program. Used to filter analytics/recommendations to visible courses.
export async function getAccessibleCourseIds(
  userId: number,
): Promise<Set<number>> {
  const [me] = await db
    .select({ programId: usersTable.programId })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  if (!me?.programId) return new Set();

  const rows = await db
    .select({ courseId: enrollmentsTable.courseId })
    .from(enrollmentsTable)
    .innerJoin(
      courseOfferingsTable,
      and(
        eq(courseOfferingsTable.courseId, enrollmentsTable.courseId),
        eq(courseOfferingsTable.programId, me.programId),
      ),
    )
    .where(
      and(
        eq(enrollmentsTable.userId, userId),
        eq(enrollmentsTable.enrollmentStatus, "active"),
      ),
    );
  return new Set(rows.map((r) => r.courseId));
}
