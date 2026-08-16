import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ClinicalService } from "./clinical.service";
import { JwtAuthGuard } from "../common/guards";

@UseGuards(JwtAuthGuard)
@Controller("clinical")
export class ClinicalController {
  constructor(private clinical: ClinicalService) {}

  @Get("patients/:patientId/timeline")
  timeline(@Param("patientId") patientId: string) {
    return this.clinical.timeline(patientId);
  }

  @Post("notes")
  createNote(@Body() body: Record<string, unknown>) {
    return this.clinical.createNote(body as never);
  }

  @Post("assessments")
  createAssessment(@Body() body: Record<string, unknown>) {
    return this.clinical.createAssessment(body as never);
  }
}
