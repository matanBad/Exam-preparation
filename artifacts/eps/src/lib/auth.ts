import { useEffect, useState } from "react";

export type EpsUser = {
  id: number;
  fullName: string;
  email: string;
  role: "student" | "lecturer" | "admin";
  accountStatus: string;
  profileImageUrl?: string | null;
};

const USER_EVENT = "eps-user-updated";

export const getAuthToken = (): string | null =>
  localStorage.getItem("eps_token");
export const setAuthToken = (token: string): void =>
  localStorage.setItem("eps_token", token);
export const clearAuth = (): void => {
  localStorage.removeItem("eps_token");
  localStorage.removeItem("eps_user");
  window.dispatchEvent(new Event(USER_EVENT));
};
export const getAuthUser = (): EpsUser | null => {
  const u = localStorage.getItem("eps_user");
  try {
    return u ? (JSON.parse(u) as EpsUser) : null;
  } catch {
    return null;
  }
};
export const setAuthUser = (user: EpsUser): void => {
  localStorage.setItem("eps_user", JSON.stringify(user));
  window.dispatchEvent(new Event(USER_EVENT));
};

export function useAuthUser(): EpsUser | null {
  const [user, setUser] = useState<EpsUser | null>(() => getAuthUser());
  useEffect(() => {
    const handler = () => setUser(getAuthUser());
    window.addEventListener(USER_EVENT, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(USER_EVENT, handler);
      window.removeEventListener("storage", handler);
    };
  }, []);
  return user;
}
