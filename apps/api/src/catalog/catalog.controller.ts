import { Controller, Get, UseGuards } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { JwtAuthGuard } from "../common/guards";

@UseGuards(JwtAuthGuard)
@Controller("catalog")
export class CatalogController {
  constructor(private prisma: PrismaService) {}

  @Get("services")
  services() {
    return this.prisma.serviceType.findMany({ where: { active: true }, orderBy: { name: "asc" } });
  }

  @Get("rooms")
  rooms() {
    return this.prisma.room.findMany({ where: { active: true }, orderBy: { name: "asc" } });
  }
}
