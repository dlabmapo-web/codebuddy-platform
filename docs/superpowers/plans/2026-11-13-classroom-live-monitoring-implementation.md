# Classroom live monitoring implementation

1. Introduce a lazy class-scoped transport pool and shared roster/presence provider in a persistent workspace route group.
2. Reuse shared roster/presence in the student selector and help queue; add classroom entry and live counts to the selector.
3. Match the existing monitoring header and curriculum layout for teaching while keeping private workspaces and save guards.
4. Serialize scoped watch cleanup with pending starts and cover lifecycle races.
5. Verify fixed SQL budgets, transport continuity, student switching and all three staff roles against isolated fixtures; record results and clean up servers.
