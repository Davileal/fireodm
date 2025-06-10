import {
  CollectionReference,
  DocumentData,
  DocumentSnapshot,
  FieldPath,
  OrderByDirection,
  PartialWithFieldValue,
  Query,
  QueryDocumentSnapshot,
  SetOptions,
  UpdateData,
  WhereFilterOp,
  WriteResult,
} from "firebase-admin/firestore";
import { ZodSchema } from "zod";
import { BaseModel } from "./base-model";

export interface FindOptions<T extends typeof BaseModel = any> {
  populate?: (keyof T | string)[] | boolean;
  populateSub?: string[];
  limit?: number;
  orderBy?: {
    field: keyof T | string | FieldPath;
    direction?: OrderByDirection;
  };
  startAfter?: DocumentSnapshot | any[];
  startAt?: DocumentSnapshot | any[];
  endBefore?: DocumentSnapshot | any[];
  endAt?: DocumentSnapshot | any[];
  queryFn?: (ref: CollectionReference<T>) => Query<T>;
}

export interface FindAllResult<T> {
  results: T[];
  lastVisible?: DocumentSnapshot;
}

export interface RelationMetadata<T extends typeof BaseModel = any> {
  propertyName: string;
  relatedModel: () => BaseModelConstructor<T>;
  lazy: boolean;
}

export interface SubModelMetadata {
  parentModel: () => BaseModelConstructor<any>
  subPath: string
}

export interface SubCollectionMetadata<T extends typeof BaseModel = any> {
  propertyName: string;
  name: string;
  model: () => BaseModelConstructor<T>;
}

export interface SubCollectionDocMetadata<T extends typeof BaseModel = any> {
  propertyName: string;
  docId: string;
  subcollectionName: string;
  model: () => BaseModelConstructor<T>;
}

export interface BaseModelConstructor<T extends typeof BaseModel = any> {
  new (data: Partial<Record<string, any>>, id?: string): T;
  schema?: ZodSchema<any>;
  _getCollectionName(): string;
  _getRelationMetadata(): RelationMetadata[];
  _getFirestoreConverter(): FirebaseFirestore.FirestoreDataConverter<T>;
  _fromFirestore(snapshot: DocumentSnapshot | QueryDocumentSnapshot): T | null;
  getCollectionRef(): CollectionReference<T>;
  findById(id: string, options?: FindOptions<T>): Promise<T | null>;
  findAll(
    options?: FindOptions<T> & {
      queryFn?: (ref: CollectionReference<T>) => Query<T>;
    }
  ): Promise<FindAllResult<T>>;
  findWhere<K extends keyof T>(
    field: K | string | FieldPath,
    operator: WhereFilterOp,
    value: any,
    options?: FindOptions<T>
  ): Promise<T[]>;
  findOne(
    queryFn: (ref: CollectionReference<T>) => Query<T>,
    options?: FindOptions<T>
  ): Promise<T | null>;
}

export interface BaseModelInterface {
  id?: string;
  save(options?: SetOptions): Promise<WriteResult | undefined>;
  update(
    this: this,
    updateData: PartialWithFieldValue<this> | UpdateData<this>
  ): Promise<WriteResult | undefined>;
  delete(): Promise<WriteResult | undefined>;
  reload<T extends typeof BaseModel>(
    this: T,
    options?: Pick<FindOptions<T>, "populate">
  ): Promise<T>;
  populate<K extends keyof this>(fieldNames: K | K[] | boolean): Promise<void>;
  validate(dataToValidate?: DocumentData): void;
  beforeSave(options?: SetOptions): Promise<void> | void;
  afterSave(result: WriteResult, options?: SetOptions): Promise<void> | void;
  beforeUpdate(data: UpdateData<this>): Promise<void> | void;
  afterUpdate(
    result: WriteResult,
    data: UpdateData<this>
  ): Promise<void> | void;
  beforeDelete(): Promise<void> | void;
  afterDelete(result: WriteResult, originalId: string): Promise<void> | void;
  afterLoad(
    snapshot: DocumentSnapshot | QueryDocumentSnapshot
  ): Promise<void> | void;
}
