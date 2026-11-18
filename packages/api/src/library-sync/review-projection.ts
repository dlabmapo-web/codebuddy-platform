import type { Prisma } from "../generated/prisma/client.js";
/** Refresh outline badges in the same transaction as the decision they describe. */
export async function refreshReviewItems(tx: Prisma.TransactionClient, courseId: string) {
    await tx.$executeRaw `
    UPDATE course_sync_states s SET review_items=coalesce((
      SELECT jsonb_agg(jsonb_build_object('id',x.id,'nodeKey',x.node_key,
        'localId',k.local_id,'unitKey',x.unit_key) ORDER BY x.created_at,x.id)
      FROM library_sync_conflicts x LEFT JOIN library_sync_links k
        ON k.copy_course_id=x.copy_course_id AND k.node_key=x.node_key
      WHERE x.copy_course_id=s.course_id AND x.status='OPEN'
    ),'[]'::jsonb)
    WHERE s.course_id=${courseId}::uuid`;
}
