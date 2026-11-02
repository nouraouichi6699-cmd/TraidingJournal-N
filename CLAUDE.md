# CLAUDE.md

Standing instructions for work in this repository.

## Reporting after every task

- After every task that changes files: commit (message in a temporary file, `git commit -F <file>`, check with `git log -1`), then push to main.
- End EVERY final report with this block, filled from live git commands (never from memory):

  ```
  Commit: <short hash> (<full hash>)
  Subject: <commit subject>
  Pushed: local main = <hash>, origin/main = <hash>, same: yes/no
  Ahead/behind: <a> <b>
  Working tree: clean / <n> uncommitted files
  ```

- If a task changed no files, say "No commit (no file changes)" instead.
