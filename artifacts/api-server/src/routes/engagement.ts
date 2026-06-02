import { Router, type IRouter } from "express";
import {
  GetEngagementSummaryResponse,
  GetEngagementMilestonesResponse,
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/auth";
import {
  getEngagementSummary,
  getMilestones,
  runDashboardEngagementChecks,
} from "../lib/engagement";

const router: IRouter = Router();

router.get(
  "/engagement/summary",
  requireAuth,
  requireRole("student"),
  async (req, res): Promise<void> => {
    const userId = req.auth!.userId;
    // Opportunistic, idempotent checks (study reminders + weak-area alerts).
    // Best-effort: never throws, so it cannot fail the summary response.
    await runDashboardEngagementChecks(userId);
    const summary = await getEngagementSummary(userId);
    res.json(GetEngagementSummaryResponse.parse(summary));
  },
);

router.get(
  "/engagement/milestones",
  requireAuth,
  requireRole("student"),
  async (req, res): Promise<void> => {
    const milestones = await getMilestones(req.auth!.userId);
    res.json(GetEngagementMilestonesResponse.parse(milestones));
  },
);

export default router;
