// @interview-coach/backend — profile application service (Phase 2).
//
// Owns the create/edit rule for a user's profile: the domain validates the
// fields and preserves createdAt; the service picks create-vs-update and
// persists. The route layer resolves the owning user id from the session, so
// this service never trusts a caller-supplied user id.

import {
  createUserProfile,
  updateUserProfile,
  type DomainError,
  type ProfileInput,
  type RepositorySet,
  type Result,
  type UserId,
  type UserProfile,
} from "@interview-coach/domain";

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
