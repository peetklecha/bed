import type { Recievable } from "./lib/types.ts";
import { PublicError } from "./lib/util.ts";

export const OPTIONAL = Symbol("optional value");
export const REQUIRED = Symbol("required value");

export const VALID = Symbol("validated object or error summary?");

type Guard<T> = (obj: unknown) => obj is T;
type GuardedType<T> = T extends Guard<infer U> ? U : never;
type Validator =
  | typeof OPTIONAL
  | typeof REQUIRED
  | Recievable
  | ((obj: unknown) => boolean);
type Validation = Record<string, Validator>;
type Validatum<T extends Validation> =
  & {
    [Prop in keyof T]: T[Prop] extends Guard<infer U> ? U
      : // deno-lint-ignore ban-types
      T[Prop] extends Function ? never
      : T[Prop] extends typeof OPTIONAL ? unknown | undefined
      : T[Prop] extends typeof REQUIRED ? unknown
      : T[Prop];
  }
  & { [VALID]: true };
type ErrorSummary = Record<string, unknown> & { [VALID]: false };
type InterfaceValidator<T extends Validation> = (
  payload: unknown,
) => false | ErrorSummary | Validatum<T>;

function isValidatum<T extends Validation>(
  obj: Validatum<T> | ErrorSummary,
): obj is Validatum<T> {
  return obj[VALID];
}

export function validate<T>(payload: unknown, validator: Guard<T>): T;
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

validate.onFail = function onFail(badValues: Record<string, unknown>) {
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

export const string = (obj: unknown): obj is string => typeof obj === "string";
export const number = (obj: unknown): obj is number => typeof obj === "number";
export const boolean = (obj: unknown): obj is boolean =>
  typeof obj === "boolean";

export const object = (obj: unknown): obj is Record<string, unknown> =>
  !!obj &&
  typeof obj === "object" &&
  obj !== null;

export const record = <T>(func: Guard<T>) =>
  (obj: unknown): obj is Record<string, T> =>
    object(obj) &&
    Object.values(obj).every(func);

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

export const array = <T>(func: Guard<T>) =>
  (obj: unknown): obj is T[] => Array.isArray(obj) && obj.every(func);

export function or<T, U>(func1: Guard<T>, func2: Guard<U>) {
  return (obj: unknown): obj is T | U => func1(obj) || func2(obj);
}

class OnFailImplementedIncorrectly extends Error {
  constructor() {
    super(
      "validate.onFail should always throw -- override validate.onFail with a function that throws or leave its default value.",
    );
  }
}
