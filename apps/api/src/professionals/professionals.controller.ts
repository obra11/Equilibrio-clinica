import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { extname } from "path";
import { ProfessionalsService } from "./professionals.service";
import { AuthUser } from "../common/auth-user";
import { JwtAuthGuard, Roles, RolesGuard } from "../common/guards";
import { ensureUploadDir } from "../common/uploads-path";
import { StorageService } from "../storage/storage.service";

const photosDir = ensureUploadDir("professionals");
const IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".webp"];

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("professionals")
export class ProfessionalsController {
  constructor(
    private professionals: ProfessionalsService,
    private storage: StorageService,
  ) {}

  @Get()
  list(@Req() req: { user: AuthUser }) {
    return this.professionals.list(req.user.role);
  }

  @Get(":id")
  get(@Req() req: { user: AuthUser }, @Param("id") id: string) {
    return this.professionals.get(id, req.user.role);
  }

  @Roles("ADMIN", "RECEPCAO")
  @Post()
  create(@Req() req: { user: AuthUser }, @Body() body: Record<string, unknown>) {
    return this.professionals.create(body as never, req.user.role);
  }

  @Roles("ADMIN", "RECEPCAO")
  @Patch(":id")
  update(
    @Req() req: { user: AuthUser },
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.professionals.update(id, body as never, req.user.role);
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
        const okMime = ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype);
        if (!okMime) {
          cb(new BadRequestException("Envie JPG, PNG ou WEBP") as never, false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  uploadPhoto(
    @Req() req: { user: AuthUser },
    @Param("id") id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException("Nenhuma foto enviada");
    return this.professionals.updatePhoto(
      id,
      `/uploads/professionals/${file.filename}`,
      req.user.role,
    );
  }

  @Roles("ADMIN", "RECEPCAO")
  @Post(":id/photo/confirm")
  confirmPhoto(
    @Req() req: { user: AuthUser },
    @Param("id") id: string,
    @Body() body: { photoUrl?: string },
  ) {
    if (!body?.photoUrl) throw new BadRequestException("Informe photoUrl");
    this.storage.assertOwnedUrl(body.photoUrl, "professionals");
    return this.professionals.updatePhoto(id, body.photoUrl, req.user.role);
  }

  @Roles("ADMIN")
  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.professionals.remove(id);
  }
}
