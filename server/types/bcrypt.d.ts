// Minimal typings for the native `bcrypt` package (it ships none). Only the calls used by
// server/domain/password.ts are declared, to avoid adding @types/bcrypt (working rule 5).
declare module 'bcrypt' {
  export function hash(data: string, saltRounds: number): Promise<string>;
  export function hashSync(data: string, saltRounds: number): string;
  export function compare(data: string, encrypted: string): Promise<boolean>;
  const bcrypt: { hash: typeof hash; hashSync: typeof hashSync; compare: typeof compare };
  export default bcrypt;
}
