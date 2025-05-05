import {
    Transaction as FirestoreTransaction,
    ReadOnlyTransactionOptions,
    ReadWriteTransactionOptions,
    WriteBatch,
    WriteResult,
} from "firebase-admin/firestore";
import { getFirestoreInstance } from "../config/firestore-instance";
import { transactionContext } from "./context"; // Adjust path if needed

/**
 * Runs a Firestore transaction with implicit ORM context management.
 * ORM methods (save, update, delete) called within the callback will automatically use the transaction.
 *
 * @template T The return type of the transaction callback.
 * @param callback The function to execute within the transaction. It receives the Firestore Transaction object.
 * All reads should occur before writes.
 * @param transactionOptions Optional Firestore transaction options.
 * @returns A Promise resolving with the value returned by the callback.
 * @throws Throws an error if the transaction fails or if the callback throws an error.
 */
export async function runInTransaction<T>(
  callback: (transaction: FirestoreTransaction) => Promise<T>,
  transactionOptions?: ReadWriteTransactionOptions | ReadOnlyTransactionOptions
): Promise<T> {
  const db = getFirestoreInstance();

  // Use Firestore's runTransaction
  return db.runTransaction(async (transaction) => {
    // Use AsyncLocalStorage.run to set the context *inside* the Firestore transaction callback
    // The value stored is the transaction object itself.
    return transactionContext.run(transaction, () => {
      return callback(transaction);
    });
  }, transactionOptions);
}

/**
 * Result structure for runInBatch operation.
 */
export interface BatchResult<T> {
  /** The results from Firestore after committing the batch. */
  commitResults: WriteResult[];
  /** The value returned by the user's callback function. */
  callbackResult: T;
}

/**
 * Executes a series of ORM operations within a Firestore Batched Write.
 * ORM methods (save, update, delete) called within the callback will automatically be added to the batch.
 * The batch is committed automatically after the callback completes successfully.
 *
 * @template T The return type of the batch callback function.
 * @param callback The function to execute. It receives the Firestore WriteBatch object.
 * This function queues ORM operations using `save`, `update`, `delete`.
 * It can be sync or async.
 * @returns A Promise resolving with an object containing the commit results and the callback's return value.
 * @throws Throws an error if the callback throws or if the batch commit fails.
 */
export async function runInBatch<T>(
  callback: (batch: WriteBatch) => Promise<T> | T
): Promise<BatchResult<T>> {
  const db = getFirestoreInstance();
  const batch = db.batch();
  let callbackResult: T;

  try {
    // Run the user's callback within the ALS context for the batch
    // The value stored is the batch object itself.
    await transactionContext.run(batch, async () => {
      callbackResult = await Promise.resolve(callback(batch)); // Execute user logic to queue operations
    });

    // Commit the batch *after* the user's callback finishes and outside the ALS context
    const commitResults = await batch.commit();

    return { commitResults: commitResults, callbackResult: callbackResult! };
  } catch (error) {
    console.error(
      "[runInBatch] Error during batch execution or commit:",
      error
    );
    throw error;
  }
}
