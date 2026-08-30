import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { DashboardService } from "./dashboard.service";
import { AuthUser } from "../common/auth-user";
import { JwtAuthGuard, Roles, RolesGuard } from "../common/guards";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("dashboard")
export class DashboardController {
  constructor(private dashboard: DashboardService) {}

  @Get("summary")
  summary(@Req() req: { user: AuthUser }) {
    return this.dashboard.summary(req.user.role);
  }

  @Roles("ADMIN", "RECEPCAO")
  @Post("remind-today")
  remindToday(@Body() body: { scope?: "appointments" | "classes" | "all" }) {
    return this.dashboard.remindToday(body?.scope || "all");
  }
}
