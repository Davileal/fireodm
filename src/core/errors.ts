import { ZodIssue } from 'zod';

/**
 * Base class for custom ORM errors.
 */
export class OrmError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name; // Set name to the specific error class
    // Maintains proper stack trace in V8 environments (Node.js)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Error thrown when Zod validation fails on a model instance.
 */
export class ValidationError extends OrmError {
  /**
   * Array of Zod validation issues.
   */
  public issues: ZodIssue[];

  /**
   * Creates an instance of ValidationError.
   * @param message The error message.
   * @param issues An array of Zod validation issues.
   */
  constructor(message: string, issues: ZodIssue[]) {
    super(message);
    this.issues = issues;
  }
}

/**
 * Error thrown when a requested Firestore document is not found.
 */
export class NotFoundError extends OrmError {
  /**
   * The name of the model class being searched.
   */
  public modelName: string;
  /**
   * The ID of the document that was not found.
   */
  public documentId: string;

  /**
   * Creates an instance of NotFoundError.
   * @param modelName The name of the model class.
   * @param documentId The ID of the document.
   */
  constructor(modelName: string, documentId: string) {
    super(`Document not found: ${modelName} with ID ${documentId}`);
    this.modelName = modelName;
    this.documentId = documentId;
  }
}