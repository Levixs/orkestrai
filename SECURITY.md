# Security Policy

## Supported Versions

Security fixes are applied to the latest released version of Orkestrai. Users
should update to the newest patch before reporting behavior that may already be
fixed.

## Reporting A Vulnerability

Do not open a public issue for suspected vulnerabilities, leaked credentials,
authentication bypasses, command execution problems, unsafe file access, or
update-channel weaknesses.

Use GitHub's private vulnerability reporting form:

<https://github.com/beeblock/orkestrai/security/advisories/new>

Include:

- the affected Orkestrai version and operating system;
- prerequisites and exact reproduction steps;
- the expected and observed behavior;
- the impact and any known workaround;
- logs or a proof of concept with credentials and personal data removed.

The maintainers will acknowledge the report privately, validate its scope, and
coordinate remediation and disclosure. Please do not disclose the issue before
a fix or an agreed disclosure date is available.

## Scope

Orkestrai launches and coordinates third-party agent CLIs installed by the user.
Vulnerabilities in Claude Code, Codex CLI, Kimi Code, OpenCode, operating-system
shells, or downloaded community skills should also be reported to their
respective maintainers. Reports about Orkestrai's integration, permission
boundaries, local data, bridge authentication, updater, or packaging remain in
scope here.
