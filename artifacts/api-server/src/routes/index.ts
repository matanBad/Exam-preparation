import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import coursesRouter from "./courses";
import questionsRouter from "./questions";
import examsRouter from "./exams";
import usersRouter from "./users";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(coursesRouter);
router.use(questionsRouter);
router.use(examsRouter);
router.use(usersRouter);
router.use(adminRouter);

export default router;
