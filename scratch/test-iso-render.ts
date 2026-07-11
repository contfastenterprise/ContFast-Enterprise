import { DocumentTemplates } from '../src/utils/templates/documentTemplates';

const html = DocumentTemplates.renderARStatement({
  company: { name: 'Test Company', rnc: '123' },
  customer: { name: 'Test Customer', rncCedula: '123' },
  openItems: [
    {
      date: new Date(),
      dueDate: '2026-07-30',
      codigoFactura: 'FAC-1',
      ncf: 'NCF-1',
      amount: 100,
      balance: 100
    }
  ],
  totalPending: 100
}, '2026-06-30');

console.log(html.includes('Invalid Date') ? 'FAILED: Invalid Date found' : 'PASSED: Date formatted correctly');
// Print the table row
const rowStart = html.indexOf('<tr>', html.indexOf('<tbody>'));
const rowEnd = html.indexOf('</tr>', rowStart) + 5;
console.log(html.substring(rowStart, rowEnd));
process.exit(0);
