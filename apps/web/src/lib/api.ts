const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";
export const API_ORIGIN = API_URL.replace(/\/api\/?$/, "");

export type AuthUser = {
  id: string;
  email: string;
  role: string;
  professional: { id: string; fullName: string; color: string } | null;
};

/** Converte /uploads/... em endpoint autenticado /api/media/... */
export function mediaUrl(path?: string | null) {
  if (!path) return null;
  if (path.startsWith("http") || path.startsWith("data:") || path.startsWith("blob:")) {
    return path;
  }
  const cleaned = path.replace(/^\/?uploads\//, "");
  return `${API_URL}/media/${cleaned}`;
}

/** URL pronta para <img>/<video>. HTTPS público não baixa para a memória do browser. */
export async function fetchMediaObjectUrl(path?: string | null): Promise<string | null> {
  if (!path) return null;
  if (path.startsWith("blob:") || path.startsWith("data:")) return path;
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }

  // Nuvem privada: URL assinada (melhor para vídeo grande)
  try {
    const status = await getStorageStatus();
    if (status.cloud && path.startsWith("/uploads/")) {
      const signed = await api<{ url: string }>("/storage/sign-read", {
        method: "POST",
        body: JSON.stringify({ url: path }),
      });
      if (signed?.url) return signed.url;
    }
  } catch {
    /* fallback abaixo */
  }

  const url = mediaUrl(path);
  if (!url) return null;
  const token = getToken();
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) return null;
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export type StorageFolder = "patients" | "professionals" | "classes" | "clinical";
export type StorageKind = "image" | "video" | "document";

export type StorageStatus = {
  cloud: boolean;
  maxImageMb: number;
  maxVideoMb: number;
  maxDocMb: number;
  publicBase: string | null;
};

let storageStatusCache: StorageStatus | null = null;

export async function getStorageStatus(): Promise<StorageStatus> {
  if (storageStatusCache) return storageStatusCache;
  storageStatusCache = await api<StorageStatus>("/storage/status");
  return storageStatusCache;
}

function inferClientKind(file: File): StorageKind {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  return "document";
}

/** Upload direto à nuvem (presign) — não passa o arquivo pela memória da API. */
export async function directCloudUpload(
  file: File,
  folder: StorageFolder,
  kind?: StorageKind,
): Promise<{ fileUrl: string; kind: StorageKind }> {
  const resolvedKind = kind || inferClientKind(file);
  const contentType = file.type || "application/octet-stream";
  const presign = await api<{
    uploadUrl: string;
    fileUrl: string;
    kind: StorageKind;
    headers: Record<string, string>;
  }>("/storage/presign", {
    method: "POST",
    body: JSON.stringify({
      folder,
      contentType,
      fileName: file.name,
      fileSize: file.size,
      kind: resolvedKind,
    }),
  });

  const put = await fetch(presign.uploadUrl, {
    method: "PUT",
    body: file,
    headers: presign.headers,
  });
  if (!put.ok) {
    throw new Error(`Falha no upload para a nuvem (HTTP ${put.status})`);
  }
  return { fileUrl: presign.fileUrl, kind: presign.kind || resolvedKind };
}

/**
 * Envia arquivo: nuvem (presign) se configurada; senão multipart pela API (arquivos menores).
 */
export async function uploadSmart(
  file: File,
  folder: StorageFolder,
  options?: {
    kind?: StorageKind;
    multipartPath?: string;
    formField?: string;
    confirmPath?: string;
    confirmBody?: (fileUrl: string, kind: StorageKind) => Record<string, unknown>;
  },
): Promise<unknown> {
  const kind = options?.kind || inferClientKind(file);
  let cloud = false;
  try {
    cloud = (await getStorageStatus()).cloud;
  } catch {
    cloud = false;
  }

  if (cloud) {
    const { fileUrl } = await directCloudUpload(file, folder, kind);
    if (options?.confirmPath) {
      return api(options.confirmPath, {
        method: "POST",
        body: JSON.stringify(
          options.confirmBody?.(fileUrl, kind) ?? { url: fileUrl, kind, name: file.name },
        ),
      });
    }
    return { fileUrl, kind };
  }

  if (!options?.multipartPath) {
    throw new Error("Storage em nuvem não configurado e sem rota de upload local");
  }
  if (kind === "video" && file.size > 80 * 1024 * 1024) {
    throw new Error(
      "Vídeo grande demais para upload local. Configure S3/R2 (nuvem) na API.",
    );
  }
  const fd = new FormData();
  fd.append(options.formField || "file", file);
  return apiUpload(options.multipartPath, fd);
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
  const controller = new AbortController();
  const timeoutMs = 45_000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
      signal: options.signal ?? controller.signal,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      const message = Array.isArray(err.message) ? err.message.join(", ") : err.message;
      throw new Error(message || "Erro na API");
    }
    return res.json() as Promise<T>;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("A operação demorou demais — tente de novo em alguns segundos");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
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
