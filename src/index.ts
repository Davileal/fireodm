// --- Core ORM ---
export { BaseModel } from "./core/base-model";

// --- Decorators ---
export {
  ArrayField,
  BooleanField,
  Collection,
  DocumentReferenceField,
  EmailField,
  GeoPointField,
  MapField,
  NumberField,
  Relation,
  StringField,
  TimestampField,
} from "./core/decorators";

// --- Types and Interfaces ---
export type {
  BaseModelInterface,
  FindAllResult,
  FindOptions,
  RelationMetadata,
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

export { z } from "zod";
