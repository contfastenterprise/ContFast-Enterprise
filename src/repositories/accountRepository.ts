import { AccountingRepository } from './accountingRepository';

/**
 * Backward compatibility wrapper alias for AccountingRepository
 */
export const AccountRepository = AccountingRepository;
export type CreateJournalEntryInput = import('./accountingRepository').CreateJournalEntryInput;
