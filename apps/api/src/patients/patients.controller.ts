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
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { extname } from "path";
import { PatientsService } from "./patients.service";
import { AuthUser } from "../common/auth-user";
import { JwtAuthGuard, Roles, RolesGuard } from "../common/guards";
import { consumeRateLimit } from "../common/rate-limit";
import { ensureUploadDir } from "../common/uploads-path";

const photosDir = ensureUploadDir("patients");
const IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".webp"];

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("patients")
export class PatientsController {
  constructor(private patients: PatientsService) {}

  @Get()
  list(@Query("q") q?: string) {
    return this.patients.list(q);
  }

  @Get(":id")
  get(@Req() req: { user: AuthUser }, @Param("id") id: string) {
    return this.patients.get(id, req.user.role);
  }

  @Roles("ADMIN", "RECEPCAO")
  @Post()
  create(@Body() body: Record<string, unknown>) {
    return this.patients.create(body as never);
  }

  @Roles("ADMIN", "RECEPCAO")
  @Patch(":id")
  update(@Param("id") id: string, @Body() body: Record<string, unknown>) {
    return this.patients.update(id, body);
  }

  @Roles("ADMIN", "RECEPCAO")
  @Post(":id/photo")
  @UseInterceptors(
    FileInterceptor("photo", {
      storage: diskStorage({
        destination: photosDir,
        filename: (_req, file, cb) => {
          const ext = extname(file.originalname).toLowerCase() || ".jpg";
          const safeExt = IMAGE_EXTS.includes(ext) ? ext : ".jpg";
          cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}${safeExt}`);
        },
      }),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const ext = extname(file.originalname).toLowerCase();
        const okMime = ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype);
        if (!okMime || (ext && !IMAGE_EXTS.includes(ext) && ext !== ".jpe")) {
          cb(new BadRequestException("Envie JPG, PNG ou WEBP") as never, false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  uploadPhoto(
    @Param("id") id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException("Nenhuma foto enviada");
    return this.patients.updatePhoto(id, `/uploads/patients/${file.filename}`);
  }

  @Roles("ADMIN", "RECEPCAO")
  @Post(":id/welcome-whatsapp")
  sendWelcome(@Req() req: { user: AuthUser }, @Param("id") id: string) {
    consumeRateLimit(`wa-welcome:${req.user.userId}:${id}`, 3, 60 * 60 * 1000);
    consumeRateLimit(`wa-welcome-user:${req.user.userId}`, 20, 60 * 60 * 1000);
    return this.patients.sendWelcomeWhatsapp(id);
  }

  @Roles("ADMIN", "RECEPCAO")
  @Post(":id/welcome")
  sendWelcomeChannels(
    @Req() req: { user: AuthUser },
    @Param("id") id: string,
    @Body() body: { channels?: Array<"email" | "whatsapp"> },
  ) {
    consumeRateLimit(`welcome:${req.user.userId}:${id}`, 5, 60 * 60 * 1000);
    consumeRateLimit(`welcome-user:${req.user.userId}`, 30, 60 * 60 * 1000);
    return this.patients.sendWelcomeMessage(id, body?.channels || ["whatsapp"]);
  }

  @Roles("ADMIN")
  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.patients.remove(id);
  }
}
