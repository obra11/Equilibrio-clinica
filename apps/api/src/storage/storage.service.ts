import { randomBytes } from "crypto";
import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { extname } from "path";
import { Readable } from "stream";

export type StorageFolder = "patients" | "professionals" | "classes" | "clinical";
export type StorageKind = "image" | "video" | "document";

const FOLDERS = new Set<StorageFolder>([
  "patients",
  "professionals",
  "classes",
  "clinical",
]);

const IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const VIDEO_MIMES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-m4v",
]);

@Injectable()
export class StorageService {
  private readonly log = new Logger(StorageService.name);
  private client: S3Client | null = null;

  isCloudEnabled() {
    return Boolean(
      process.env.S3_BUCKET?.trim() &&
        process.env.S3_ACCESS_KEY_ID?.trim() &&
        process.env.S3_SECRET_ACCESS_KEY?.trim(),
    );
  }

  maxBytes(kind: StorageKind) {
    const videoMb = Number(process.env.STORAGE_MAX_VIDEO_MB || 512);
    const imageMb = Number(process.env.STORAGE_MAX_IMAGE_MB || 12);
    const docMb = Number(process.env.STORAGE_MAX_DOC_MB || 50);
    if (kind === "video") return Math.max(50, videoMb) * 1024 * 1024;
    if (kind === "document") return Math.max(5, docMb) * 1024 * 1024;
    return Math.max(2, imageMb) * 1024 * 1024;
  }

  status() {
    return {
      cloud: this.isCloudEnabled(),
      maxImageMb: Math.round(this.maxBytes("image") / (1024 * 1024)),
      maxVideoMb: Math.round(this.maxBytes("video") / (1024 * 1024)),
      maxDocMb: Math.round(this.maxBytes("document") / (1024 * 1024)),
      publicBase: this.publicBase() || null,
    };
  }

  inferKind(contentType: string, fileName: string): StorageKind {
    const mime = (contentType || "").toLowerCase();
    const ext = extname(fileName || "").toLowerCase();
    if (IMAGE_MIMES.has(mime) || [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext)) {
      return "image";
    }
    if (
      VIDEO_MIMES.has(mime) ||
      [".mp4", ".webm", ".mov", ".m4v"].includes(ext)
    ) {
      return "video";
    }
    return "document";
  }

  async createPresignedUpload(input: {
    folder: string;
    contentType: string;
    fileName: string;
    fileSize?: number;
    kind?: StorageKind;
  }) {
    if (!this.isCloudEnabled()) {
      throw new ServiceUnavailableException(
        "Storage em nuvem não configurado (S3_BUCKET / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY)",
      );
    }
    const folder = input.folder as StorageFolder;
    if (!FOLDERS.has(folder)) {
      throw new BadRequestException("Pasta de upload inválida");
    }
    const contentType = (input.contentType || "application/octet-stream").trim();
    if (!contentType) throw new BadRequestException("contentType obrigatório");

    const kind = input.kind || this.inferKind(contentType, input.fileName || "");
    this.assertAllowed(folder, kind, contentType);

    const max = this.maxBytes(kind);
    if (input.fileSize != null && input.fileSize > max) {
      throw new BadRequestException(
        `Arquivo grande demais (máx. ${Math.round(max / (1024 * 1024))} MB para ${kind})`,
      );
    }

    const ext = this.safeExt(input.fileName, contentType, kind);
    const key = `${folder}/${Date.now()}-${randomBytes(6).toString("hex")}${ext}`;
    const client = this.getClient();
    const bucket = process.env.S3_BUCKET!.trim();

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
    });
    const uploadUrl = await getSignedUrl(client, command, { expiresIn: 60 * 30 });
    const fileUrl = this.toStoredUrl(key);

    return {
      uploadUrl,
      fileUrl,
      key,
      kind,
      maxBytes: max,
      headers: {
        "Content-Type": contentType,
      },
    };
  }

  /** URL temporária de leitura (vídeos grandes sem baixar blob na API/browser). */
  async createPresignedRead(storedUrl: string) {
    if (!this.isCloudEnabled()) {
      throw new ServiceUnavailableException("Storage em nuvem não configurado");
    }
    const key = this.assertOwnedUrl(storedUrl);
    const command = new GetObjectCommand({
      Bucket: process.env.S3_BUCKET!.trim(),
      Key: key,
    });
    const url = await getSignedUrl(this.getClient(), command, { expiresIn: 60 * 60 });
    return { url, expiresIn: 3600 };
  }

  /** Resolve chave a partir de URL lógica /uploads/... ou URL pública */
  keyFromStoredUrl(url: string): string | null {
    if (!url) return null;
    if (url.startsWith("/uploads/")) return url.slice("/uploads/".length);
    const base = this.publicBase();
    if (base && url.startsWith(base + "/")) return url.slice(base.length + 1);
    try {
      const u = new URL(url);
      const path = u.pathname.replace(/^\//, "");
      if (path.includes("/")) return path;
    } catch {
      /* ignore */
    }
    return null;
  }

  assertOwnedUrl(url: string, folder?: StorageFolder) {
    const key = this.keyFromStoredUrl(url);
    if (!key) {
      throw new BadRequestException("URL de mídia inválida");
    }
    const top = key.split("/")[0] as StorageFolder;
    if (!FOLDERS.has(top)) {
      throw new BadRequestException("URL de mídia fora do storage permitido");
    }
    if (folder && top !== folder) {
      throw new BadRequestException(`URL deve ser da pasta ${folder}`);
    }
    return key;
  }

  async getObject(key: string) {
    const client = this.getClient();
    const out = await client.send(
      new GetObjectCommand({
        Bucket: process.env.S3_BUCKET!.trim(),
        Key: key,
      }),
    );
    return out;
  }

  async deleteByStoredUrl(url: string) {
    if (!this.isCloudEnabled()) return;
    const key = this.keyFromStoredUrl(url);
    if (!key) return;
    try {
      await this.getClient().send(
        new DeleteObjectCommand({
          Bucket: process.env.S3_BUCKET!.trim(),
          Key: key,
        }),
      );
    } catch (err) {
      this.log.warn(`Falha ao apagar ${key}: ${String(err)}`);
    }
  }

  /** Upload buffer (fallback pequeno via API) */
  async putObject(key: string, body: Buffer, contentType: string) {
    await this.getClient().send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET!.trim(),
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    return this.toStoredUrl(key);
  }

  asNodeReadable(body: unknown): Readable | null {
    if (!body) return null;
    if (body instanceof Readable) return body;
    const maybe = body as { transformToWebStream?: () => ReadableStream };
    if (typeof maybe.transformToWebStream === "function") {
      return Readable.fromWeb(maybe.transformToWebStream() as never);
    }
    return null;
  }

  private publicBase() {
    return (process.env.S3_PUBLIC_BASE_URL || "").replace(/\/$/, "").trim();
  }

  private toStoredUrl(key: string) {
    const base = this.publicBase();
    if (base) return `${base}/${key}`;
    return `/uploads/${key}`;
  }

  private getClient() {
    if (!this.isCloudEnabled()) {
      throw new ServiceUnavailableException("Storage em nuvem não configurado");
    }
    if (!this.client) {
      const endpoint = process.env.S3_ENDPOINT?.trim() || undefined;
      const region = process.env.S3_REGION?.trim() || "auto";
      this.client = new S3Client({
        region,
        endpoint,
        forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true" || Boolean(endpoint),
        credentials: {
          accessKeyId: process.env.S3_ACCESS_KEY_ID!.trim(),
          secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!.trim(),
        },
      });
      this.log.log(
        `S3/R2 storage ativo (bucket=${process.env.S3_BUCKET}, endpoint=${endpoint || "aws"})`,
      );
    }
    return this.client;
  }

  private assertAllowed(folder: StorageFolder, kind: StorageKind, contentType: string) {
    if (folder === "patients" || folder === "professionals") {
      if (kind !== "image") {
        throw new BadRequestException("Perfil aceita apenas imagem (JPG/PNG/WEBP)");
      }
      if (!IMAGE_MIMES.has(contentType) && contentType !== "image/jpg") {
        throw new BadRequestException("Envie JPG, PNG ou WEBP");
      }
    }
    if (folder === "classes" && kind === "document") {
      throw new BadRequestException("Aula aceita foto ou vídeo");
    }
  }

  private safeExt(fileName: string, contentType: string, kind: StorageKind) {
    let ext = extname(fileName || "").toLowerCase();
    if (!ext || ext.length > 8) {
      if (contentType.includes("jpeg") || contentType.includes("jpg")) ext = ".jpg";
      else if (contentType.includes("png")) ext = ".png";
      else if (contentType.includes("webp")) ext = ".webp";
      else if (contentType.includes("gif")) ext = ".gif";
      else if (contentType.includes("mp4")) ext = ".mp4";
      else if (contentType.includes("webm")) ext = ".webm";
      else if (contentType.includes("quicktime")) ext = ".mov";
      else if (contentType.includes("pdf")) ext = ".pdf";
      else if (kind === "video") ext = ".mp4";
      else if (kind === "image") ext = ".jpg";
      else ext = ".bin";
    }
    return ext;
  }
}
