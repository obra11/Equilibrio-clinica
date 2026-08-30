import { Module } from "@nestjs/common";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { PatientsModule } from "./patients/patients.module";
import { ProfessionalsModule } from "./professionals/professionals.module";
import { AppointmentsModule } from "./appointments/appointments.module";
import { ClassesModule } from "./classes/classes.module";
import { ClinicalModule } from "./clinical/clinical.module";
import { FinanceModule } from "./finance/finance.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { CatalogModule } from "./catalog/catalog.module";
import { WhatsappModule } from "./whatsapp/whatsapp.module";
import { EmailModule } from "./email/email.module";
import { MediaModule } from "./media/media.module";
import { StorageModule } from "./storage/storage.module";

@Module({
  imports: [
    PrismaModule,
    WhatsappModule,
    EmailModule,
    AuthModule,
    StorageModule,
    MediaModule,
    PatientsModule,
    ProfessionalsModule,
    AppointmentsModule,
    ClassesModule,
    ClinicalModule,
    FinanceModule,
    DashboardModule,
    CatalogModule,
  ],
})
export class AppModule {}
