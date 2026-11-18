ALTER TABLE course_sync_states
  ADD COLUMN review_version INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN review_updated_at TIMESTAMPTZ(6),
  ADD COLUMN review_items JSONB NOT NULL DEFAULT '[]';

CREATE TABLE library_sync_notification_reads (
  course_id UUID NOT NULL REFERENCES course_sync_states(course_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  review_version INTEGER NOT NULL,
  acknowledged_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  PRIMARY KEY(course_id, user_id)
);
CREATE INDEX library_sync_notification_reads_user_id_idx ON library_sync_notification_reads(user_id);
ALTER TABLE library_sync_notification_reads ENABLE ROW LEVEL SECURITY;

-- Existing unresolved reviews must also appear after the feature is deployed.
UPDATE course_sync_states s SET review_version=1,
  review_updated_at=coalesce(s.last_run_at,now())
WHERE s.open_conflict_count>0;
UPDATE course_sync_states s SET review_items=coalesce((
  SELECT jsonb_agg(jsonb_build_object('id',x.id,'nodeKey',x.node_key,
    'localId',k.local_id,'unitKey',x.unit_key) ORDER BY x.created_at,x.id)
  FROM library_sync_conflicts x LEFT JOIN library_sync_links k
    ON k.copy_course_id=x.copy_course_id AND k.node_key=x.node_key
  WHERE x.copy_course_id=s.course_id AND x.status='OPEN'
),'[]'::jsonb);
