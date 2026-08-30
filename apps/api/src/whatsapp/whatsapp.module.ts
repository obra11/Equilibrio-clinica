import { Global, Module } from "@nestjs/common";
import { WhatsappService } from "./whatsapp.service";
import { WhatsappController } from "./whatsapp.controller";

@Global()
@Module({
  controllers: [WhatsappController],
  providers: [WhatsappService],
  exports: [WhatsappService],
})
export class WhatsappModule {}
