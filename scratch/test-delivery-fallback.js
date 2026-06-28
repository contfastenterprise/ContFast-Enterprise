"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const queue_1 = require("./src/infrastructure/queue");
const fs = require("fs");
const path = require("path");
// Simple manual .env parser since dotenv might not be in node_modules directly
function loadEnv() {
    const envPath = path.join(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        content.split('\n').forEach(line => {
            const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
            if (match) {
                const key = match[1];
                let val = match[2].trim();
                if (val.startsWith('"') && val.endsWith('"')) {
                    val = val.substring(1, val.length - 1);
                }
                else if (val.startsWith("'") && val.endsWith("'")) {
                    val = val.substring(1, val.length - 1);
                }
                process.env[key] = val;
            }
        });
    }
}
loadEnv();
async function runTest() {
    console.log('--- STARTING DELIVERY FALLBACK TEST ---');
    console.log('Redis URL:', process.env.REDIS_URL);
    console.log('SMTP Host:', process.env.SMTP_HOST);
    console.log('SMTP From:', process.env.SMTP_FROM);
    const emailData = {
        to: 'latindoors@gmail.com', // testing target or user email
        subject: `Test Email Fallback - ${new Date().toISOString()}`,
        text: 'This is a test to verify that the queue fallback mechanism works perfectly when Redis is offline.',
        html: '<p>This is a <strong>test</strong> to verify that the queue fallback mechanism works perfectly when Redis is offline.</p>'
    };
    console.log('\nEnqueuing email sending job via addJob...');
    const job = await (0, queue_1.addJob)('emails-sending', 'send-email-test', emailData);
    if (job) {
        console.log('Successfully enqueued / processed job! Job Details:', {
            id: job.id,
            name: job.name,
            to: job.data.to,
            subject: job.data.subject
        });
    }
    else {
        console.error('Job enqueuing returned null!');
    }
    // Wait 3 seconds to let the async background process finish and print its logs
    console.log('\nWaiting for background execution logs...');
    await new Promise((resolve) => setTimeout(resolve, 3000));
    console.log('--- TEST FINISHED ---');
}
runTest().catch(console.error);
