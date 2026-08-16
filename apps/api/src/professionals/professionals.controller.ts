import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { extname } from "path";
import { ProfessionalsService } from "./professionals.service";
import { JwtAuthGuard, Roles, RolesGuard } from "../common/guards";
import { ensureUploadDir } from "../common/uploads-path";

const photosDir = ensureUploadDir("professionals");

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("professionals")
export class ProfessionalsController {
  constructor(private professionals: ProfessionalsService) {}

  @Get()
  list() {
    return this.professionals.list();
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.professionals.get(id);
  }

  @Roles("ADMIN", "RECEPCAO")
  @Post()
  create(@Body() body: Record<string, unknown>) {
    return this.professionals.create(body as never);
  }

  @Roles("ADMIN", "RECEPCAO")
  @Patch(":id")
  update(@Param("id") id: string, @Body() body: Record<string, unknown>) {
    return this.professionals.update(id, body as never);
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
    return this.professionals.updatePhoto(id, `/uploads/professionals/${file.filename}`);
  }

  @Roles("ADMIN", "RECEPCAO")
  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.professionals.remove(id);
  }
}
