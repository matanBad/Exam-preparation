import { Router, type IRouter } from "express";
import { and, eq, ne } from "drizzle-orm";
import {
  db,
  usersTable,
  accountDeletionRequestsTable,
  lecturerProgramsTable,
} from "@workspace/db";
import {
  LoginBody,
  LoginResponse,
  GetMeResponse,
  ChangeMyPasswordBody,
  ChangeMyEmailBody,
  ChangeMyEmailResponse,
  DeleteMyAccountBody,
  UpdateMyProfileImageBody,
  UpdateMyProfileImageResponse,
  RegisterBody,
} from "@workspace/api-zod";
import { signToken, verifyPassword, hashPassword } from "../lib/auth";
import { requireAuth } from "../middlewares/auth";
import { notifyUsersByRole } from "../lib/notifications";

const router: IRouter = Router();

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { email, password } = parsed.data;
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email.toLowerCase()));
  if (!user) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  if (user.accountStatus !== "active") {
    const msg =
      user.accountStatus === "pending"
        ? "Your account is awaiting admin approval."
        : "Account is not active";
    res.status(401).json({ error: msg });
    return;
  }
  const role = user.role as "student" | "lecturer" | "admin";
  const token = signToken({ userId: user.id, email: user.email, role });
  res.json(
    LoginResponse.parse({
      token,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role,
        accountStatus: user.accountStatus,
        profileImageUrl: user.profileImageUrl,
        programId: user.programId ?? null,
        currentStudyYear: user.currentStudyYear ?? null,
        currentSemester: user.currentSemester ?? null,
        mustChangePassword: !!user.mustChangePassword,
      },
    }),
  );
});

const STUDENT_EMAIL_DOMAIN = "@ac.sce.ac.il";

router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const fullName = parsed.data.fullName.trim();
  const email = parsed.data.email.trim().toLowerCase();
  const { password } = parsed.data;
  if (!fullName) {
    res.status(400).json({ error: "Full name is required" });
    return;
  }
  if (!email.endsWith(STUDENT_EMAIL_DOMAIN)) {
    res.status(400).json({
      error: `Student email must end with ${STUDENT_EMAIL_DOMAIN}`,
    });
    return;
  }

  const passwordHash = await hashPassword(password);
  const inserted = await db
    .insert(usersTable)
    .values({
      fullName,
      email,
      passwordHash,
      role: "student",
      accountStatus: "pending",
      programId: parsed.data.programId,
      currentStudyYear: parsed.data.currentStudyYear,
      currentSemester: parsed.data.currentSemester,
      mustChangePassword: false,
    })
    .onConflictDoNothing({ target: usersTable.email })
    .returning();
  const created = inserted[0];

  if (created) {
    try {
      await notifyUsersByRole("admin", {
        type: "user_registration",
        title: "New student registration",
        message: `${created.fullName} <${created.email}> requested an account and is awaiting approval.`,
        relatedEntityType: "user",
        relatedEntityId: created.id,
      });
    } catch (err) {
      req.log.error(
        { err, userId: created.id },
        "failed to notify admins of new registration",
      );
    }
  }

  res.status(202).json({
    message:
      "Registration received. If the email is not already in use, an administrator will review and activate the account.",
  });
});

router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.auth!.userId));
  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }
  // For lecturers, include the list of programs they teach in.
  let programIds: number[] | undefined;
  if (user.role === "lecturer") {
    const rows = await db
      .select({ programId: lecturerProgramsTable.programId })
      .from(lecturerProgramsTable)
      .where(eq(lecturerProgramsTable.lecturerId, user.id));
    programIds = rows.map((r) => r.programId);
  }
  res.json(
    GetMeResponse.parse({
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      accountStatus: user.accountStatus,
      profileImageUrl: user.profileImageUrl,
      programId: user.programId ?? null,
      currentStudyYear: user.currentStudyYear ?? null,
      currentSemester: user.currentSemester ?? null,
      mustChangePassword: !!user.mustChangePassword,
      ...(programIds !== undefined ? { programIds } : {}),
    }),
  );
});

router.patch(
  "/auth/me/password",
  requireAuth,
  async (req, res): Promise<void> => {
    const parsed = ChangeMyPasswordBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.auth!.userId));
    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }
    const ok = await verifyPassword(
      parsed.data.currentPassword,
      user.passwordHash,
    );
    if (!ok) {
      res.status(400).json({ error: "Current password is incorrect" });
      return;
    }
    const passwordHash = await hashPassword(parsed.data.newPassword);
    await db
      .update(usersTable)
      .set({
        passwordHash,
        mustChangePassword: false,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, user.id));
    res.status(204).end();
  },
);

router.patch(
  "/auth/me/email",
  requireAuth,
  async (req, res): Promise<void> => {
    const parsed = ChangeMyEmailBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.auth!.userId));
    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }
    const ok = await verifyPassword(
      parsed.data.currentPassword,
      user.passwordHash,
    );
    if (!ok) {
      res.status(400).json({ error: "Current password is incorrect" });
      return;
    }
    const newEmail = parsed.data.newEmail.toLowerCase();
    const [conflict] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(and(eq(usersTable.email, newEmail), ne(usersTable.id, user.id)));
    if (conflict) {
      res.status(409).json({ error: "Email already in use" });
      return;
    }
    const [updated] = await db
      .update(usersTable)
      .set({ email: newEmail, updatedAt: new Date() })
      .where(eq(usersTable.id, user.id))
      .returning();
    res.json(
      ChangeMyEmailResponse.parse({
        id: updated.id,
        fullName: updated.fullName,
        email: updated.email,
        role: updated.role,
        accountStatus: updated.accountStatus,
        profileImageUrl: updated.profileImageUrl,
      }),
    );
  },
);

router.patch(
  "/auth/me/profile-image",
  requireAuth,
  async (req, res): Promise<void> => {
    const parsed = UpdateMyProfileImageBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const value = parsed.data.imageDataUrl;
    if (value !== null) {
      if (
        !/^data:image\/(png|jpeg|jpg|webp);base64,/i.test(value) ||
        value.length > 3_000_000
      ) {
        res.status(400).json({
          error: "Image must be a PNG/JPEG/WebP data URL under ~2MB",
        });
        return;
      }
    }
    const [updated] = await db
      .update(usersTable)
      .set({ profileImageUrl: value, updatedAt: new Date() })
      .where(eq(usersTable.id, req.auth!.userId))
      .returning();
    if (!updated) {
      res.status(401).json({ error: "User not found" });
      return;
    }
    res.json(
      UpdateMyProfileImageResponse.parse({
        id: updated.id,
        fullName: updated.fullName,
        email: updated.email,
        role: updated.role,
        accountStatus: updated.accountStatus,
        profileImageUrl: updated.profileImageUrl,
      }),
    );
  },
);

router.post(
  "/auth/me/delete",
  requireAuth,
  async (req, res): Promise<void> => {
    const parsed = DeleteMyAccountBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const auth = req.auth!;
    if (auth.role !== "student") {
      res
        .status(403)
        .json({ error: "Only students can delete their own account" });
      return;
    }
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, auth.userId));
    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }
    const ok = await verifyPassword(
      parsed.data.currentPassword,
      user.passwordHash,
    );
    if (!ok) {
      res.status(400).json({ error: "Current password is incorrect" });
      return;
    }
    const committed = await db.transaction(async (tx) => {
      const deleted = await tx
        .delete(usersTable)
        .where(eq(usersTable.id, user.id))
        .returning({ id: usersTable.id });
      if (deleted.length === 0) return false;
      await tx.insert(accountDeletionRequestsTable).values({
        formerUserId: user.id,
        formerEmail: user.email,
        formerFullName: user.fullName,
        formerRole: user.role,
        reason: parsed.data.reason,
      });
      return true;
    });
    if (!committed) {
      res.status(404).json({ error: "Account no longer exists" });
      return;
    }
    try {
      await notifyUsersByRole("admin", {
        type: "account_deleted",
        title: "New account deletion",
        message: `${user.fullName} (${user.email}, ${user.role}) deleted their account.`,
        relatedEntityType: "user",
        relatedEntityId: user.id,
      });
    } catch (err) {
      req.log?.warn({ err }, "Failed to notify admins of account deletion");
    }
    res.status(204).end();
  },
);

export default router;
