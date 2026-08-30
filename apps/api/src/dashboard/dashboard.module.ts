import { Module } from "@nestjs/common";
import { DashboardController } from "./dashboard.controller";
import { DashboardService } from "./dashboard.service";
import { AppointmentsModule } from "../appointments/appointments.module";
import { ClassesModule } from "../classes/classes.module";

@Module({
  imports: [AppointmentsModule, ClassesModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
