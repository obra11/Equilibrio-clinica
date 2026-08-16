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
import { PatientsService } from "./patients.service";
import { JwtAuthGuard } from "../common/guards";
import { ensureUploadDir } from "../common/uploads-path";

const photosDir = ensureUploadDir("patients");

@UseGuards(JwtAuthGuard)
@Controller("patients")
export class PatientsController {
  constructor(private patients: PatientsService) {}

  @Get()
  list(@Query("q") q?: string) {
    return this.patients.list(q);
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.patients.get(id);
  }

  @Post()
  create(@Body() body: Record<string, unknown>) {
    return this.patients.create(body as never);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() body: Record<string, unknown>) {
    return this.patients.update(id, body);
  }

  @Post(":id/photo")
  @UseInterceptors(
    FileInterceptor("photo", {
      storage: diskStorage({
        destination: photosDir,
        filename: (_req, file, cb) => {
          const ext = extname(file.originalname).toLowerCase() || ".jpg";
          const safeExt = [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext) ? ext : ".jpg";
          cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}${safeExt}`);
        },
      }),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.startsWith("image/")) {
          cb(new BadRequestException("Envie uma imagem (JPG, PNG ou WEBP)") as never, false);
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

  @Post(":id/welcome-whatsapp")
  sendWelcome(@Param("id") id: string) {
    return this.patients.sendWelcomeWhatsapp(id);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.patients.remove(id);
  }
}
