# ContFast-Enterprise

Robust, secure, and production-ready electronic billing (e-CF) backend API for the Dominican Republic (DGII).

## Technical Stack
- **Backend**: Node.js & TypeScript with Express.js
- **Database**: PostgreSQL (Supabase) with Drizzle ORM
- **Cache & Queues**: Redis & BullMQ
- **Security**: JWT (HttpOnly cookies) with rotation, bcrypt, and AES-256 for certificate encryption.
- **PDF & Reports**: Server-side generation using `pdfkit` and `exceljs`.

## Getting Started
1. Copy `.env.example` to `.env` and fill in the required credentials.
2. Install dependencies: `npm install`
3. Run migrations and start the server.
