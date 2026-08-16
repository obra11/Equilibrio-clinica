import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { DashboardService } from "./dashboard.service";
import { AuthUser } from "../common/auth-user";
import { JwtAuthGuard } from "../common/guards";

@UseGuards(JwtAuthGuard)
@Controller("dashboard")
export class DashboardController {
  constructor(private dashboard: DashboardService) {}

  @Get("summary")
  summary(@Req() req: { user: AuthUser }) {
    return this.dashboard.summary(req.user.role);
  }
}
