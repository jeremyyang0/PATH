export type Result<T, E = Error> = Ok<T> | Err<E>;

export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
export const err = <E>(error: E): Err<E> => ({ ok: false, error });

export function mapResult<T, U, E>(
  input: Result<T, E>,
  mapper: (value: T) => U,
): Result<U, E> {
  return input.ok ? ok(mapper(input.value)) : input;
}
