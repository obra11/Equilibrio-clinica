import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { AppointmentsService } from "./appointments.service";
import { JwtAuthGuard } from "../common/guards";

@UseGuards(JwtAuthGuard)
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

  @Post()
  create(@Body() body: Record<string, unknown>) {
    return this.appointments.create(body as never);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() body: Record<string, unknown>) {
    return this.appointments.update(id, body as never);
  }

  @Patch(":id/status")
  status(@Param("id") id: string, @Body() body: { status: string }) {
    return this.appointments.updateStatus(id, body.status);
  }
}
