import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { extname } from "path";
import { ClassesService } from "./classes.service";
import { JwtAuthGuard, Roles, RolesGuard } from "../common/guards";
import { ensureUploadDir } from "../common/uploads-path";

const mediaDir = ensureUploadDir("classes");
const IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".webp", ".gif"];
const VIDEO_EXTS = [".mp4", ".webm", ".mov", ".m4v"];
const ALLOWED_EXTS = [...IMAGE_EXTS, ...VIDEO_EXTS];
const IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const VIDEO_MIMES = ["video/mp4", "video/webm", "video/quicktime", "video/x-m4v"];

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("classes")
export class ClassesController {
  constructor(private classes: ClassesService) {}

  @Get()
  list(@Query("from") from?: string, @Query("to") to?: string) {
    return this.classes.list({ from, to });
  }

  @Roles("ADMIN", "RECEPCAO", "FISIOTERAPEUTA")
  @Patch("enrollments/:enrollmentId")
  updateEnrollment(
    @Param("enrollmentId") enrollmentId: string,
    @Body() body: { status: string },
  ) {
    return this.classes.updateEnrollment(enrollmentId, body.status);
  }

  @Roles("ADMIN", "RECEPCAO")
  @Delete("enrollments/:enrollmentId")
  removeEnrollment(@Param("enrollmentId") enrollmentId: string) {
    return this.classes.removeEnrollment(enrollmentId);
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.classes.get(id);
  }

  @Roles("ADMIN", "RECEPCAO")
  @Post()
  create(@Body() body: Record<string, unknown>) {
    return this.classes.create(body as never);
  }

  @Roles("ADMIN", "RECEPCAO", "FISIOTERAPEUTA")
  @Patch(":id")
  update(@Param("id") id: string, @Body() body: Record<string, unknown>) {
    return this.classes.update(id, body as never);
  }

  @Roles("ADMIN", "RECEPCAO", "FISIOTERAPEUTA")
  @Post(":id/media")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({
        destination: mediaDir,
        filename: (_req, file, cb) => {
          const ext = extname(file.originalname).toLowerCase() || ".bin";
          const safeExt = ALLOWED_EXTS.includes(ext) ? ext : ".bin";
          cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}${safeExt}`);
        },
      }),
      limits: { fileSize: 80 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const ext = extname(file.originalname).toLowerCase();
        const okMime = [...IMAGE_MIMES, ...VIDEO_MIMES].includes(file.mimetype);
        const okExt = !ext || ALLOWED_EXTS.includes(ext);
        if (!okMime || !okExt) {
          cb(
            new BadRequestException(
              "Envie foto (JPG/PNG/WEBP) ou vídeo (MP4/WEBM/MOV)",
            ) as never,
            false,
          );
          return;
        }
        cb(null, true);
      },
    }),
  )
  uploadMedia(
    @Param("id") id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException("Nenhum arquivo enviado");
    const ext = extname(file.filename).toLowerCase();
    const kind = VIDEO_EXTS.includes(ext) || VIDEO_MIMES.includes(file.mimetype)
      ? "video"
      : "image";
    return this.classes.addLessonMedia(id, {
      url: `/uploads/classes/${file.filename}`,
      kind,
      name: file.originalname,
    });
  }

  @Roles("ADMIN", "RECEPCAO", "FISIOTERAPEUTA")
  @Delete(":id/media")
  removeMedia(@Param("id") id: string, @Body() body: { url?: string }) {
    if (!body?.url) throw new BadRequestException("Informe a URL da mídia");
    return this.classes.removeLessonMedia(id, body.url);
  }

  @Roles("ADMIN")
  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.classes.remove(id);
  }

  @Roles("ADMIN", "RECEPCAO")
  @Post(":id/enroll")
  enroll(
    @Param("id") id: string,
    @Body() body: { patientId: string; status?: string },
  ) {
    return this.classes.enroll(id, body.patientId, body.status);
  }
}
