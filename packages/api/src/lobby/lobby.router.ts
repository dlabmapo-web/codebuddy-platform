import { createAccess } from "../orpc/access.js";
import type { ORPCDeps, ORPCImplementer } from "../orpc/context.js";

export function createLobbyRouter(os: ORPCImplementer, deps: ORPCDeps) {
  const access = createAccess(os, deps);

  return {
    /**
     * `authenticated`, never `studentAuthenticated`. An applicant is not a
     * student anywhere yet, so there is no inactivity lease to hold them to —
     * and the lobby is the one surface that must stay reachable while somebody
     * works out whether they belong here at all.
     */
    academy: os.lobby.academy
      .use(access.authenticated)
      .handler(({ context, input }) =>
        deps.lobbyService.academy(context.identity, input.academySlug)
      ),
  };
}
