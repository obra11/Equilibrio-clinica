import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { FinanceService } from "./finance.service";
import { JwtAuthGuard } from "../common/guards";

@UseGuards(JwtAuthGuard)
@Controller("finance")
export class FinanceController {
  constructor(private finance: FinanceService) {}

  @Get("dashboard")
  dashboard() {
    return this.finance.dashboard();
  }

  @Get("receivables")
  receivables() {
    return this.finance.listReceivables();
  }

  @Get("payables")
  payables() {
    return this.finance.listPayables();
  }

  @Get("categories")
  categories() {
    return this.finance.categories();
  }

  @Post("categories")
  createCategory(@Body() body: Record<string, unknown>) {
    return this.finance.createCategory(body as never);
  }

  @Post("receivables")
  createReceivable(@Body() body: Record<string, unknown>) {
    return this.finance.createReceivable(body as never);
  }

  @Post("payables")
  createPayable(@Body() body: Record<string, unknown>) {
    return this.finance.createPayable(body as never);
  }

  @Post("receivables/:id/payments")
  payReceivable(@Param("id") id: string, @Body() body: Record<string, unknown>) {
    return this.finance.payReceivable(id, body as never);
  }

  @Post("payables/:id/payments")
  payPayable(@Param("id") id: string, @Body() body: Record<string, unknown>) {
    return this.finance.payPayable(id, body as never);
  }
}
