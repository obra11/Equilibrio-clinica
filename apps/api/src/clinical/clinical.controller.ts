import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ClinicalService } from "./clinical.service";
import { AuthUser, isClinician } from "../common/auth-user";
import { JwtAuthGuard, Roles, RolesGuard } from "../common/guards";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("clinical")
export class ClinicalController {
  constructor(private clinical: ClinicalService) {}

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
