const postgres = require('postgres');

const sql = postgres(process.env.DIRECT_DATABASE_URL, {
  ssl: 'require',
});

async function main() {
  try {
    console.log('Creating agent_proposals table...');
    await sql`
      CREATE TABLE IF NOT EXISTS agent_proposals (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          company_id UUID NOT NULL REFERENCES companies(id),
          modo environment_mode DEFAULT 'PRODUCCION' NOT NULL,
          area VARCHAR(50) NOT NULL,
          summary TEXT NOT NULL,
          justification TEXT NOT NULL,
          confidence_level VARCHAR(20) NOT NULL,
          risk_level VARCHAR(20) NOT NULL,
          status VARCHAR(20) DEFAULT 'pending' NOT NULL,
          user_id UUID REFERENCES users(id),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
          deleted_at TIMESTAMP
      );
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS agent_proposals_company_modo_idx ON agent_proposals(company_id, modo);
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS agent_proposals_area_idx ON agent_proposals(area);
    `;
    console.log('Success');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await sql.end();
  }
}

main();
