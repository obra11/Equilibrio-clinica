const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";
export const API_ORIGIN = API_URL.replace(/\/api\/?$/, "");

export type AuthUser = {
  id: string;
  email: string;
  role: string;
  professional: { id: string; fullName: string; color: string } | null;
};

export function mediaUrl(path?: string | null) {
  if (!path) return null;
  if (path.startsWith("http") || path.startsWith("data:")) return path;
  return `${API_ORIGIN}${path.startsWith("/") ? path : `/${path}`}`;
}

export function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("eq_token");
}

export function setSession(token: string, user: AuthUser) {
  localStorage.setItem("eq_token", token);
  localStorage.setItem("eq_user", JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem("eq_token");
  localStorage.removeItem("eq_user");
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("eq_user");
  return raw ? (JSON.parse(raw) as AuthUser) : null;
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    const message = Array.isArray(err.message) ? err.message.join(", ") : err.message;
    throw new Error(message || "Erro na API");
  }
  return res.json() as Promise<T>;
}

export async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    const message = Array.isArray(err.message) ? err.message.join(", ") : err.message;
    throw new Error(message || "Erro no upload");
  }
  return res.json() as Promise<T>;
}

export function formatMoney(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
