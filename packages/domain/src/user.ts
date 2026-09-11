import type { UserId } from "./ids.js";
import { newUserId } from "./ids.js";
import { domainError } from "./errors.js";
import type { Result } from "./result.js";
import { err, ok } from "./result.js";

export interface User {
  readonly id: UserId;
  readonly displayName: string;
  readonly createdAt: Date;
}

export interface CreateUserInput {
  readonly displayName: string;
  readonly now?: Date;
}

export function createUser(input: CreateUserInput): Result<User> {
  const displayName = input.displayName.trim();
  if (displayName.length === 0) {
    return err(domainError("VALIDATION_ERROR", "displayName must not be empty"));
  }
  return ok({
    id: newUserId(),
    displayName,
    createdAt: input.now ?? new Date(),
  });
}
