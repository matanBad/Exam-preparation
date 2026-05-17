import { Router, type IRouter } from "express";
import { and, eq, ne } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import {
  LoginBody,
  LoginResponse,
  GetMeResponse,
  ChangeMyPasswordBody,
  ChangeMyEmailBody,
  ChangeMyEmailResponse,
} from "@workspace/api-zod";
import { signToken, verifyPassword, hashPassword } from "../lib/auth";
import { requireAuth } from "../middlewares/auth";

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
    res.status(401).json({ error: "Account is not active" });
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
      },
    }),
  );
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
  res.json(
    GetMeResponse.parse({
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      accountStatus: user.accountStatus,
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
      .set({ passwordHash, updatedAt: new Date() })
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
      }),
    );
  },
);

export default router;
