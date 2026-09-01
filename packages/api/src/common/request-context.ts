import { AsyncLocalStorage } from "node:async_hooks";

/**
 * What the current request has established about itself.
 *
 * One field so far, and the reason it is worth a store at all: the support
 * grant an academy act was authorized by has to reach every audit record that
 * act produces, and there are 59 `audit.write` call sites across 18 services.
 * Threading a parameter through all of them would make correctness depend on
 * every future feature remembering — and the one that forgot would be an
 * unattributed edit inside a customer's academy, which is the exact failure
 * this whole design exists to prevent.
 *
 * So the grant travels with the request instead. `AcademyAccessService`
 * records it when it answers `via: "support"`, and `AuditService` reads it.
 * Nothing else may read it to *authorize* anything: it is an attribution
 * channel, not an authority one, and the moment it decides access it becomes
 * ambient authority that no call site declares.
 */
export type RequestContext = {
  supportGrantId?: string;
  /**
   * Which academy role a platform operator is viewing as.
   *
   * Travels as a request header rather than a stored preference, because it is
   * a property of what the operator is looking at right now — two tabs open on
   * two academies as two different roles is the normal case for somebody
   * comparing them.
   *
   * Never authority on its own. It only narrows which role's set
   * `AcademyAccessService` consults *after* it has established that the caller
   * is an operator at all.
   */
  viewRole?: string;
};

const storage = new AsyncLocalStorage<RequestContext>();

/** Runs `fn` inside a fresh context. Entered once per HTTP request. */
export function runInRequestContext<T>(fn: () => T): T {
  return storage.run({}, fn);
}

/**
 * Records the grant that authorized this request.
 *
 * Silently does nothing outside a request — a background job, a socket frame,
 * a unit test — because there is nothing to attribute in those and throwing
 * would make the access service unusable off the HTTP path.
 */
export function setRequestSupportGrant(grantId: string): void {
  const context = storage.getStore();
  if (context) context.supportGrantId = grantId;
}

export function currentSupportGrantId(): string | undefined {
  return storage.getStore()?.supportGrantId;
}

export function setRequestViewRole(role: string): void {
  const context = storage.getStore();
  if (context) context.viewRole = role;
}

export function currentViewRole(): string | undefined {
  return storage.getStore()?.viewRole;
}
