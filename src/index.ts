// --- Core ORM ---
export { BaseModel } from "./core/base-model";

// --- Decorators ---
export {
  ArrayField,
  BooleanField,
  Collection,
  SubCollectionModel,
  DocumentReferenceField,
  EmailField,
  GeoPointField,
  MapField,
  NumberField,
  Relation,
  StringField,
  TimestampField,
  SubCollection
} from "./core/decorators";

// --- Types and Interfaces ---
export type {
  BaseModelInterface,
  FindAllResult,
  FindOptions,
  RelationMetadata,
  SubModelMetadata,
  SubCollectionMetadata
} from "./core/types";

// --- Errors ---
export { NotFoundError, ValidationError } from "./core/errors";

// --- Initialization Helper ---
export {
  getFirestoreInstance,
  setFirestoreInstance,
} from "./config/firestore-instance";

export {
  CollectionReference,
  DocumentData,
  DocumentReference,
  DocumentSnapshot,
  FieldValue,
  GeoPoint,
  OrderByDirection,
  Query,
  QueryDocumentSnapshot,
  QuerySnapshot,
  SetOptions,
  Timestamp,
  UpdateData,
  WhereFilterOp,
  WriteResult,
} from "firebase-admin/firestore";

export { runInTransaction, runInBatch } from "./core/transaction-manager";
export type { BatchResult } from "./core/transaction-manager";

export { z } from "zod";
