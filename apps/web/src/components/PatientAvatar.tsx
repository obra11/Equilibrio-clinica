"use client";

import { useEffect, useRef, useState } from "react";
import { apiUpload, fetchMediaObjectUrl } from "@/lib/api";

type Props = {
  patientId: string;
  fullName: string;
  photoUrl?: string | null;
  size?: "sm" | "md" | "lg";
  editable?: boolean;
  onUpdated?: (photoUrl: string) => void;
};

export function PatientAvatar({
  patientId,
  fullName,
  photoUrl,
  size = "md",
  editable = true,
  onUpdated,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    setPreview(null);
    fetchMediaObjectUrl(photoUrl).then((url) => {
      if (!active) {
        if (url) URL.revokeObjectURL(url);
        return;
      }
      objectUrl = url;
      setPreview(url);
    });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photoUrl]);

  const dim =
    size === "lg" ? "h-20 w-20 text-2xl" : size === "sm" ? "h-10 w-10 text-sm" : "h-12 w-12 text-base";

  async function onFileChange(file?: File | null) {
    if (!file || !editable) return;
    setError("");
    setUploading(true);
    try {
      const local = URL.createObjectURL(file);
      setPreview(local);
      const fd = new FormData();
      fd.append("photo", file);
      const updated = await apiUpload<{ photoUrl: string }>(`/patients/${patientId}/photo`, fd);
      const url = await fetchMediaObjectUrl(updated.photoUrl);
      setPreview(url);
      onUpdated?.(updated.photoUrl);
    } catch (err) {
      const url = await fetchMediaObjectUrl(photoUrl);
      setPreview(url);
      setError(err instanceof Error ? err.message : "Falha no upload");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="relative inline-flex flex-col items-start">
      <button
        type="button"
        title={editable ? "Clique para alterar a foto" : fullName}
        disabled={!editable || uploading}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (editable) inputRef.current?.click();
        }}
        className={`relative grid ${dim} shrink-0 place-items-center overflow-hidden rounded-full bg-olive text-cream shadow-sm transition ${
          editable ? "cursor-pointer ring-2 ring-transparent hover:ring-gold" : ""
        }`}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt={fullName} className="h-full w-full object-cover" />
        ) : (
          <span className="font-semibold">{fullName.slice(0, 1).toUpperCase()}</span>
        )}
        {editable ? (
          <span className="absolute inset-x-0 bottom-0 bg-charcoal/55 py-0.5 text-center text-[9px] font-semibold uppercase tracking-wide text-cream">
            {uploading ? "..." : "Foto"}
          </span>
        ) : null}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => onFileChange(e.target.files?.[0])}
      />
      {error ? <p className="mt-1 max-w-[120px] text-[10px] text-red-700">{error}</p> : null}
    </div>
  );
}
