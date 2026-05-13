export const getAuthToken = () => localStorage.getItem("eps_token");
export const setAuthToken = (token: string) => localStorage.setItem("eps_token", token);
export const clearAuth = () => { 
  localStorage.removeItem("eps_token"); 
  localStorage.removeItem("eps_user"); 
};
export const getAuthUser = () => {
  const u = localStorage.getItem("eps_user");
  try {
    return u ? JSON.parse(u) : null;
  } catch {
    return null;
  }
};
export const setAuthUser = (user: any) => localStorage.setItem("eps_user", JSON.stringify(user));
