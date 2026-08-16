import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AppointmentsService } from "./appointments.service";
import { JwtAuthGuard, Roles, RolesGuard } from "../common/guards";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("appointments")
export class AppointmentsController {
  constructor(private appointments: AppointmentsService) {}

  @Get()
  list(
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("professionalId") professionalId?: string,
  ) {
    return this.appointments.list({ from, to, professionalId });
  }

  @Roles("ADMIN", "RECEPCAO")
  @Post()
  create(@Body() body: Record<string, unknown>) {
    return this.appointments.create(body as never);
  }

  @Roles("ADMIN", "RECEPCAO")
  @Patch(":id")
  update(@Param("id") id: string, @Body() body: Record<string, unknown>) {
    return this.appointments.update(id, body as never);
  }

  @Roles("ADMIN", "RECEPCAO", "FISIOTERAPEUTA")
  @Patch(":id/status")
  status(@Param("id") id: string, @Body() body: { status: string }) {
    return this.appointments.updateStatus(id, body.status);
  }
}
