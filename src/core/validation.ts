import "reflect-metadata";
import { z, ZodSchema, ZodTypeAny } from "zod";

const VALIDATION_KEY = Symbol("validation:properties");

/**
 * Decorator to attach a Zod schema to a class property.
 */
export function Validate(schema: ZodTypeAny) {
  return function (target: any, propertyKey: string) {
    const existing: Record<string, ZodTypeAny> =
      Reflect.getOwnMetadata(VALIDATION_KEY, target.constructor) || {};
    existing[propertyKey] = schema;
    Reflect.defineMetadata(VALIDATION_KEY, existing, target.constructor);
  };
}

/**
 * Builds a Zod schema for the class by collecting all @Validate decorators.
 * Returns a ZodType that parses into the class instance type T.
 */
export function getValidationSchema<T>(
  ctor: new (...args: any[]) => T
): ZodSchema<T> {
  const shape: Record<string, ZodTypeAny> =
    Reflect.getOwnMetadata(VALIDATION_KEY, ctor) || {};
  const base = z.object(shape).strict();
  // Transform to cast the parsed object into the class instance shape
  // Cast to ZodSchema<T> to satisfy TS typing
  return base.transform((obj) => obj as T) as unknown as ZodSchema<T>;
}
