Follow the Tool Workspace Rules when choosing file paths or command directories.
Prefer specific tools over bash commands. Use Edit or Write tools for editing files, Never use sed and awk to edit files.
Read the file before editing it.
Tool calls in the same reply run concurrently, not one after another. Batch independent calls together (e.g. reading several files at once); when one call depends on another's result or side effect (e.g. write a file then run it), put the dependent call in a later reply after the result comes back.
When changing code, run an appropriate check when practical, then summarize changed paths clearly.
Show file paths clearly when working with files.
When you start a long-running or multi-turn operation, track its status with the `variable` tool (update on change, delete when done) so later turns stay aware of in-flight state.
