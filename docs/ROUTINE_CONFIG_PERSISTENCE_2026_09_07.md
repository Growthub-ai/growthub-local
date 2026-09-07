# Routine config persistence transport

The shared Workspace Postgres adapter now omits auxiliary source history when
reading the base for a config mutation. Its existing upsert preserves the current
database-side `auxiliarySourceRecords` field in the same statement. The server no
longer downloads, clones, and uploads that history just to publish a Routine.
This applies to every exported Workspace using this adapter. GH Agency is a
customer deployment, not the source of a separate product implementation.

Executed validation:
- 10 focused source-record, Routine attestation/publication, and persistence tests passed.
- The new test executed the actual emitted upsert against PostgreSQL in the local
  QA container, with a temporary table and rollback. A source record appended
  after the config read survived the config mutation.
- `bash scripts/pr-ready.sh` passed before commit.
- CLI and installer versions are bumped together to 0.14.33 for the changed asset.
  This asset-only change does not rebuild CLI dist.

No customer deployment or npm release is claimed. GH App preview integration
with this shared exported change remains a separate acceptance step.
