import { AsyncLocalStorage } from 'async_hooks';
import { Transaction as FirestoreTransaction, WriteBatch } from 'firebase-admin/firestore';

/**
 * Defines the type of context that can be stored.
 * It can be a Firestore Transaction, a WriteBatch, or undefined if no context is active.
 */
export type OrmTransactionContext = FirestoreTransaction | WriteBatch | undefined;

/**
 * AsyncLocalStorage instance to hold the active Firestore Transaction or WriteBatch
 * for the current asynchronous execution context.
 */
export const transactionContext = new AsyncLocalStorage<OrmTransactionContext>();