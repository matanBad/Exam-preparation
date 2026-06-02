import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import coursesRouter from "./courses";
import questionsRouter from "./questions";
import examsRouter from "./exams";
import usersRouter from "./users";
import adminRouter from "./admin";
import notificationsRouter from "./notifications";
import messagesRouter from "./messages";
import programsRouter from "./programs";
import practiceRouter from "./practice";
import analyticsRouter from "./analytics";
import recommendationsRouter from "./recommendations";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(programsRouter);
router.use(coursesRouter);
router.use(questionsRouter);
router.use(examsRouter);
router.use(practiceRouter);
router.use(analyticsRouter);
router.use(recommendationsRouter);
router.use(dashboardRouter);
router.use(usersRouter);
router.use(adminRouter);
router.use(notificationsRouter);
router.use(messagesRouter);

export default router;
