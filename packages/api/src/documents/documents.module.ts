import { Module } from "@nestjs/common";
import { AcademiesModule } from "../academies/academies.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { AuthorizationModule } from "../authorization/authorization.module.js";
import { PdfDocumentController } from "./pdf-document.controller.js";
import { PdfDocumentService } from "./pdf-document.service.js";
import { PdfStorageService } from "./pdf-storage.service.js";
@Module({
  imports: [AcademiesModule, AuthModule, AuthorizationModule],
  controllers: [PdfDocumentController],
  providers: [PdfDocumentService, PdfStorageService],
  exports: [PdfDocumentService],
})
export class DocumentsModule {}
