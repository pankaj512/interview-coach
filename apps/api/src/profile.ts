// @interview-coach/api - profile application service.
//
// Owns: the create-vs-update rule for a user profile (domain validates,
// service persists). Surprising: never trusts a caller-supplied user id -
// the route layer resolves ownership from the session.
//
// History: Phase 2; see docs/SESSION_HANDOFF.md.

import {
  createUserProfile,
  updateUserProfile,
  type DomainError,
  type ProfileInput,
  type RepositorySet,
  type Result,
  type UserId,
  type UserProfile,
} from "@interview-coach/core";

export interface ProfileServiceDeps {
  readonly profiles: RepositorySet["profiles"];
  readonly now?: () => Date;
}

export class ProfileService {
  private readonly profiles: RepositorySet["profiles"];
  private readonly clock: () => Date;

  constructor(deps: ProfileServiceDeps) {
    this.profiles = deps.profiles;
    this.clock = deps.now ?? (() => new Date());
  }

  async get(userId: UserId): Promise<UserProfile | null> {
    return this.profiles.findByUserId(userId);
  }

  async upsert(
    userId: UserId,
    input: ProfileInput,
  ): Promise<Result<UserProfile, DomainError>> {
    const existing = await this.profiles.findByUserId(userId);
    const validated =
      existing === null
        ? createUserProfile({ userId, ...input, now: this.clock() })
        : updateUserProfile(existing, input, this.clock());
    if (!validated.ok) return validated;
    await this.profiles.save(validated.value);
    return validated;
  }
}
