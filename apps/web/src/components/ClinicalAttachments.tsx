"use client";

import { useEffect, useRef, useState } from "react";
import { api, apiUpload, fetchMediaObjectUrl, mediaUrl } from "@/lib/api";

export type ClinicalAttachment = {
  url: string;
  kind: "image" | "video" | "document";
  name?: string;
  mime?: string;
  createdAt: string;
};

type Props = {
  /** Anexos já salvos no registro */
  items?: ClinicalAttachment[];
  /** Endpoint de upload, ex: /clinical/notes/:id/attachments — se omitido, só fila local */
  uploadPath?: string | null;
  /** Endpoint DELETE com body { url } */
  deletePath?: string | null;
  /** Arquivos pendentes antes de criar o registro */
  pendingFiles?: File[];
  onPendingChange?: (files: File[]) => void;
  onChanged?: (items: ClinicalAttachment[]) => void;
  disabled?: boolean;
  compact?: boolean;
};

const ACCEPT_ALL =
  "image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.rtf,.odt,.ods";

export function ClinicalAttachments({
  items = [],
  uploadPath,
  deletePath,
  pendingFiles = [],
  onPendingChange,
  onChanged,
  disabled,
  compact,
}: Props) {
  const galleryRef = useRef<HTMLInputElement>(null);
  const docsRef = useRef<HTMLInputElement>(null);
  const cameraPhotoRef = useRef<HTMLInputElement>(null);
  const cameraVideoRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [previews, setPreviews] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    const mediaItems = items.filter((i) => i.kind === "image" || i.kind === "video");
    Promise.all(
      mediaItems.map(async (m) => {
        const url = await fetchMediaObjectUrl(m.url);
        return [m.url, url] as const;
      }),
    ).then((pairs) => {
      if (cancelled) return;
      const next: Record<string, string> = {};
      for (const [path, url] of pairs) {
        if (url) next[path] = url;
      }
      setPreviews((prev) => {
        Object.values(prev).forEach((u) => {
          if (u.startsWith("blob:") && !Object.values(next).includes(u)) {
            URL.revokeObjectURL(u);
          }
        });
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [items]);

  async function handleFile(file: File | null | undefined) {
    if (!file || disabled) return;
    setError("");
    if (uploadPath) {
      setUploading(true);
      try {
        const fd = new FormData();
        fd.append("file", file);
        const updated = await apiUpload<{ attachments: ClinicalAttachment[] }>(
          uploadPath,
          fd,
        );
        onChanged?.(updated.attachments || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro no upload");
      } finally {
        setUploading(false);
      }
      return;
    }
    onPendingChange?.([...pendingFiles, file]);
  }

  async function removeSaved(url: string) {
    if (!deletePath || disabled) return;
    if (!window.confirm("Remover este anexo?")) return;
    setError("");
    try {
      const updated = await api<{ attachments: ClinicalAttachment[] }>(deletePath, {
        method: "DELETE",
        body: JSON.stringify({ url }),
      });
      onChanged?.(updated.attachments || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao remover");
    }
  }

  function removePending(index: number) {
    onPendingChange?.(pendingFiles.filter((_, i) => i !== index));
  }

  async function openDocument(path: string, name?: string) {
    const url = mediaUrl(path);
    if (!url) return;
    const token = localStorage.getItem("eq_token");
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!res.ok) {
      setError("Não foi possível abrir o anexo");
      return;
    }
    const blob = await res.blob();
    const obj = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = obj;
    a.target = "_blank";
    a.rel = "noopener";
    if (name) a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(obj), 60_000);
  }

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      <div>
        <p className="eq-label">Anexos</p>
        <p className="mb-2 text-xs text-olive-muted">
          Fotos, vídeos (galeria ou câmera) e documentos (PDF, Word, Excel…)
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="eq-btn-ghost"
            disabled={disabled || uploading}
            onClick={() => galleryRef.current?.click()}
          >
            Galeria
          </button>
          <button
            type="button"
            className="eq-btn-ghost"
            disabled={disabled || uploading}
            onClick={() => cameraPhotoRef.current?.click()}
          >
            Tirar foto
          </button>
          <button
            type="button"
            className="eq-btn-ghost"
            disabled={disabled || uploading}
            onClick={() => cameraVideoRef.current?.click()}
          >
            Gravar vídeo
          </button>
          <button
            type="button"
            className="eq-btn-ghost"
            disabled={disabled || uploading}
            onClick={() => docsRef.current?.click()}
          >
            Documento
          </button>
          {uploading ? (
            <span className="self-center text-xs text-olive-muted">Enviando...</span>
          ) : null}
        </div>
        <input
          ref={galleryRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            void handleFile(f);
          }}
        />
        <input
          ref={docsRef}
          type="file"
          accept={ACCEPT_ALL}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            void handleFile(f);
          }}
        />
        <input
          ref={cameraPhotoRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            void handleFile(f);
          }}
        />
        <input
          ref={cameraVideoRef}
          type="file"
          accept="video/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            void handleFile(f);
          }}
        />
      </div>

      {error ? <p className="text-xs text-red-700">{error}</p> : null}

      {pendingFiles.length > 0 ? (
        <ul className="space-y-1 text-xs text-olive-muted">
          {pendingFiles.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2">
              <span className="truncate">Pendente: {f.name}</span>
              <button
                type="button"
                className="text-red-700 underline"
                onClick={() => removePending(i)}
              >
                Remover
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {items.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {items.map((item) => (
            <div
              key={item.url}
              className="overflow-hidden rounded-md border border-borderEq bg-cream/40"
            >
              {item.kind === "image" && previews[item.url] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previews[item.url]}
                  alt={item.name || "Anexo"}
                  className="h-36 w-full object-cover"
                />
              ) : null}
              {item.kind === "video" && previews[item.url] ? (
                <video src={previews[item.url]} controls className="h-36 w-full object-cover" />
              ) : null}
              {item.kind === "document" ||
              (item.kind === "image" && !previews[item.url]) ||
              (item.kind === "video" && !previews[item.url]) ? (
                <div className="flex h-20 items-center px-3 text-sm text-olive">
                  <button
                    type="button"
                    className="truncate font-medium underline"
                    onClick={() => void openDocument(item.url, item.name)}
                  >
                    {item.name || item.url.split("/").pop()}
                  </button>
                </div>
              ) : null}
              <div className="flex items-center justify-between gap-2 border-t border-borderEq px-2 py-1 text-[10px] text-olive-muted">
                <span className="uppercase">{item.kind}</span>
                {deletePath ? (
                  <button
                    type="button"
                    className="text-red-700 underline"
                    disabled={disabled}
                    onClick={() => void removeSaved(item.url)}
                  >
                    Remover
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Envia arquivos pendentes após criar evolução/avaliação. */
export async function uploadPendingAttachments(
  uploadPath: string,
  files: File[],
): Promise<ClinicalAttachment[]> {
  let last: ClinicalAttachment[] = [];
  for (const file of files) {
    const fd = new FormData();
    fd.append("file", file);
    const updated = await apiUpload<{ attachments: ClinicalAttachment[] }>(uploadPath, fd);
    last = updated.attachments || [];
  }
  return last;
}
