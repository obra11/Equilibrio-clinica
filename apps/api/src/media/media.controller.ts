import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { createReadStream, existsSync } from "fs";
import { extname, join, normalize, sep } from "path";
import { JwtAuthGuard } from "../common/guards";
import { UPLOADS_ROOT } from "../common/uploads-path";

const ALLOWED_FOLDERS = new Set(["patients", "professionals", "classes", "clinical"]);
const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".m4v": "video/mp4",
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx":
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx":
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".rtf": "application/rtf",
  ".odt": "application/vnd.oasis.opendocument.text",
  ".ods": "application/vnd.oasis.opendocument.spreadsheet",
};

const INLINE_EXTS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".mp4",
  ".webm",
  ".mov",
  ".m4v",
  ".pdf",
  ".txt",
]);

@UseGuards(JwtAuthGuard)
@Controller("media")
export class MediaController {
  @Get(":folder/:filename")
  serve(
    @Param("folder") folder: string,
    @Param("filename") filename: string,
    @Res() res: Response,
  ) {
    if (!ALLOWED_FOLDERS.has(folder)) throw new NotFoundException();
    if (!filename || filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
      throw new NotFoundException();
    }

    const absolute = normalize(join(UPLOADS_ROOT, folder, filename));
    const root = normalize(UPLOADS_ROOT + sep);
    if (!absolute.startsWith(root) || !existsSync(absolute)) {
      throw new NotFoundException();
    }

    const ext = extname(filename).toLowerCase();
    res.setHeader("Content-Type", CONTENT_TYPES[ext] || "application/octet-stream");
    res.setHeader("Cache-Control", "private, max-age=300");
    if (!INLINE_EXTS.has(ext)) {
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    }
    createReadStream(absolute).pipe(res);
  }
}
