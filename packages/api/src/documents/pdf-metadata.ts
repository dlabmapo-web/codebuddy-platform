import type { PdfAsset, PdfDocument } from "../generated/prisma/client.js";
export function pdfMetadata(doc: Pick<PdfDocument, "placement" | "revision"> & {
  asset: Pick<PdfAsset, "originalFilename" | "byteSize" | "pageCount">;
}) {
  return {
    placement: doc.placement,
    revision: doc.revision,
    originalFilename: doc.asset.originalFilename,
    byteSize: doc.asset.byteSize,
    pageCount: doc.asset.pageCount,
  };
}
