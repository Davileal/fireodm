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
import { transactionContext } from "./context";
import {
  BOOLEAN_KEY,
  getCollectionName,
  getRelationMetadata,
  SUBCOL_KEY,
  SUBMODEL_KEY,
  TIMESTAMP_KEY,
} from "./decorators";
import { NotFoundError, ValidationError } from "./errors";
import {
  BaseModelConstructor,
  BaseModelInterface,
  FindAllResult,
  FindOptions,
  RelationMetadata,
  SubCollectionMetadata,
  SubModelMetadata,
} from "./types";
import { getValidationSchema } from "./validation";

function isFirestoreTransaction(obj: any): obj is FirestoreTransaction {
  return (
    obj &&
    typeof obj.get === "function" &&
    typeof obj.set === "function" &&
    typeof obj.update === "function" &&
    typeof obj.delete === "function"
  );
}
function isWriteBatch(obj: any): obj is WriteBatch {
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

  constructor(data: Record<string, any>, idOrParent?: string | BaseModel) {
    if (idOrParent instanceof BaseModel) {
      (this as any).__parent = idOrParent;
      if ((idOrParent as any).__parent) {
        (this as any).__parent.__parent = (idOrParent as any).__parent;
      }
    } else if (typeof idOrParent === "string") {
      this.id = idOrParent;
    }
    Object.assign(this, data);
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

  /**
   * Get a typed CollectionReference for a named subcollection on this document.
   */
  async subcollection<Sub extends BaseModel>(
    this: this,
    prop: keyof this
  ): Promise<Sub[]> {
    const ctor = this.constructor as Function;
    const metas = (Reflect.getOwnMetadata(SUBCOL_KEY, ctor) ||
      []) as SubCollectionMetadata[];
    const meta = metas.find((m) => m.propertyName === prop);
    if (!meta) {
      throw new Error(
        `@SubCollection not defined for property "${String(prop)}" on ${ctor.name}`
      );
    }

    const parentDocRef = this._getDocRef();

    const childCol = parentDocRef
      .collection(meta.name)
      .withConverter(meta.model()._getFirestoreConverter());

    const snap = await childCol.get();
    return snap.docs.map((d) => d.data());
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

      const instance = this._fromFirestore(docSnap);
      if (!instance) return null;

      const relMeta = this._getRelationMetadata();
      const eagerRels = relMeta
        .filter((m) => !m.lazy)
        .map((m) => m.propertyName as keyof T);

      if (options?.populate) {
        await instance.populate(options.populate as any);
      } else if (eagerRels.length) {
        await instance.populate(eagerRels as any);
      }

      const subMetas: SubCollectionMetadata[] =
        Reflect.getOwnMetadata(SUBCOL_KEY, this) || [];
      const eagerSubs = subMetas.map((m) => m.propertyName as keyof T);
      const subsToPopulate = options?.populateSub?.length
        ? options.populateSub
        : eagerSubs;

      for (const propName of subsToPopulate || []) {
        const meta = subMetas.find(
          (m) => m.propertyName === (propName as string)
        );
        if (!meta) continue;

        const items = await instance.subcollection(propName as keyof T);
        (instance as any)[propName] = items;
      }

      return instance;
    } catch (error) {
      if ((error as any)?.code === 5) {
        return null;
      }
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
        query = query.orderBy(FieldPath.documentId());
      }
      if (options?.startAfter) query = query.startAfter(options.startAfter);
      if (options?.startAt) query = query.startAt(options.startAt);
      if (options?.endBefore) query = query.endBefore(options.endBefore);
      if (options?.endAt) query = query.endAt(options.endAt);
      if (options?.limit) query = query.limit(options.limit);

      const snapshot = await query.get();
      const results: T[] = [];

      for (const doc of snapshot.docs) {
        const instance = doc.data();
        if (!instance) continue;

        const relMeta = this._getRelationMetadata();
        const eagerRels = relMeta
          .filter((m) => !m.lazy)
          .map((m) => m.propertyName as keyof T);

        if (options?.populate) {
          await instance.populate(options.populate as any);
        } else if (eagerRels.length) {
          await instance.populate(eagerRels as any);
        }

        const subMetas: SubCollectionMetadata[] =
          Reflect.getOwnMetadata(SUBCOL_KEY, this) || [];
        const eagerSubs = subMetas.map((m) => m.propertyName as keyof T);
        const subsToPopulate = options?.populateSub?.length
          ? options.populateSub
          : eagerSubs;

        if (subsToPopulate && subsToPopulate.length) {
          for (const propName of subsToPopulate) {
            const items = await instance.subcollection(propName as keyof T);
            (instance as any)[propName] = items;
          }
        }

        results.push(instance);
      }

      return {
        results,
        lastVisible: snapshot.docs[snapshot.docs.length - 1],
      } as FindAllResult<T>;
    } catch (error) {
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
    const ctor = this._getConstructor();
    const meta = Reflect.getOwnMetadata(SUBMODEL_KEY, ctor) as
      | SubModelMetadata
      | undefined;

    if (meta) {
      const parent = (this as any).__parent as BaseModel;
      if (!parent?.id) {
        throw new Error(
          `Cannot save submodel ${ctor.name} without a parent instance having an ID.`
        );
      }
      const parentDocRef = parent._getDocRef();
      const subColl = parentDocRef.collection(meta.subPath);

      if (!this.id) {
        const ref = subColl.doc();
        this.id = ref.id;
        return ref;
      }
      return subColl.doc(this.id);
    }

    const rawCollectionRef = getFirestoreInstance().collection(
      ctor._getCollectionName()
    );
    if (!this.id) {
      const ref = rawCollectionRef.doc();
      this.id = ref.id;
      return ref;
    }
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
   * Saves (creates or overwrites) the document in Firestore.
   * If executed within an active transaction or batch context (started via `runInTransaction` or `runInBatch`),
   * the operation will be added to that context.
   *
   * @param options Options for the Firestore `set` operation (e.g., `{ merge: true }`).
   * @returns A Promise resolving with the `WriteResult` for direct operations, or `undefined` if executed within a transaction/batch context.
   * @throws {ValidationError} If validation against the static schema fails.
   */
  async save(options?: SetOptions): Promise<WriteResult | undefined> {
    // <--- Changed return type
    const constructor = this._getConstructor();
    const currentContext = transactionContext.getStore(); // <--- Get context
    const isTransactional = currentContext !== undefined;

    // --- Defaults and Hooks ---
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
    await this.beforeSave(options); // Always run beforeSave

    // --- Prepare and Validate Data ---
    const dataForFirestore = this._toFirestore(true);
    this.validate(dataForFirestore);

    // --- Get Ref ---
    const docRef = this._getDocRef(); // Ensures ID is generated if needed

    // --- Perform Operation ---
    if (currentContext) {
      // Transaction or Batch context is active
      if (isFirestoreTransaction(currentContext)) {
        currentContext.set(docRef, dataForFirestore, options || {});
      } else if (isWriteBatch(currentContext)) {
        currentContext.set(docRef, dataForFirestore, options || {});
      }
      // afterSave hook is SKIPPED, return undefined
      return undefined; // <--- Return undefined in context
    } else {
      // Direct operation
      try {
        const result = await docRef.set(dataForFirestore, options || {});
        await this.afterSave(result, options); // Run afterSave ONLY for direct ops
        return result; // <--- Return WriteResult
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
   * Updates specific fields of the document in Firestore. Requires the instance to have an ID.
   * If executed within an active transaction or batch context (started via `runInTransaction` or `runInBatch`),
   * the operation will be added to that context.
   *
   * @param updateData Object containing the fields to update. Can include `FieldValue`s.
   * @returns A Promise resolving with the `WriteResult` for direct operations, or `undefined` if executed within a transaction/batch context.
   * @throws {ValidationError} If validation against the static schema fails for the updated fields (if implemented).
   * @throws {Error} If the instance does not have an `id`.
   */
  async update(updateData: UpdateData<this>): Promise<WriteResult | undefined> {
    if (!this.id) {
      throw new Error(
        "Cannot update document without an ID. Use save() or ensure the instance has an ID."
      );
    }
    const constructor = this._getConstructor();
    const currentContext = transactionContext.getStore(); // <--- Get context
    const isTransactional = currentContext !== undefined;

    // --- Prepare clean update data ---
    let cleanUpdateData: UpdateData<any> = {};
    const relationMeta = constructor._getRelationMetadata();
    const relationProperties = new Set(relationMeta.map((r) => r.propertyName));
    // ... (same cleaning logic as before) ...
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
      return isTransactional ? undefined : ({} as WriteResult); // Return undefined or empty WR
    }

    // --- Partial Validation (Optional) ---
    // try { this.validate(cleanUpdateData); } catch (e) { throw e; }

    // --- Hook and Ref ---
    await this.beforeUpdate(cleanUpdateData); // Always run beforeUpdate
    const docRef = this._getDocRef(); // Get ref without converter

    // --- Perform Operation ---
    if (currentContext) {
      // Transaction or Batch context is active
      if (isFirestoreTransaction(currentContext)) {
        currentContext.update(docRef, cleanUpdateData);
      } else if (isWriteBatch(currentContext)) {
        currentContext.update(docRef, cleanUpdateData);
      }
      // Update local state, skip afterUpdate hook, return undefined
      this._updateLocalState(cleanUpdateData, relationProperties);
      return undefined; // <--- Return undefined in context
    } else {
      // Direct operation
      try {
        const result = await docRef.update(cleanUpdateData);
        this._updateLocalState(cleanUpdateData, relationProperties); // Update local state
        await this.afterUpdate(result, cleanUpdateData); // Run afterUpdate ONLY for direct ops
        return result; // <--- Return WriteResult
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
   * Deletes the document from Firestore. Requires the instance to have an ID.
   * If executed within an active transaction or batch context (started via `runInTransaction` or `runInBatch`),
   * the operation will be added to that context.
   *
   * @returns A Promise resolving with the `WriteResult` for direct operations, or `undefined` if executed within a transaction/batch context.
   * @throws {Error} If the instance does not have an `id`.
   */
  async delete(): Promise<WriteResult | undefined> {
    if (!this.id) {
      throw new Error("Cannot delete document without an ID.");
    }
    const constructor = this._getConstructor();
    const originalId = this.id;
    const currentContext = transactionContext.getStore(); // <--- Get context
    const isTransactional = currentContext !== undefined;

    // --- Hook and Ref ---
    await this.beforeDelete(); // Always run beforeDelete
    const docRef = this._getDocRef();

    // --- Perform Operation ---
    if (currentContext) {
      // Transaction or Batch context is active
      if (isFirestoreTransaction(currentContext)) {
        currentContext.delete(docRef);
      } else if (isWriteBatch(currentContext)) {
        currentContext.delete(docRef);
      }
      // Invalidate local state, skip afterDelete hook, return undefined
      this.id = undefined;
      this._populatedRelations = {};
      return undefined; // <--- Return undefined in context
    } else {
      // Direct operation
      try {
        const result = await docRef.delete();
        this.id = undefined; // Invalidate local state
        this._populatedRelations = {};
        await this.afterDelete(result, originalId); // Run afterDelete ONLY for direct ops
        return result; // <--- Return WriteResult
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
