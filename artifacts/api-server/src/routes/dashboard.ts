import { Router, type IRouter } from "express";
import {
  GetStudentDashboardAnalyticsResponse,
  GetStudentCourseAnalyticsResponse,
  GetStudentCourseAnalyticsParams,
  GetLecturerDashboardAnalyticsResponse,
  GetLecturerCourseAnalyticsResponse,
  GetLecturerCourseAnalyticsParams,
  GetLecturerStudentCourseDetailResponse,
  GetLecturerStudentCourseDetailParams,
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/auth";
import { getStudentDashboardAnalytics } from "../lib/dashboard";
import { getStudentCourseAnalytics } from "../lib/student-course-analytics";
import { checkStudentCourseAccess } from "../lib/student-access";
import {
  getLecturerDashboard,
  getLecturerCourseAnalytics,
  getLecturerStudentCourseDetail,
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
  "/dashboard/student/course/:courseId/analytics",
  requireAuth,
  requireRole("student"),
  async (req, res): Promise<void> => {
    const { courseId } = GetStudentCourseAnalyticsParams.parse(req.params);
    const denied = await checkStudentCourseAccess(req.auth!.userId, courseId);
    if (denied) {
      res.status(denied.status).json({ error: denied.error });
      return;
    }
    const result = await getStudentCourseAnalytics(req.auth!.userId, courseId);
    res.json(GetStudentCourseAnalyticsResponse.parse(result));
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

router.get(
  "/dashboard/lecturer/course/:courseId/student/:studentId",
  requireAuth,
  requireRole("lecturer", "admin"),
  async (req, res): Promise<void> => {
    const { courseId, studentId } =
      GetLecturerStudentCourseDetailParams.parse(req.params);
    if (req.auth!.role === "lecturer") {
      const taught = await getLecturerCourseIds(req.auth!.userId);
      if (!taught.has(courseId)) {
        res.status(403).json({ error: "You do not teach this course." });
        return;
      }
    }
    const result = await getLecturerStudentCourseDetail(courseId, studentId);
    if (!result) {
      res
        .status(404)
        .json({ error: "Student is not enrolled in this course." });
      return;
    }
    res.json(GetLecturerStudentCourseDetailResponse.parse(result));
  },
);

export default router;
