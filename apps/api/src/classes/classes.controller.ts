import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ClassesService } from "./classes.service";
import { JwtAuthGuard, Roles, RolesGuard } from "../common/guards";

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

  @Roles("ADMIN", "RECEPCAO")
  @Patch(":id")
  update(@Param("id") id: string, @Body() body: Record<string, unknown>) {
    return this.classes.update(id, body as never);
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
