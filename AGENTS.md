# Agent Instructions

This project uses **Strand** as its engineering source of truth. The workspace
pin is `.strand/ingot` and must remain `theos`.

## Workflow

```bash
strand prime
strand task ready
strand task show <uuid>
strand task claim <uuid>
strand task update <uuid> ...
strand task close <uuid>
```

Set `STRAND_AUTH_TOKEN_PATH` when the local cell requires authentication.
Use the pinned ingot for new work and native `blocks` dependencies for
ordering.

Do not resume Beads tracking. The hash-named file under `.beads/` and
`docs/migrations/2026-07-26-theos-beads-to-strand-v2.json` are immutable
cutover evidence. Beads IDs remain searchable in imported Strand issue bodies
and in the migration report.

Before ending a coding session:

1. Run the relevant tests, typecheck, and build.
2. Update or close the corresponding Strand issue.
3. Commit intentionally and push the branch.
4. Verify the worktree is clean except for explicitly preserved user changes.
