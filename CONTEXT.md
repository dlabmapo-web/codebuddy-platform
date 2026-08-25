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
