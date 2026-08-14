# Finding Rubric

## `new-supported`

Use only when the packet itself supports the conclusion. Example: the packet declares that external network access is forbidden but also shows a production flow that calls `fetch()` without an approved exception.

## `existing-known-gap`

Use when the packet already names the uncertainty. Example: a packet says that a symlink rejection test has not been run. This confirms a test gap; it does not establish a symlink bypass.

## `insufficient-or-inapplicable`

Use when a claim assumes behavior not stated by the packet. Example: a claim about dangerous renderer Markdown links is inapplicable if the packet states that Markdown is opened by the operating system and is not rendered inside the app.

## `outside-scope`

Use when the point concerns an excluded system or action, such as authentication or API integration where the packet explicitly limits the task to a local, read-only display.

## Evidence standard

For each finding, cite the packet section or quote a brief packet phrase. Separate facts from assumptions. If confirmation requires a test, name it as a future verification only; do not simulate or claim it was executed.
