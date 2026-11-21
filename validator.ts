/**
 * Small helpers for validating request payloads. A failed validation throws
 * a 400 `PublicError` (see `validate.onFail`).
 *
 * @example
 * ```ts
 * import { array, OPTIONAL, string, validate } from "@peetklecha/bed/validator";
 *
 * const body = validate(await getBody(), {
 *   name: string,
 *   tags: array(string),
 *   note: OPTIONAL,
 *   role: "member", // default value
 * });
 * ```
 *
 * @module
 */
import type { Recievable } from "./lib/types.ts";

export type { Recievable };
import { PublicError } from "./error.ts";

/** In a schema: the property may be missing. */
export const OPTIONAL = Symbol("optional value");
/** In a schema: the property must be present, with any value. */
export const REQUIRED = Symbol("required value");

/** Marks a schema validation result as valid (`true`) or invalid (`false`). */
export const VALID = Symbol("validated object or error summary?");

/** A type guard for `T`. */
export type Guard<T> = (obj: unknown) => obj is T;
type GuardedType<T> = T extends Guard<infer U> ? U : never;
/**
 * A schema entry: `OPTIONAL`, `REQUIRED`, a predicate or type guard, or a
 * default value used when the property is missing.
 */
export type Validator =
  | typeof OPTIONAL
  | typeof REQUIRED
  | Recievable
  | ((obj: unknown) => boolean);
/** A schema: property names mapped to validators. */
export type Validation = Record<string, Validator>;
/** The validated object produced by schema `T`. */
export type Validatum<T extends Validation> =
  & {
    [Prop in keyof T]: T[Prop] extends Guard<infer U> ? U
      // deno-lint-ignore ban-types
      : T[Prop] extends Function ? never
      : T[Prop] extends typeof OPTIONAL ? unknown | undefined
      : T[Prop] extends typeof REQUIRED ? unknown
      : T[Prop];
  }
  & { [VALID]: true };
/** The invalid properties found by a schema, with their values. */
export type ErrorSummary = Record<string, unknown> & { [VALID]: false };
/** A compiled schema: returns the validated object, or what failed. */
export type InterfaceValidator<T extends Validation> = (
  payload: unknown,
) => false | ErrorSummary | Validatum<T>;

function isValidatum<T extends Validation>(
  obj: Validatum<T> | ErrorSummary,
): obj is Validatum<T> {
  return obj[VALID];
}

/**
 * Validate `payload` with a type guard, a schema, or a compiled schema, and
 * return it typed. Calls `validate.onFail` (which throws) if it's invalid.
 */
export function validate<T>(payload: unknown, validator: Guard<T>): T;
/**
 * Validate `payload` with a type guard, a schema, or a compiled schema, and
 * return it typed. Calls `validate.onFail` (which throws) if it's invalid.
 */
export function validate<U extends Validation>(
  payload: unknown,
  validator: InterfaceValidator<U> | U,
): Validatum<U>;
export function validate<T, U extends Validation>(
  payload: unknown,
  validator: Guard<T> | InterfaceValidator<U> | U,
) {
  if (typeof validator === "function") {
    return applyValidationFunc(payload, validator);
  } else {
    return applyValidationFunc(payload, schema(validator));
  }
}

function applyValidationFunc<T, U extends Validation>(
  payload: unknown,
  func: Guard<T> | InterfaceValidator<U>,
) {
  const validationResult = func(payload);
  if (validationResult === true) {
    return payload as T;
  } else if (validationResult === false) {
    validate.onFail({ __type__: typeof payload });
    throw new OnFailImplementedIncorrectly();
  } else if (isValidatum(validationResult)) {
    return validationResult;
  } else {
    validate.onFail(validationResult);
    throw new OnFailImplementedIncorrectly();
  }
}

/**
 * Called with the invalid values when validation fails. Must throw. By
 * default it throws a 400 `PublicError` listing them; replace it to customize.
 */
validate.onFail = function onFail(badValues: Record<string, unknown>): never {
  throw new PublicError(
    400,
    `Bad payload \n\t${
      Object
        .entries(badValues)
        .map(([key, value], i) => `${i}. key ${key}, value ${value}`)
        .join("\n\t")
    }`,
  );
};

/** Type guard for strings. */
export const string = (obj: unknown): obj is string => typeof obj === "string";
/** Type guard for numbers. */
export const number = (obj: unknown): obj is number => typeof obj === "number";
/** Type guard for booleans. */
export const boolean = (obj: unknown): obj is boolean =>
  typeof obj === "boolean";

/** Type guard for non-null objects. */
export const object = (obj: unknown): obj is Record<string, unknown> =>
  !!obj &&
  typeof obj === "object" &&
  obj !== null;

/** Type guard for objects whose values all pass `func`. */
export const record =
  <T>(func: Guard<T>): Guard<Record<string, T>> =>
  (obj: unknown): obj is Record<string, T> =>
    object(obj) &&
    Object.values(obj).every(func);

/** Compile a schema into a reusable validator. */
export function schema<T extends Record<string, Validator>>(
  validation: T,
): InterfaceValidator<T> {
  return (payload: unknown) => {
    if (!object(payload)) return false;
    const output: Record<string, unknown> = { [VALID]: true };
    const badValues: ErrorSummary = { [VALID]: false };
    for (const [key, validator] of Object.entries(validation)) {
      const value = payload[key];
      if (typeof validator === "function") {
        if (!validator(value)) badValues[key] = value;
        else {
          output[key] = value as GuardedType<typeof validator>;
        }
      } else if (validator === OPTIONAL) {
        if (value !== undefined) output[key] = value;
      } else if (validator === REQUIRED) {
        if (value === undefined) badValues[key] = value;
        else output[key] = value;
      } else {
        if (value === undefined) output[key] = validator;
        else output[key] = value;
      }
    }
    if (Object.keys(badValues).length) return badValues;
    return output as Validatum<T>;
  };
}

/** Type guard for arrays whose elements all pass `func`. */
export const array = <T>(func: Guard<T>): Guard<T[]> =>
(obj: unknown): obj is T[] => Array.isArray(obj) && obj.every(func);

/** Type guard that passes if either `func1` or `func2` passes. */
export function or<T, U>(func1: Guard<T>, func2: Guard<U>): Guard<T | U> {
  return (obj: unknown): obj is T | U => func1(obj) || func2(obj);
}

class OnFailImplementedIncorrectly extends Error {
  constructor() {
    super(
      "validate.onFail should always throw -- override validate.onFail with a function that throws or leave its default value.",
    );
  }
}
