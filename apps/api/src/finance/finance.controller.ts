import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { FinanceService } from "./finance.service";
import { AuthUser } from "../common/auth-user";
import { JwtAuthGuard, Roles, RolesGuard } from "../common/guards";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("finance")
export class FinanceController {
  constructor(private finance: FinanceService) {}

  @Roles("ADMIN", "RECEPCAO")
  @Get("dashboard")
  dashboard(@Req() req: { user: AuthUser }) {
    return this.finance.dashboard(req.user.role);
  }

  @Roles("ADMIN", "RECEPCAO")
  @Get("receivables")
  receivables() {
    return this.finance.listReceivables();
  }

  @Roles("ADMIN")
  @Get("payables")
  payables() {
    return this.finance.listPayables();
  }

  @Roles("ADMIN", "RECEPCAO")
  @Get("categories")
  categories() {
    return this.finance.categories();
  }

  @Roles("ADMIN")
  @Post("categories")
  createCategory(@Body() body: Record<string, unknown>) {
    return this.finance.createCategory(body as never);
  }

  @Roles("ADMIN", "RECEPCAO")
  @Post("receivables")
  createReceivable(@Body() body: Record<string, unknown>) {
    return this.finance.createReceivable(body as never);
  }

  @Roles("ADMIN")
  @Post("payables")
  createPayable(@Body() body: Record<string, unknown>) {
    return this.finance.createPayable(body as never);
  }

  @Roles("ADMIN", "RECEPCAO")
  @Post("receivables/:id/payments")
  payReceivable(@Param("id") id: string, @Body() body: Record<string, unknown>) {
    return this.finance.payReceivable(id, body as never);
  }

  @Roles("ADMIN")
  @Post("payables/:id/payments")
  payPayable(@Param("id") id: string, @Body() body: Record<string, unknown>) {
    return this.finance.payPayable(id, body as never);
  }
}
