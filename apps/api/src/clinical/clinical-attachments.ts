export type ClinicalAttachmentKind = "image" | "video" | "document";

export type ClinicalAttachment = {
  url: string;
  kind: ClinicalAttachmentKind;
  name?: string;
  mime?: string;
  createdAt: string;
};

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const VIDEO_EXTS = new Set([".mp4", ".webm", ".mov", ".m4v"]);
const DOC_EXTS = new Set([
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".txt",
  ".csv",
  ".rtf",
  ".odt",
  ".ods",
]);

export const CLINICAL_ALLOWED_EXTS = [...IMAGE_EXTS, ...VIDEO_EXTS, ...DOC_EXTS];

export function parseClinicalAttachments(raw?: string | null): ClinicalAttachment[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ClinicalAttachment[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function attachmentKindFromExt(ext: string): ClinicalAttachmentKind {
  const e = ext.toLowerCase();
  if (IMAGE_EXTS.has(e)) return "image";
  if (VIDEO_EXTS.has(e)) return "video";
  return "document";
}

export function withParsedAttachments<T extends { attachments?: string | null }>(
  row: T,
): Omit<T, "attachments"> & { attachments: ClinicalAttachment[] } {
  const { attachments, ...rest } = row;
  return {
    ...(rest as Omit<T, "attachments">),
    attachments: parseClinicalAttachments(attachments),
  };
}
