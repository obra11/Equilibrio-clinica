import { BadRequestException, Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard, RolesGuard } from "../common/guards";
import { StorageFolder, StorageKind, StorageService } from "./storage.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("storage")
export class StorageController {
  constructor(private storage: StorageService) {}

  @Get("status")
  status() {
    return this.storage.status();
  }

  @Post("presign")
  presign(
    @Body()
    body: {
      folder?: string;
      contentType?: string;
      fileName?: string;
      fileSize?: number;
      kind?: StorageKind;
    },
  ) {
    return this.storage.createPresignedUpload({
      folder: (body.folder || "") as StorageFolder,
      contentType: body.contentType || "",
      fileName: body.fileName || "file",
      fileSize: body.fileSize,
      kind: body.kind,
    });
  }

  @Post("sign-read")
  signRead(@Body() body: { url?: string }) {
    if (!body?.url) throw new BadRequestException("Informe url");
    return this.storage.createPresignedRead(body.url);
  }
}
