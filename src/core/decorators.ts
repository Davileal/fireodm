import * as admin from "firebase-admin";
import {
  GeoPoint as FireGeoPoint,
  Timestamp as FireTimestamp,
} from "firebase-admin/firestore";
import "reflect-metadata";
import { z, ZodTypeAny } from "zod";
import { BaseModel } from "./base-model";
import { BaseModelConstructor, RelationMetadata } from "./types"; // Import type from types.ts
import { Validate } from "./validation";
import DocumentReference = admin.firestore.DocumentReference;

export const COLLECTION_KEY = Symbol("collectionName");
export const RELATION_KEY = Symbol("relations");
export const TIMESTAMP_KEY = Symbol("timestamps");
export const BOOLEAN_KEY = Symbol("booleans");

/**
 * Class decorator to define the Firestore collection name for a model.
 * @param name The name of the Firestore collection.
 * @example
 * ```typescript
 * @Collection('users')
 * class User extends BaseModel {
 * // ...
 * }
 * ```
 */
export function Collection(name: string) {
  return function <T extends { new (...args: any[]): {} }>(constructor: T) {
    if (!name || typeof name !== "string") {
      throw new Error(
        `@Collection decorator requires a non-empty string argument. Received: ${name}`
      );
    }
    Reflect.defineMetadata(COLLECTION_KEY, name, constructor);
  };
}

/**
 * Property decorator to define a relationship stored as a DocumentReference.
 * @param relatedModelGetter A function returning the constructor of the related model (e.g., `() => User`). Essential for handling circular dependencies.
 * @example
 * ```typescript
 * import { Department } from './Department'; // Assuming Department model exists
 *
 * @Collection('employees')
 * class Employee extends BaseModel {
 * name: string;
 *
 * @Relation(() => Department)
 * department?: DocumentReference | Department | null; // Can hold Ref, populated instance, or be null
 * }
 * ```
 */
export function Relation<T extends BaseModel>(
  relatedModelGetter: () => BaseModelConstructor<T>,
  options: { lazy?: boolean } = { lazy: true }
) {
  if (typeof relatedModelGetter !== "function") {
    throw new Error(
      "@Relation decorator requires a function argument that returns the related model constructor."
    );
  }

  return function (target: any, propertyName: string) {
    const relations: RelationMetadata[] =
      Reflect.getOwnMetadata(RELATION_KEY, target.constructor) || [];

    if (relations.some((r) => r.propertyName === propertyName)) {
      const idx = relations.findIndex((r) => r.propertyName === propertyName);
      relations.splice(idx, 1);
    }

    relations.push({
      propertyName,
      relatedModel: relatedModelGetter,
      lazy: options.lazy ?? true,
    });

    Reflect.defineMetadata(RELATION_KEY, relations, target.constructor);
  };
}

// --- Metadata Accessor Functions (Internal) ---

/** @internal Gets the collection name from metadata, searching prototype chain. */
export function getCollectionName(target: Function): string | undefined {
  let currentTarget = target;
  while (currentTarget && currentTarget !== Object.prototype) {
    const name = Reflect.getOwnMetadata(COLLECTION_KEY, currentTarget);
    if (name) {
      return name;
    }
    currentTarget = Object.getPrototypeOf(currentTarget);
  }
  return undefined;
}

/** @internal Gets relation metadata, searching and merging from prototype chain. */
export function getRelationMetadata(target: Function): RelationMetadata[] {
  let relations: RelationMetadata[] = [];
  let currentTarget = target;
  const definedProperties = new Set<string>(); // Keep track of properties defined lower down

  while (currentTarget && currentTarget !== Object.prototype) {
    const currentRelations: RelationMetadata[] | undefined =
      Reflect.getOwnMetadata(RELATION_KEY, currentTarget);
    if (currentRelations) {
      currentRelations.forEach((rel) => {
        // Add relation only if not already defined by a subclass (higher in chain)
        if (!definedProperties.has(rel.propertyName)) {
          relations.push(rel);
          definedProperties.add(rel.propertyName);
        }
      });
    }
    currentTarget = Object.getPrototypeOf(currentTarget);
  }
  // Return relations collected from prototype chain (subclass definitions take precedence)
  return relations;
}

export function StringField(
  opts: { min?: number; max?: number; message?: string; required?: boolean } = {
    required: false,
  }
) {
  let schema: ZodTypeAny = z.string();
  if (opts.min != null)
    schema = (schema as any).min(opts.min, { message: opts.message });
  if (opts.max != null)
    schema = (schema as any).max(opts.max, { message: opts.message });
  if (!opts.required) schema = schema.optional();
  return Validate(schema);
}

export function EmailField(
  message = "Invalid email",
  opts: { required?: boolean } = { required: false }
) {
  let schema: ZodTypeAny = z.string().email({ message });
  if (!opts.required) schema = schema.optional();
  return Validate(schema);
}

export function NumberField(
  opts: { min?: number; max?: number; message?: string; required?: boolean } = {
    required: false,
  }
) {
  let schema: ZodTypeAny = z.number();
  if (opts.min != null)
    schema = (schema as any).min(opts.min, { message: opts.message });
  if (opts.max != null)
    schema = (schema as any).max(opts.max, { message: opts.message });
  if (!opts.required) schema = schema.optional();
  return Validate(schema);
}

export function BooleanField(
  opts: { required?: boolean; defaultValue?: boolean } = { required: false }
) {
  // Build Zod schema for boolean
  let schema: ZodTypeAny = z.boolean();
  if (!opts.required) schema = schema.optional();

  return function (target: any, propertyName: string) {
    // Apply validation
    Validate(schema)(target, propertyName);
    // Apply defaultNow if requested
    if (opts.defaultValue) {
      const existing: any[] =
        Reflect.getOwnMetadata(BOOLEAN_KEY, target.constructor) || [];
      existing.push({prop: propertyName, defaultValue: opts.defaultValue});
      Reflect.defineMetadata(BOOLEAN_KEY, existing, target.constructor);
    }
  };
}

export function TimestampField(
  opts: { required?: boolean; autoFill?: boolean } = {
    required: false,
    autoFill: false,
  }
) {
  // Build Zod schema
  let schema: ZodTypeAny = z.instanceof(FireTimestamp);
  if (!opts.required) schema = schema.optional();

  // Decorator combining validation and autoFill metadata
  return function (target: any, propertyName: string) {
    // Apply validation
    Validate(schema)(target, propertyName);
    // Apply defaultNow if requested
    if (opts.autoFill) {
      const existing: string[] =
        Reflect.getOwnMetadata(TIMESTAMP_KEY, target.constructor) || [];
      existing.push(propertyName);
      Reflect.defineMetadata(TIMESTAMP_KEY, existing, target.constructor);
    }
  };
}

export function GeoPointField(
  opts: { required?: boolean } = { required: false }
) {
  let schema: ZodTypeAny = z.instanceof(FireGeoPoint);
  if (!opts.required) schema = schema.optional();
  return Validate(schema);
}

export function ArrayField(
  schemaDef: ZodTypeAny,
  opts: { required?: boolean } = { required: false }
) {
  let arrSchema: ZodTypeAny = z.array(schemaDef);
  if (!opts.required) arrSchema = arrSchema.optional();
  return Validate(arrSchema);
}

export function MapField(
  schemaDef: ZodTypeAny,
  opts: { required?: boolean } = { required: false }
) {
  let mapSchema: ZodTypeAny = z.record(z.string(), schemaDef);
  if (!opts.required) mapSchema = mapSchema.optional();
  return Validate(mapSchema);
}

/**
 * Decorator for Firestore DocumentReference fields.
 * Combines validation with loading logic: apply alongside @Relation for relations.
 */
// Workaround for Firestore's private constructor on DocumentReference
const FireDocRefCtor = DocumentReference as unknown as {
  new (...args: any[]): any;
};

/**
 * Decorator for Firestore DocumentReference fields.
 * Combines validation with loading logic: apply alongside @Relation for relations.
 */
export function DocumentReferenceField(
  opts: { required?: boolean } = { required: false }
) {
  let schema: ZodTypeAny = z.union([
    z.instanceof(FireDocRefCtor),
    z.instanceof(BaseModel),
    z.null(),
  ]);

  if (!opts.required) {
    schema = schema.optional();
  }

  return Validate(schema);
}
