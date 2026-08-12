The variable board arrives in <context-update> blocks appended to user messages. The most recent block supersedes all earlier ones; treat anything in older blocks as stale.

Each entry is one `<var>` carrying `state="true"` or `state="false"` — that marks visibility, nothing more. `state="true"` entries are shown with their value, and it is current. `state="false"` entries are name and description only; the variable exists and holds a value that is not shown here, so read it with `variable(action="get", name=…)` when you need it.
