import {
  CollectionReference,
  DocumentData,
  DocumentReference,
  DocumentSnapshot,
  FieldPath,
  FieldValue,
  FirestoreDataConverter,
  Transaction as FirestoreTransaction,
  GeoPoint,
  Query,
  QueryDocumentSnapshot,
  SetOptions,
  Timestamp,
  UpdateData,
  WhereFilterOp,
  WriteBatch,
  WriteResult,
} from "firebase-admin/firestore";
import "reflect-metadata";
import { ZodError, ZodSchema } from "zod";
import { getFirestoreInstance } from "../config/firestore-instance";
import {
  BOOLEAN_KEY,
  getCollectionName,
  getRelationMetadata,
  TIMESTAMP_KEY,
} from "./decorators";
import { NotFoundError, ValidationError } from "./errors";
import {
  BaseModelConstructor,
  BaseModelInterface,
  FindAllResult,
  FindOptions,
  RelationMetadata,
} from "./types";
import { getValidationSchema } from "./validation";

function isFirestoreTransaction(obj: any): obj is FirestoreTransaction {
  // The transaction object passed to Runtransaction has methods such as get, set, update, delete
  // But * no * has Commit (Commit is implicit at the end of Runtransaction).
  // The presence of 'get' is a good indicator.
  return (
    obj &&
    typeof obj.get === "function" &&
    typeof obj.set === "function" &&
    typeof obj.update === "function" &&
    typeof obj.delete === "function"
  );
}

function isWriteBatch(obj: any): obj is WriteBatch {
  // Writebatch has set, update, delete and commit.The absence of 'get' helps to differentiate.
  return (
    obj && typeof obj.commit === "function" && typeof obj.get === "undefined"
  );
}

export abstract class BaseModel implements BaseModelInterface {
  public id?: string;

  private static _builtSchema?: ZodSchema<any>;
  static get schema(): ZodSchema<any> {
    if (!this._builtSchema) {
      this._builtSchema = getValidationSchema(this as any);
    }
    return this._builtSchema;
  }

  // cache for popular relationships (avoids recharge)
  protected _populatedRelations: {
    [key: string]: BaseModel | BaseModel[] | null;
  } = {};

  constructor(data: Partial<Record<string, any>>, id?: string) {
    Object.assign(this, data);
    if (id) {
      this.id = id;
    }
  }

  // --- Static methods ---

  static _getCollectionName(): string {
    const name = getCollectionName(this);
    if (!name) {
      throw new Error(
        `@Collection decorator is not defined on class ${this.name}`
      );
    }
    return name;
  }

  static _getRelationMetadata(): RelationMetadata[] {
    return getRelationMetadata(this);
  }

  static getCollectionRef<T extends BaseModel>(
    this: BaseModelConstructor<T>
  ): CollectionReference<T> {
    const db = getFirestoreInstance();
    return db
      .collection(this._getCollectionName())
      .withConverter(this._getFirestoreConverter());
  }

  static _getFirestoreConverter<T extends BaseModel>(
    this: BaseModelConstructor<T>
  ): FirestoreDataConverter<T> {
    const Self = this;
    return {
      toFirestore(modelInstance: T): DocumentData {
        return modelInstance._toFirestore(true);
      },
      fromFirestore(snapshot: QueryDocumentSnapshot, options?: any): T {
        const instance = Self._fromFirestore(snapshot);
        if (!instance) {
          throw new Error(
            `Failed to convert snapshot ${snapshot.id} to ${Self.name}`
          );
        }
        return instance;
      },
    };
  }

  static _fromFirestore<T extends BaseModel>(
    this: BaseModelConstructor<T>,
    snapshot: DocumentSnapshot | QueryDocumentSnapshot
  ): T | null {
    if (!snapshot.exists) {
      return null;
    }
    const data = snapshot.data() as DocumentData;
    const relationMeta = this._getRelationMetadata();
    const instanceData: Partial<T> = {};

    // Separate data into relational and non-relational for the constructor
    for (const key in data) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        // Check if it's a relation field that holds a DocumentReference
        const isRelationRef = relationMeta.some(
          (meta) =>
            meta.propertyName === key && data[key] instanceof DocumentReference
        );
        if (!isRelationRef) {
          (instanceData as any)[key] = data[key];
        }
      }
    }

    // Create the instance with non-relational data
    const instance = new this(instanceData, snapshot.id);

    // Now, assign DocumentReferences for relations directly to the instance
    relationMeta.forEach((meta) => {
      const refData = snapshot.get(meta.propertyName);
      if (refData instanceof DocumentReference) {
        (instance as any)[meta.propertyName] = refData;
      }
      // If data[meta.propertyName] was not a DocumentReference but existed (e.g., nested map),
      // Object.assign in the constructor likely handled it.
    });

    // Call afterLoad hook (async, non-blocking)
    Promise.resolve(instance.afterLoad(snapshot)).catch((err) => {
      console.error(
        `Error in afterLoad hook for ${this.name} ID ${instance.id}:`,
        err
      );
    });

    return instance;
  }

  static async findById<T extends BaseModel>(
    this: BaseModelConstructor<T>,
    id: string,
    options?: FindOptions<T>
  ): Promise<T | null> {
    try {
      const docRef = this.getCollectionRef().doc(id);
      const docSnap = await docRef.get();

      // _fromFirestore handles instance creation and afterLoad hook
      const instance = this._fromFirestore(docSnap);

      if (!instance) return null;

      const meta = this._getRelationMetadata();
      const eagerFields = meta
        .filter((m) => !m.lazy)
        .map((m) => m.propertyName);

      if (options?.populate) {
        await instance.populate(options.populate as any);
      } else if (eagerFields.length) {
        await instance.populate(eagerFields as any);
      }

      return instance;
    } catch (error) {
      // Don't log generic errors here, let the caller handle or log specific cases
      if ((error as any)?.code === 5) {
        // Firestore 'NOT_FOUND' gRPC code
        return null; // Standard behavior: return null if not found
      }
      // Re-throw other errors
      throw error;
    }
  }

  static async findAll<T extends BaseModel>(
    this: BaseModelConstructor<T>,
    options?: FindOptions<T> & {
      queryFn?: (ref: CollectionReference<T>) => Query<T>;
    }
  ): Promise<FindAllResult<T>> {
    try {
      let query: Query<T> = this.getCollectionRef();

      if (options?.queryFn) {
        query = options.queryFn(this.getCollectionRef());
      }

      // Apply ordering if specified, or default if using pagination cursors
      if (options?.orderBy) {
        query = query.orderBy(
          options.orderBy.field as string,
          options.orderBy.direction
        );
      } else if (
        options?.startAfter ||
        options?.startAt ||
        options?.endBefore ||
        options?.endAt
      ) {
        // Cursors require an orderBy clause. Default to document ID.
        query = query.orderBy(FieldPath.documentId());
        // Warn if orderBy is missing when using cursors?
        // console.warn("Using pagination cursors without explicit orderBy. Defaulting to orderBy document ID.");
      }

      // Apply cursors
      if (options?.startAfter) query = query.startAfter(options.startAfter);
      if (options?.startAt) query = query.startAt(options.startAt);
      if (options?.endBefore) query = query.endBefore(options.endBefore);
      if (options?.endAt) query = query.endAt(options.endAt);

      // Apply limit
      if (options?.limit) {
        query = query.limit(options.limit);
      }

      const snapshot = await query.get();
      const results: T[] = [];

      if (!snapshot.empty) {
        for (const doc of snapshot.docs) {
          // Converter calls _fromFirestore -> creates instance and calls afterLoad
          const instance = doc.data(); // Gets instance via converter

          if (!instance) continue;

          const meta = this._getRelationMetadata();
          const eagerFields = meta
            .filter((m) => !m.lazy)
            .map((m) => m.propertyName);

          if (options?.populate) {
            await instance.populate(options.populate as any);
          } else if (eagerFields.length) {
            await instance.populate(eagerFields as any);
          }

          results.push(instance);
        }
      }

      return {
        results: results,
        lastVisible: snapshot.docs[snapshot.docs.length - 1], // Can be undefined if empty
        // totalCount: snapshot.size // This is count of *this page*, not total docs matching query
      };
    } catch (error) {
      // Let caller handle errors
      throw error;
    }
  }

  static async findWhere<T extends BaseModel, K extends keyof T>(
    this: BaseModelConstructor<T>,
    field: K | string | FieldPath, // Allow string or FieldPath
    operator: WhereFilterOp,
    value: any,
    options?: FindOptions<T>
  ): Promise<T[]> {
    const result = await this.findAll({
      ...options,
      queryFn: (ref) => ref.where(field as string | FieldPath, operator, value),
    });
    return result.results; // Return only array for simplicity/consistency
  }

  static async findOne<T extends BaseModel>(
    this: BaseModelConstructor<T>,
    queryFn: (ref: CollectionReference<T>) => Query<T>,
    options?: Pick<FindOptions<T>, "populate">
  ): Promise<T | null> {
    const findOptions: FindOptions<T> & {
      queryFn: (ref: CollectionReference<T>) => Query<T>;
    } = {
      queryFn: (ref) => queryFn(ref).limit(1),
      populate: options?.populate,
    };
    // Need to handle potential errors from findAll
    try {
      const result = await this.findAll(findOptions);
      return result.results.length > 0 ? result.results[0] : null;
    } catch (error) {
      // Let caller handle errors
      throw error;
    }
  }

  // --- Instance Methods ---

  protected _getConstructor<T extends BaseModel>(): BaseModelConstructor<T> {
    return this.constructor as BaseModelConstructor<T>;
  }

  protected _getCollectionRef<T extends BaseModel>(): CollectionReference<T> {
    return this._getConstructor<T>().getCollectionRef();
  }

  protected _getDocRef(): DocumentReference<DocumentData> {
    const constructor = this._getConstructor();
    const rawCollectionRef = getFirestoreInstance().collection(
      constructor._getCollectionName()
    );
    if (!this.id) {
      // Generate ref *without* converter if ID is missing
      const ref = rawCollectionRef.doc();
      this.id = ref.id;
      return ref;
    }
    // Return ref *without* converter for set/update/delete operations
    return rawCollectionRef.doc(this.id);
  }

  protected _toFirestore(serializing: boolean = false): DocumentData {
    const data: DocumentData = {};
    const constructor = this._getConstructor();
    const relationMeta = constructor._getRelationMetadata();
    const relationProperties = new Set(relationMeta.map((r) => r.propertyName));

    for (const key in this) {
      // Basic filtering of non-data properties
      if (
        key === "id" ||
        key.startsWith("_") || // Exclude internal properties like _populatedRelations
        typeof (this as any)[key] === "function" ||
        !Object.prototype.hasOwnProperty.call(this, key)
      ) {
        continue;
      }

      const value = (this as any)[key];

      // Handle Relations
      if (relationProperties.has(key)) {
        if (value instanceof BaseModel) {
          // If populated and serializing for save/set, convert back to Ref
          if (serializing && value.id) {
            const relatedConstructor = relationMeta
              .find((m) => m.propertyName === key)!
              .relatedModel();
            data[key] = getFirestoreInstance()
              .collection(relatedConstructor._getCollectionName())
              .doc(value.id);
          } else if (!serializing) {
            // If preparing for update, DO NOT include the populated instance
            // Only include if the user explicitly passes a new DocumentReference or null in updateData
            continue;
          } else {
            // Serializing but related instance has no ID - log warning, store null?
            console.warn(
              `[${constructor.name}] Serializing relation '${key}' but related instance has no ID. Storing null.`
            );
            data[key] = null;
          }
        } else if (value instanceof DocumentReference) {
          // Already a DocumentReference, store as is
          data[key] = value;
        } else if (serializing && value === null) {
          // Explicitly setting relation to null
          data[key] = null;
        } else if (serializing && value === undefined) {
          // If serializing, don't store undefined for relations
          continue;
        } else if (!serializing && value !== undefined) {
          // If preparing for update, and value isn't a BaseModel or DocumentReference,
          // this shouldn't happen unless the type is wrong. Log warning.
          console.warn(
            `[${constructor.name}] Relation property '${key}' has unexpected type during update preparation: ${typeof value}`
          );
        }
        continue; // Skip further processing for relation fields
      }

      // Handle Timestamps and Dates
      if (value instanceof Date) {
        data[key] = Timestamp.fromDate(value);
      } else if (value instanceof Timestamp) {
        data[key] = value; // Already a Timestamp
      }
      // Handle GeoPoints
      else if (value instanceof GeoPoint) {
        data[key] = value;
      }
      // Handle FieldValues (like serverTimestamp, increment) - pass them through
      else if (value instanceof FieldValue) {
        data[key] = value;
      }
      // Handle undefined (Firestore ignores undefined unless ignoreUndefinedProperties is false)
      else if (value !== undefined) {
        // Store other primitive types, arrays, plain objects
        data[key] = value;
      }
    }
    return data;
  }

  async populate<K extends keyof this>(
    fieldNames: K | K[] | boolean
  ): Promise<void> {
    const constructor = this._getConstructor();
    const relationMeta = constructor._getRelationMetadata();
    let fieldsToPopulate: string[];

    if (typeof fieldNames === "boolean" && fieldNames) {
      fieldsToPopulate = relationMeta
        .filter((meta) => !meta.lazy)
        .map((meta) => meta.propertyName);
    } else {
      fieldsToPopulate = Array.isArray(fieldNames)
        ? (fieldNames as string[])
        : [fieldNames as string];
    }

    const populationPromises: Promise<void>[] = [];

    for (const fieldName of fieldsToPopulate) {
      const meta = relationMeta.find((m) => m.propertyName === fieldName);
      if (!meta) {
        console.warn(
          `[${constructor.name}] Attempted to populate non-relation field: '${fieldName}'`
        );
        continue;
      }

      // Check cache first (synchronous check)
      if (this._populatedRelations.hasOwnProperty(fieldName)) {
        // If it's cached (even as null), use the cached value and skip fetching
        (this as any)[fieldName] = this._populatedRelations[fieldName];
        continue;
      }

      const value = (this as any)[fieldName];

      if (value instanceof DocumentReference) {
        // Add the fetch operation to the list of promises
        populationPromises.push(
          (async () => {
            try {
              const RelatedModel = meta.relatedModel();
              // Use findById without populate options here to prevent deep loops by default
              const relatedInstance = await RelatedModel.findById(value.id);
              (this as any)[fieldName] = relatedInstance; // Update instance property
              this._populatedRelations[fieldName] = relatedInstance; // Update cache
            } catch (error) {
              console.error(
                `[${constructor.name}] Error populating relation '${fieldName}' (Ref ID: ${value.id}) on instance ${this.id}:`,
                error
              );
              // Decide behavior on error: keep Ref? Set null? Throw?
              (this as any)[fieldName] = null; // Set to null on error
              this._populatedRelations[fieldName] = null; // Cache null on error
            }
          })()
        );
      } else if (value instanceof BaseModel) {
        // Already populated (or was assigned as instance), ensure it's cached
        this._populatedRelations[fieldName] = value;
      } else if (value === null || value === undefined) {
        // Relation is explicitly null or undefined, cache it as null
        this._populatedRelations[fieldName] = null;
      }
      // else: The field holds something other than Ref/Instance/null/undefined - ignore.
    }
    // Wait for all fetches to complete
    await Promise.all(populationPromises);
  }

  validate(dataToValidate?: DocumentData): void {
    const constructor = this._getConstructor();
    const schema = constructor.schema;
    if (!schema) {
      return; // No schema, no validation
    }
    try {
      // If specific data is passed (like in update), validate that.
      // Otherwise, validate the whole instance's data representation.
      const data = dataToValidate ?? this._toFirestore(false); // Use false for plain data representation
      schema.parse(data);
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = new ValidationError(
          `[${constructor.name}] Validation failed: ${error.errors.map((e) => `(${e.path.join(".")}) ${e.message}`).join("; ")}`,
          error.issues
        );
        throw validationError; // Throw the custom error
      } else {
        // Re-throw unexpected errors
        console.error(
          `[${constructor.name}] Unexpected error during validation:`,
          error
        );
        throw error;
      }
    }
  }

  /**
   * Save (creates or overrides) the document in Firestore.
   * If the instance has no ID, it creates a new document and assigns the generated ID.
   * If the instance has ID, surpasses or mix (with options.merge) the existing document.
   * @param Options Options for Operation Set (Ex: {Merge: True}).
   * @returns A promise that resolves with the writing result (Writeresult).
   */
  async save(options?: SetOptions): Promise<WriteResult>;
  /**
   * Adds a 'set' operation to this document to an existing transaction.
   * Hook AFETERSAVE will not be called.Validation and Beforesave are called.
   * @Param Transaction The Firestore Transaction Active.
   * @param Options Options for Operation Set (Ex: {Merge: True}).
   * @returns A promise that resolves when the operation is added to the transaction.
   */
  async save(
    transaction: FirestoreTransaction,
    options?: SetOptions
  ): Promise<void>;
  /**
   * Adds a 'set' operation to this document to an existing batch.
   * Hook AFETERSAVE will not be called.Validation and Beforesave are called.
   * @param Batch the Writebatch Firestore active.
   * @param Options Options for Operation Set (Ex: {Merge: True}).
   * @returns A promise that resolves when the operation is added to the batch.
   */
  async save(batch: WriteBatch, options?: SetOptions): Promise<void>;

  async save(
    transactionOrBatchOrOptions?:
      | FirestoreTransaction
      | WriteBatch
      | SetOptions,
    maybeOptions?: SetOptions
  ): Promise<WriteResult | void> {
    const constructor = this._getConstructor();

    let transaction: FirestoreTransaction | undefined;
    let batch: WriteBatch | undefined;
    let options: SetOptions | undefined;

    if (isFirestoreTransaction(transactionOrBatchOrOptions)) {
      transaction = transactionOrBatchOrOptions;
      options = maybeOptions;
    } else if (isWriteBatch(transactionOrBatchOrOptions)) {
      batch = transactionOrBatchOrOptions;
      options = maybeOptions;
    } else {
      // No transaction/batch past, the first argument is the options
      options = transactionOrBatchOrOptions as SetOptions | undefined;
    }

    // Default values for properties (@Timestamp with autoFill or @Boolean with defaultValue)
    const defaultsTimestamps: string[] =
      Reflect.getOwnMetadata(TIMESTAMP_KEY, this.constructor) || [];
    for (const prop of defaultsTimestamps) {
      if ((this as any)[prop] == null) {
        (this as any)[prop] = Timestamp.now();
      }
    }
    const defaultsBoolean: any[] =
      Reflect.getOwnMetadata(BOOLEAN_KEY, this.constructor) || [];
    for (const defaultBoolean of defaultsBoolean) {
      if ((this as any)[defaultBoolean.prop] == null) {
        (this as any)[defaultBoolean.prop] = defaultBoolean.defaultValue;
      }
    }

    // 1. Run beforeSave hook
    await this.beforeSave(options);

    // 2. Prepare and Validate data
    const dataForFirestore = this._toFirestore(true);
    this.validate(dataForFirestore); // Valida a representação que vai pro Firestore

    // 3. Get Document Reference (gera ID se necessário, SEM converter)
    const docRef = this._getDocRef();

    // 4. Perform Operation (Transaction, Batch, or Direct)
    if (transaction) {
      transaction.set(docRef, dataForFirestore, options || {});
      return Promise.resolve();
    } else if (batch) {
      batch.set(docRef, dataForFirestore, options || {});
      return Promise.resolve();
    } else {
      try {
        const result = await docRef.set(dataForFirestore, options || {});
        await this.afterSave(result, options);
        return result;
      } catch (error) {
        console.error(
          `[${constructor.name}] Error saving document (ID: ${this.id}):`,
          error
        );
        throw error;
      }
    }
  }

  /**
   * Updates specific document fields in Firestore.It requires the instance to have an id.
   * @param Updatedata object containing the fields to be updated.It may include FieldValues.
   * @returns A promise that resolves with the writing result (Writeresult).
   */
  async update(updateData: UpdateData<this>): Promise<WriteResult>;
  /**
   * Adds an 'update' operation to this document to an existing transaction.
   * Hook afterpdate will not be called.Partial validation (if implemented) and beforeupdate are called.
   * @param Updatedata object containing the fields to be updated.
   * @Param Transaction The Firestore Transaction Active.
   * @returns A promise that resolves when the operation is added to the transaction.
   */
  async update(
    updateData: UpdateData<this>,
    transaction: FirestoreTransaction
  ): Promise<void>;
  /**
   * Adds an 'update' operation to this document to an existing batch.
   * Hook afterpdate will not be called.Partial validation (if implemented) and beforeupdate are called.
   * @param Updatedata object containing the fields to be updated.
   * @param Batch the Writebatch Firestore active.
   * @returns A promise that resolves when the operation is added to the batch.
   */
  async update(updateData: UpdateData<this>, batch: WriteBatch): Promise<void>;
  async update(
    updateData: UpdateData<this>,
    transactionOrBatch?: FirestoreTransaction | WriteBatch
  ): Promise<WriteResult | void> {
    if (!this.id) {
      throw new Error(
        "Cannot update document without an ID. Use save() or ensure the instance has an ID."
      );
    }
    const constructor = this._getConstructor();

    const transaction = isFirestoreTransaction(transactionOrBatch)
      ? transactionOrBatch
      : undefined;
    const batch = isWriteBatch(transactionOrBatch)
      ? transactionOrBatch
      : undefined;

    // 1. Prepare clean update data
    let cleanUpdateData: UpdateData<any> = {};
    const relationMeta = constructor._getRelationMetadata();
    const relationProperties = new Set(relationMeta.map((r) => r.propertyName));
    for (const key in updateData) {
      if (
        key === "id" ||
        key.startsWith("_") ||
        typeof (this as any)[key] === "function" ||
        !Object.prototype.hasOwnProperty.call(updateData, key)
      ) {
        continue;
      }
      const value = (updateData as any)[key];
      if (value instanceof FieldValue) {
        cleanUpdateData[key] = value;
      } else if (
        relationProperties.has(key) &&
        (value === null || value instanceof DocumentReference)
      ) {
        cleanUpdateData[key] = value;
      } else if (!relationProperties.has(key) && value === null) {
        cleanUpdateData[key] = null;
      } else if (!relationProperties.has(key) && value !== undefined) {
        cleanUpdateData[key] =
          value instanceof Date ? Timestamp.fromDate(value) : value;
      }
    }

    if (Object.keys(cleanUpdateData).length === 0) {
      console.warn(
        `[${constructor.name}] Update called with no valid fields to update for ID ${this.id}.`
      );
      return Promise.resolve(
        transaction || batch ? undefined : ({} as WriteResult)
      ); // Retorna void ou WriteResult vazio
    }

    // 2. Partial Validation (Optional - Pull for the Purposes)
    // try { this.validate(cleanUpdateData); } catch (e) { throw e; }

    // 3. Run beforeUpdate hook
    await this.beforeUpdate(cleanUpdateData); // Passa os dados processados

    // 4. Get Document Reference (SEM converter)
    const docRef = this._getDocRef();

    // 5. Perform Operation
    if (transaction) {
      transaction.update(docRef, cleanUpdateData);
      // afterUpdate hook NÃO é chamado aqui
      // Updates local condition only if it is not FieldValue
      this._updateLocalState(cleanUpdateData, relationProperties);
      return Promise.resolve(); // Retorna void
    } else if (batch) {
      batch.update(docRef, cleanUpdateData);
      // afterUpdate hook NÃO é chamado aqui
      // Updates local condition only if it is not FieldValue
      this._updateLocalState(cleanUpdateData, relationProperties);
      return Promise.resolve(); // Retorna void
    } else {
      // Operação direta
      try {
        const result = await docRef.update(cleanUpdateData);
        // 6. Local Update Instance State (for direct operation only)
        this._updateLocalState(cleanUpdateData, relationProperties);
        // 7. RUN afterpdate HOOK (only for direct operation)
        await this.afterUpdate(result, cleanUpdateData);
        return result;
      } catch (error) {
        console.error(
          `[${constructor.name}] Error updating document (ID: ${this.id}):`,
          error
        );
        throw error;
      }
    }
  }

  /**
   * Excludes the document from the Firestore.It requires the instance to have an id.
   * @returns A promise that resolves with the writing result (Writeresult).
   */
  async delete(): Promise<WriteResult>;
  /**
   * Adds an 'delete' operation to this document to an existing transaction.
   * Hook afterdelet will not be called.Hook BefoDelete is called.
   * @Param Transaction The Firestore Transaction Active.
   * @returns A promise that resolves when the operation is added to the transaction.
   */
  async delete(transaction: FirestoreTransaction): Promise<void>;
  /**
   * Adds an 'delete' operation to this document to an existing batch.
   * Hook afterdelet will not be called.Hook BefoDelete is called.
   * @param Batch the Writebatch Firestore active.
   * @returns A promise that resolves when the operation is added to the batch.
   */
  async delete(batch: WriteBatch): Promise<void>;
  async delete(
    transactionOrBatch?: FirestoreTransaction | WriteBatch
  ): Promise<WriteResult | void> {
    if (!this.id) {
      throw new Error("Cannot delete document without an ID.");
    }
    const constructor = this._getConstructor();
    const originalId = this.id; // Preserve ID for hooks/logging

    const transaction = isFirestoreTransaction(transactionOrBatch)
      ? transactionOrBatch
      : undefined;
    const batch = isWriteBatch(transactionOrBatch)
      ? transactionOrBatch
      : undefined;

    // 1. Run beforeDelete hook
    await this.beforeDelete();

    //2GetDocumentReference (semConverter)
    const docRef = this._getDocRef();

    // 3. Perform Operation
    if (transaction) {
      transaction.delete(docRef);
      this.id = undefined;
      this._populatedRelations = {};
      return Promise.resolve();
    } else if (batch) {
      batch.delete(docRef);
      this.id = undefined;
      this._populatedRelations = {};
      return Promise.resolve();
    } else {
      try {
        const result = await docRef.delete();
        // 4. Local Invalidate Instance (for direct operation only)
        this.id = undefined;
        this._populatedRelations = {};
        // 5. RUN afterDelete Hook (only for direct operation)
        await this.afterDelete(result, originalId);
        return result;
      } catch (error) {
        console.error(
          `[${constructor.name}] Error deleting document (ID: ${originalId}):`,
          error
        );
        throw error;
      }
    }
  }

  async reload<T extends BaseModel>(
    this: T,
    options?: Pick<FindOptions<T>, "populate">
  ): Promise<T> {
    if (!this.id) {
      throw new Error("Cannot reload document without an ID.");
    }
    const constructor = this._getConstructor();

    const freshInstance = await constructor.findById(this.id, {
      populate: options?.populate as any,
    });

    if (!freshInstance) {
      throw new NotFoundError(constructor.name, this.id);
    }

    // Clear cache
    this._populatedRelations = {};

    // copy Freshinstance data in this
    for (const key in freshInstance) {
      if (!Object.prototype.hasOwnProperty.call(freshInstance, key)) continue;
      if (key === "id") continue;
      (this as any)[key] = (freshInstance as any)[key];
    }

    // Reconstructs Relationship Cache
    const relationMeta = constructor._getRelationMetadata();
    relationMeta.forEach((meta) => {
      const val = (this as any)[meta.propertyName];
      if (val instanceof BaseModel || val === null) {
        this._populatedRelations[meta.propertyName] = val;
      }
    });

    return this;
  }

  private _updateLocalState(
    cleanUpdateData: UpdateData<any>,
    relationProperties: Set<string>
  ): void {
    for (const key in cleanUpdateData) {
      if (Object.prototype.hasOwnProperty.call(cleanUpdateData, key)) {
        const value = cleanUpdateData[key];
        if (!(value instanceof FieldValue) || value === FieldValue.delete()) {
          (this as any)[key] =
            value === FieldValue.delete() ? undefined : value;
          if (relationProperties.has(key)) {
            delete this._populatedRelations[key];
          }
        } else {
          // Não loga mais warning aqui, pois é esperado em tx/batch
        }
      }
    }
  }

  async beforeSave(options?: SetOptions): Promise<void> {}
  async afterSave(result: WriteResult, options?: SetOptions): Promise<void> {}
  async beforeUpdate(data: UpdateData<this>): Promise<void> {}
  async afterUpdate(
    result: WriteResult,
    data: UpdateData<this>
  ): Promise<void> {}
  async beforeDelete(): Promise<void> {}
  async afterDelete(result: WriteResult, originalId: string): Promise<void> {}
  async afterLoad(
    snapshot: DocumentSnapshot | QueryDocumentSnapshot
  ): Promise<void> {}
}
