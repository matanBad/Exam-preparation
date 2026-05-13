import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const SECRET = process.env["SESSION_SECRET"] ?? process.env["JWT_SECRET"];
if (!SECRET) {
  throw new Error("SESSION_SECRET (or JWT_SECRET) env var is required");
}
const JWT_SECRET: string = SECRET;

export type Role = "student" | "lecturer" | "admin";

export interface JwtPayload {
  userId: number;
  email: string;
  role: Role;
}

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    return decoded;
  } catch {
    return null;
  }
}
