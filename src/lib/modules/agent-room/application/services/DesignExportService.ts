import PDFDocument from 'pdfkit';
import type { ExportDesignPdfDto } from '../dto/DesignDtos.js';

export class DesignExportService {
  async pdf(dto: ExportDesignPdfDto): Promise<Uint8Array> {
    const image = Buffer.from(dto.dataUrl.slice('data:image/png;base64,'.length), 'base64');
    const document = new PDFDocument({ size: [dto.width, dto.height], margin: 0, autoFirstPage: true });
    const chunks: Buffer[] = [];
    document.on('data', (chunk: Buffer) => chunks.push(chunk));
    const complete = new Promise<Uint8Array>((resolve, reject) => {
      document.on('end', () => resolve(new Uint8Array(Buffer.concat(chunks))));
      document.on('error', reject);
    });
    document.image(image, 0, 0, { width: dto.width, height: dto.height });
    document.end();
    return complete;
  }
}

export const designExportService = new DesignExportService();
