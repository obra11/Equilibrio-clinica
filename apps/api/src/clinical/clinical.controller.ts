import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { extname } from "path";
import { ClinicalService } from "./clinical.service";
import {
  CLINICAL_ALLOWED_EXTS,
  attachmentKindFromExt,
} from "./clinical-attachments";
import { AuthUser, isClinician } from "../common/auth-user";
import { JwtAuthGuard, Roles, RolesGuard } from "../common/guards";
import { ensureUploadDir } from "../common/uploads-path";
import { StorageService } from "../storage/storage.service";

const clinicalDir = ensureUploadDir("clinical");

const IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const VIDEO_MIMES = ["video/mp4", "video/webm", "video/quicktime", "video/x-m4v"];
const DOC_MIMES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "application/rtf",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/octet-stream",
];

function uploadInterceptor() {
  return FileInterceptor("file", {
    storage: diskStorage({
      destination: clinicalDir,
      filename: (_req, file, cb) => {
        const ext = extname(file.originalname).toLowerCase() || ".bin";
        const safeExt = CLINICAL_ALLOWED_EXTS.includes(ext) ? ext : ".bin";
        cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}${safeExt}`);
      },
    }),
    limits: { fileSize: 80 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const ext = extname(file.originalname).toLowerCase();
      const okExt = !ext || CLINICAL_ALLOWED_EXTS.includes(ext);
      const okMime = [...IMAGE_MIMES, ...VIDEO_MIMES, ...DOC_MIMES].includes(file.mimetype);
      if (!okExt || (!okMime && ext && !CLINICAL_ALLOWED_EXTS.includes(ext))) {
        cb(
          new BadRequestException(
            "Envie foto, vídeo ou documento (PDF, Word, Excel, PowerPoint, TXT, CSV…)",
          ) as never,
          false,
        );
        return;
      }
      cb(null, true);
    },
  });
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("clinical")
export class ClinicalController {
  constructor(
    private clinical: ClinicalService,
    private storage: StorageService,
  ) {}

  @Roles("ADMIN", "FISIOTERAPEUTA")
  @Get("patients/:patientId/timeline")
  timeline(@Param("patientId") patientId: string) {
    return this.clinical.timeline(patientId);
  }

  @Roles("ADMIN", "FISIOTERAPEUTA")
  @Post("notes")
  createNote(
    @Req() req: { user: AuthUser },
    @Body() body: Record<string, unknown>,
  ) {
    const professionalId = this.requireProfessionalId(req.user);
    return this.clinical.createNote({
      patientId: String(body.patientId || ""),
      professionalId,
      appointmentId: (body.appointmentId as string) || null,
      subjective: (body.subjective as string) || null,
      objective: (body.objective as string) || null,
      assessment: (body.assessment as string) || null,
      plan: (body.plan as string) || null,
    });
  }

  @Roles("ADMIN", "FISIOTERAPEUTA")
  @Post("assessments")
  createAssessment(
    @Req() req: { user: AuthUser },
    @Body() body: Record<string, unknown>,
  ) {
    const professionalId = this.requireProfessionalId(req.user);
    return this.clinical.createAssessment({
      patientId: String(body.patientId || ""),
      professionalId,
      painVas: body.painVas === undefined || body.painVas === null ? null : Number(body.painVas),
      romNotes: (body.romNotes as string) || null,
      strengthNotes: (body.strengthNotes as string) || null,
      functionalTests: (body.functionalTests as string) || null,
      observations: (body.observations as string) || null,
    });
  }

  @Roles("ADMIN", "FISIOTERAPEUTA")
  @Post("notes/:id/attachments")
  @UseInterceptors(uploadInterceptor())
  uploadNoteAttachment(
    @Param("id") id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException("Nenhum arquivo enviado");
    const ext = extname(file.filename).toLowerCase();
    return this.clinical.addNoteAttachment(id, {
      url: `/uploads/clinical/${file.filename}`,
      kind: attachmentKindFromExt(ext),
      name: file.originalname,
      mime: file.mimetype,
    });
  }

  @Roles("ADMIN", "FISIOTERAPEUTA")
  @Post("notes/:id/attachments/confirm")
  confirmNoteAttachment(
    @Param("id") id: string,
    @Body()
    body: {
      url?: string;
      kind?: "image" | "video" | "document";
      name?: string;
      mime?: string;
    },
  ) {
    if (!body?.url) throw new BadRequestException("Informe a URL do anexo");
    this.storage.assertOwnedUrl(body.url, "clinical");
    const ext = extname(body.name || body.url).toLowerCase();
    return this.clinical.addNoteAttachment(id, {
      url: body.url,
      kind: body.kind || attachmentKindFromExt(ext),
      name: body.name || "arquivo",
      mime: body.mime,
    });
  }

  @Roles("ADMIN", "FISIOTERAPEUTA")
  @Delete("notes/:id/attachments")
  async removeNoteAttachment(@Param("id") id: string, @Body() body: { url?: string }) {
    if (!body?.url) throw new BadRequestException("Informe a URL do anexo");
    const result = await this.clinical.removeNoteAttachment(id, body.url);
    await this.storage.deleteByStoredUrl(body.url);
    return result;
  }

  @Roles("ADMIN", "FISIOTERAPEUTA")
  @Post("assessments/:id/attachments")
  @UseInterceptors(uploadInterceptor())
  uploadAssessmentAttachment(
    @Param("id") id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException("Nenhum arquivo enviado");
    const ext = extname(file.filename).toLowerCase();
    return this.clinical.addAssessmentAttachment(id, {
      url: `/uploads/clinical/${file.filename}`,
      kind: attachmentKindFromExt(ext),
      name: file.originalname,
      mime: file.mimetype,
    });
  }

  @Roles("ADMIN", "FISIOTERAPEUTA")
  @Post("assessments/:id/attachments/confirm")
  confirmAssessmentAttachment(
    @Param("id") id: string,
    @Body()
    body: {
      url?: string;
      kind?: "image" | "video" | "document";
      name?: string;
      mime?: string;
    },
  ) {
    if (!body?.url) throw new BadRequestException("Informe a URL do anexo");
    this.storage.assertOwnedUrl(body.url, "clinical");
    const ext = extname(body.name || body.url).toLowerCase();
    return this.clinical.addAssessmentAttachment(id, {
      url: body.url,
      kind: body.kind || attachmentKindFromExt(ext),
      name: body.name || "arquivo",
      mime: body.mime,
    });
  }

  @Roles("ADMIN", "FISIOTERAPEUTA")
  @Delete("assessments/:id/attachments")
  async removeAssessmentAttachment(
    @Param("id") id: string,
    @Body() body: { url?: string },
  ) {
    if (!body?.url) throw new BadRequestException("Informe a URL do anexo");
    const result = await this.clinical.removeAssessmentAttachment(id, body.url);
    await this.storage.deleteByStoredUrl(body.url);
    return result;
  }

  private requireProfessionalId(user: AuthUser) {
    if (!isClinician(user.role)) {
      throw new ForbiddenException("Sem permissão clínica");
    }
    if (!user.professionalId) {
      throw new BadRequestException(
        "Seu usuário não está vinculado a um profissional para registrar evolução",
      );
    }
    return user.professionalId;
  }
}
