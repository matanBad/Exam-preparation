import { Router, type IRouter } from "express";
import {
  GetStudentDashboardAnalyticsResponse,
  GetLecturerDashboardAnalyticsResponse,
  GetLecturerCourseAnalyticsResponse,
  GetLecturerCourseAnalyticsParams,
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/auth";
import { getStudentDashboardAnalytics } from "../lib/dashboard";
import {
  getLecturerDashboard,
  getLecturerCourseAnalytics,
  getLecturerCourseIds,
  courseExists,
} from "../lib/lecturer-analytics";

const router: IRouter = Router();

router.get(
  "/dashboard/student/analytics",
  requireAuth,
  requireRole("student"),
  async (req, res): Promise<void> => {
    const result = await getStudentDashboardAnalytics(req.auth!.userId);
    res.json(GetStudentDashboardAnalyticsResponse.parse(result));
  },
);

router.get(
  "/dashboard/lecturer/analytics",
  requireAuth,
  requireRole("lecturer"),
  async (req, res): Promise<void> => {
    const result = await getLecturerDashboard(req.auth!.userId);
    res.json(GetLecturerDashboardAnalyticsResponse.parse(result));
  },
);

router.get(
  "/dashboard/lecturer/course/:courseId/analytics",
  requireAuth,
  requireRole("lecturer"),
  async (req, res): Promise<void> => {
    const lecturerId = req.auth!.userId;
    const { courseId } = GetLecturerCourseAnalyticsParams.parse(req.params);

    if (!(await courseExists(courseId))) {
      res.status(404).json({ error: "Course not found." });
      return;
    }
    const taught = await getLecturerCourseIds(lecturerId);
    if (!taught.has(courseId)) {
      res.status(403).json({ error: "You do not teach this course." });
      return;
    }

    const result = await getLecturerCourseAnalytics(lecturerId, courseId);
    res.json(GetLecturerCourseAnalyticsResponse.parse(result));
  },
);

export default router;
