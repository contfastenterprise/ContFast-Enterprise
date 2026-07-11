import { ReportRepository } from '../src/repositories/reportRepository';
import { DocumentTemplates } from '../src/utils/templates/documentTemplates';
import { db, customers } from '../src/db';

async function main() {
  try {
    const cust = await db.select().from(customers).limit(10);
    // Find customer with pending AR balance
    let targetCust = cust[0];
    let result;
    for (const c of cust) {
      result = await ReportRepository.getARStatement(c.companyId, c.id);
      if (result.openItems.length > 0) {
        targetCust = c;
        break;
      }
    }
    
    if (!result || result.openItems.length === 0) {
      console.log('No customer with open items found to test HTML render');
      process.exit(0);
    }

    const html = DocumentTemplates.renderARStatement({
      company: {
        name: 'Test Company',
        rnc: '123456789',
        address: 'Santo Domingo',
        phone: '809-555-5555'
      },
      customer: {
        name: targetCust.name,
        rncCedula: targetCust.rncCedula || ''
      },
      openItems: result.openItems,
      totalPending: result.totalPending
    }, '2026-06-30');

    console.log('Open items data passed:', result.openItems);
    console.log('Generated HTML output snippets containing date:');
    const lines = html.split('\n');
    lines.forEach(line => {
      if (line.includes('tr') || line.includes('td') || line.includes('es-DO')) {
        console.log(line.trim());
      }
    });

  } catch (err) {
    console.error('Error:', err);
  }
  process.exit(0);
}

main();
