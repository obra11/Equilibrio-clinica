"use client";

import { useEffect, useRef, useState } from "react";
import { fetchMediaObjectUrl, uploadSmart } from "@/lib/api";

type Props = {
  professionalId: string;
  fullName: string;
  color?: string | null;
  photoUrl?: string | null;
  size?: "md" | "lg";
  editable?: boolean;
  onUpdated?: (photoUrl: string) => void;
};

export function ProfessionalAvatar({
  professionalId,
  fullName,
  color,
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
        if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
        return;
      }
      objectUrl = url;
      setPreview(url);
    });
    return () => {
      active = false;
      if (objectUrl?.startsWith("blob:")) URL.revokeObjectURL(objectUrl);
    };
  }, [photoUrl]);

  const dim = size === "lg" ? "h-20 w-20 text-2xl" : "h-12 w-12 text-base";

  async function onFileChange(file?: File | null) {
    if (!file || !editable) return;
    setError("");
    setUploading(true);
    try {
      const local = URL.createObjectURL(file);
      setPreview(local);
      const updated = (await uploadSmart(file, "professionals", {
        kind: "image",
        multipartPath: `/professionals/${professionalId}/photo`,
        formField: "photo",
        confirmPath: `/professionals/${professionalId}/photo/confirm`,
        confirmBody: (fileUrl) => ({ photoUrl: fileUrl }),
      })) as { photoUrl: string };
      const url = await fetchMediaObjectUrl(updated.photoUrl);
      setPreview(url);
      onUpdated?.(updated.photoUrl);
      URL.revokeObjectURL(local);
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
        onClick={() => editable && inputRef.current?.click()}
        className={`relative grid ${dim} place-items-center overflow-hidden rounded-full text-cream shadow-sm transition ${
          editable ? "cursor-pointer ring-2 ring-transparent hover:ring-gold" : ""
        }`}
        style={{ background: color || "#585E45" }}
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
      {error ? <p className="mt-1 max-w-[140px] text-[10px] text-red-700">{error}</p> : null}
    </div>
  );
}
