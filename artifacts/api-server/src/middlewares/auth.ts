import type { Request, Response, NextFunction, RequestHandler } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { verifyToken, type JwtPayload, type Role } from "../lib/auth";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: JwtPayload;
    }
  }
}

export const requireAuth: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const token = header.slice("Bearer ".length).trim();
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }
  const [user] = await db
    .select({
      id: usersTable.id,
      accountStatus: usersTable.accountStatus,
      role: usersTable.role,
      mustChangePassword: usersTable.mustChangePassword,
    })
    .from(usersTable)
    .where(eq(usersTable.id, payload.userId));
  if (!user) {
    res.status(401).json({ error: "Account no longer exists" });
    return;
  }
  if (user.accountStatus !== "active") {
    res.status(401).json({ error: "Account is not active" });
    return;
  }
  // When a user has a temporary password, block all protected endpoints
  // except the ones strictly required to read their own profile and to
  // change the password.
  if (user.mustChangePassword) {
    const allowed =
      req.path === "/auth/me" ||
      req.path === "/auth/me/password" ||
      req.path === "/auth/logout";
    if (!allowed) {
      res.status(403).json({
        error: "Password change required before continuing",
        code: "password_change_required",
      });
      return;
    }
  }
  req.auth = { ...payload, role: user.role as Role };
  next();
};

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    if (!roles.includes(req.auth.role)) {
      res.status(403).json({ error: "Forbidden: insufficient role" });
      return;
    }
    next();
  };
}
