# Cove Domain Context

## Product Surfaces

### Cove Home

The public marketing and product-entry site served from `coveedu.com`. Cove
Home links users to Cove Studio and, during the transition, to the preserved
Cove MVP.

### Cove Studio

The version 2 multi-academy learning platform served from `cs.coveedu.com`.
Cove Studio is a standalone deployment with Supabase authentication and must
not depend on Cove MVP route or session implementations.

### Cove MVP

The preserved version 1 platform from the `main` branch, served from
`mvp.coveedu.com` during the transition. Removing Cove MVP modules from the v2
branch does not remove the Cove MVP codebase or deployment.

## Routing Concepts

### Canonical Route Module

The deep Cove Studio module that owns human-facing path construction,
post-authentication destinations, academy-slug paths, and temporary
compatibility destinations. Callers do not construct Cove Studio paths from
string fragments.

### Academy Slug

The readable, organization-scoped academy identifier used in Cove Studio
addresses, for example `/academy/dlab-gangnam/courses`. Database IDs remain internal
identifiers and are not the canonical academy URL interface.

## Library Course Sync

A library master has an editable working tree and internal immutable snapshots.
Admin saves collect a batch; **Publish updates** shares the saved batch at once.
Release notes, release counters and history are not part of the editing UI.
Academy browsing and adoption use the latest release. A linked academy copy
retains its own rows, student history and local edits. Sync merges independent
units automatically; overlapping edits keep the academy value and require an
academy decision. Only new overlapping disagreements notify active Managers and
Team Leads, grouped per academy course. Notifications lead to the course’s marked
rows and scoped comparisons; reading does not accept a change. A retained base
records what the two sides last shared.

Legacy identity matching establishes which old academy row corresponds to a
library node. It does not prove historical content. Uncertain nodes are
quarantined until academy review; differing values with no historical base
remain explicit decisions. Library removals archive content and retain history.
Grading corrections affect future attempts without resetting solved progress.
See [the operator runbook](docs/operations/library-sync.md) for flags and rollout.
