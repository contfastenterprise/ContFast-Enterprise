import ExcelJS from 'exceljs';

export interface ExcelColumn {
  header: string;
  key: string;
  width?: number;
  isCurrency?: boolean;
}

export class ExcelGenerator {
  /**
   * Generates an Excel buffer based on columns and data.
   * @param title The title of the report
   * @param columns Definition of columns
   * @param data Array of objects mapping to column keys
   * @param totals Optional row of totals
   */
  static async generateReport(title: string, columns: ExcelColumn[], data: any[], totals?: any): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'ContFast Enterprise';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Reporte');

    // Add Title
    sheet.mergeCells('A1', `${String.fromCharCode(65 + columns.length - 1)}1`);
    const titleCell = sheet.getCell('A1');
    titleCell.value = title;
    titleCell.font = { size: 14, bold: true };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
    
    // Add spacer
    sheet.addRow([]);

    // Add Headers
    const headerRow = sheet.addRow(columns.map(c => c.header));
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };

    // Configure Columns
    sheet.columns = columns.map(c => ({
      key: c.key,
      width: c.width || 15,
      style: c.isCurrency ? { numFmt: '"$"#,##0.00' } : {}
    }));

    // Re-apply header styles since configuring columns overrides the header row sometimes
    headerRow.eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });

    // Add Data
    data.forEach(item => {
      sheet.addRow(item);
    });

    // Add Totals
    if (totals) {
      const totalsRow = sheet.addRow(totals);
      totalsRow.font = { bold: true };
      totalsRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF5F5F5' }
      };
      totalsRow.eachCell((cell) => {
        cell.border = { top: { style: 'double' } };
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
