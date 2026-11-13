import { cache } from 'react';
import { createServerORPCClient } from './orpc-server';

/** Shared layout and unavailable-student fallback resolve the authorized roster once. */
export const readClassWorkspaceRoster = cache((academyId: string, classId: string) =>
  createServerORPCClient().monitoring.getClassRoster({ academyId, classId }));
