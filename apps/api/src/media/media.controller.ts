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

const ALLOWED_FOLDERS = new Set(["patients", "professionals"]);
const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

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
    createReadStream(absolute).pipe(res);
  }
}
