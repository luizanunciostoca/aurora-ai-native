export interface RuntimeValidator<T> {
  parse(input: unknown): T;
}

export interface RuntimeSchema<T> extends RuntimeValidator<T> {
  safeParse(input: unknown):
    | { readonly success: true; readonly data: T }
    | { readonly success: false; readonly error: TypeError };
  serialize(input: unknown): string;
}

export function safeParseWith<T>(
  parse: (input: unknown) => T,
  input: unknown,
):
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly error: TypeError } {
  try {
    return { success: true, data: parse(input) };
  } catch (error) {
    if (error instanceof TypeError) {
      return { success: false, error };
    }

    throw error;
  }
}
