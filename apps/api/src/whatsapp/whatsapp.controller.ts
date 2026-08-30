import { Controller, Get, UseGuards } from "@nestjs/common";
import { WhatsappService } from "./whatsapp.service";
import { JwtAuthGuard } from "../common/guards";

@UseGuards(JwtAuthGuard)
@Controller("whatsapp")
export class WhatsappController {
  constructor(private whatsapp: WhatsappService) {}

  @Get("config")
  config() {
    return this.whatsapp.configPublic();
  }
}
