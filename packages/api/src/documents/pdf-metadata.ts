import type { PdfAsset, PdfDocument } from "../generated/prisma/client.js";
export function pdfMetadata(doc: PdfDocument & { asset: PdfAsset }) {
  return {
    placement: doc.placement,
    revision: doc.revision,
    originalFilename: doc.asset.originalFilename,
    byteSize: doc.asset.byteSize,
    pageCount: doc.asset.pageCount,
  };
}
