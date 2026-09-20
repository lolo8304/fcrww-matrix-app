# AGENTS.md Best Practices

> Practical guidance distilled from GitHub's analysis of more than 2,500
> `agents.md` files.
>
> Use this document as a reference or as input when generating an
> `AGENTS.md` file for a repository.

## Core Principle

An effective `AGENTS.md` is not a vague prompt for a general-purpose
coding assistant.

It is an **operating manual for a specialized software agent**.

The agent should know:

-   what its role is;
-   what technology stack it is working with;
-   how the repository is structured;
-   which commands it can and should run;
-   how code should look;
-   how its work must be tested;
-   which Git workflow to follow;
-   what it may change;
-   what requires approval;
-   what it must never change.

Prefer concrete instructions, commands, paths, and examples over general
statements.

For example, avoid:

> You are a helpful coding assistant. Write good code and follow best
> practices.

Prefer:

> You are a test engineer responsible for TypeScript unit and
> integration tests.\
> Add tests under `tests/`, run `npm test`, and never modify production
> source code unless explicitly requested.

------------------------------------------------------------------------

# The Six Core Areas

A strong `AGENTS.md` should cover these six areas:

1.  Commands
2.  Testing
3.  Project structure
4.  Code style
5.  Git workflow
6.  Boundaries

------------------------------------------------------------------------

## 1. Commands

Put important executable commands **early in the file**.

Agents repeatedly need build, test, lint, formatting, development, and
validation commands. Give the complete command, including useful flags
and options.

Example:

``` bash
npm install
npm run dev
npm run build
npm test
npm run lint
npm run lint --fix
```

Do not merely state:

> Use ESLint and Jest.

Instead state exactly how they are executed:

``` bash
npm run lint --fix
npm test
```

Where useful, explain what a command validates:

``` md
- **Build:** `npm run build` - compiles TypeScript and writes output to `dist/`
- **Test:** `npm test` - runs the Jest test suite
- **Lint:** `npm run lint --fix` - checks ESLint rules and fixes safe formatting issues
```

------------------------------------------------------------------------

## 2. Testing

Tell the agent:

-   which test frameworks are used;
-   where tests belong;
-   which tests must be run;
-   when new tests are required;
-   what to do when tests fail.

Example:

``` md
## Testing

- Unit tests use Jest.
- Integration tests are under `tests/integration/`.
- Browser tests use Playwright.
- Add or update tests whenever behavior changes.
- Run `npm test` before considering a task complete.
- Never delete or disable a failing test merely to make the test suite pass.
```

A testing agent can have even stricter boundaries:

``` md
- Write tests under `tests/`.
- Read production code from `src/`.
- Never modify `src/` unless explicitly authorized.
- Never remove failing tests without user approval.
```

------------------------------------------------------------------------

## 3. Project Structure

Describe the repository using real paths.

Example:

``` text
src/        Application source code
tests/      Unit and integration tests
docs/       Project documentation
scripts/    Development and maintenance scripts
dist/       Generated build output
```

For a monorepo:

``` text
apps/
  api/      Backend API
  web/      Frontend application

packages/
  common/   Shared types and utilities

docs/       Architecture and developer documentation
```

Explicitly say which directories are intended for reading and writing
when this matters.

Example:

``` md
- `src/` - application code; read and modify when implementing features
- `tests/` - tests; add and modify as required
- `docs/` - documentation
- `dist/` - generated; never edit manually
- `node_modules/` - dependencies; never edit
```

------------------------------------------------------------------------

## 4. Code Style

Concrete examples are more useful than long prose descriptions.

State important conventions explicitly.

Example:

``` md
### Naming

- Functions: camelCase (`getUserData`, `calculateTotal`)
- Classes: PascalCase (`UserService`, `DataController`)
- Constants: UPPER_SNAKE_CASE (`API_KEY`, `MAX_RETRIES`)
```

Then provide a small representative example:

``` typescript
// Good
async function fetchUserById(id: string): Promise<User> {
  if (!id) {
    throw new Error('User ID required');
  }

  const response = await api.get(`/users/${id}`);
  return response.data;
}
```

Contrast it with something the project does not want:

``` typescript
// Avoid
async function get(x) {
  return await api.get('/users/' + x).data;
}
```

Keep examples short and representative of the actual repository.

------------------------------------------------------------------------

## 5. Git Workflow

Document how changes should be handled.

For example:

``` md
## Git workflow

- Keep changes focused on the requested task.
- Do not modify unrelated files.
- Do not rewrite existing history.
- Do not force-push.
- Run tests before committing.
- Follow the repository's existing commit-message convention.
- Do not commit generated files unless the repository already tracks them.
```

If branches or pull-request rules matter, document them explicitly.

Example:

``` md
- Feature work starts from `development`.
- Production releases are merged into `main`.
- Never push directly to `main`.
```

Only include rules that are actually true for the repository.

------------------------------------------------------------------------

## 6. Boundaries

Use explicit boundaries rather than relying on the agent to infer risk.

A useful three-level model is:

### Always

Actions the agent can perform without additional approval.

### Ask first

Actions that may have architectural, operational, or compatibility
consequences.

### Never

Actions that are prohibited.

Example:

``` md
## Boundaries

### Always

- Follow existing project patterns.
- Add tests when behavior changes.
- Run relevant tests after modifying code.
- Run linting before finishing.

### Ask first

- Adding or removing dependencies
- Changing database schemas
- Modifying CI/CD configuration
- Changing public APIs in a breaking way
- Large architectural refactors
- Deployment actions

### Never

- Commit secrets, passwords, tokens, or API keys
- Modify `node_modules/`
- Modify vendored dependencies
- Disable tests to make a build pass
- Remove failing tests simply because they fail
- Modify production configuration without explicit authorization
```

Clear boundaries help prevent destructive or overly broad changes.

------------------------------------------------------------------------

# Be Specific About the Technology Stack

Avoid descriptions such as:

> This is a React project.

Prefer:

``` md
## Technology stack

- Node.js 24
- TypeScript
- React 18
- Vite
- Tailwind CSS
- Jest
- Playwright
```

Include important versions and dependencies when they materially affect
implementation decisions.

The purpose is not to duplicate `package.json`, but to tell the agent
which technologies define the architecture.

------------------------------------------------------------------------

# Give the Agent a Specific Role

Specialized agents tend to be easier to instruct than a generic "do
everything" agent.

Examples include:

-   documentation agent;
-   test agent;
-   lint agent;
-   API agent;
-   development/deployment agent;
-   security-analysis agent.

A role should define:

-   what the agent specializes in;
-   what it reads;
-   what it writes;
-   what output it produces;
-   how it validates that output.

Example:

``` md
## Role

You are a QA software engineer for this project.

You:

- read application code under `src/`;
- create and maintain tests under `tests/`;
- run the project's test commands;
- analyze failures;
- add edge-case coverage.

You do not modify production code unless explicitly requested.
```

------------------------------------------------------------------------

# Recommended Agent Types

## Documentation Agent

Purpose:

-   read source code;
-   create API documentation;
-   create function references;
-   create tutorials;
-   update existing documentation.

Useful commands:

``` bash
npm run docs:build
npx markdownlint docs/
```

Typical boundary:

``` md
Write to `docs/`.
Read from `src/`.
Never modify application source code.
```

------------------------------------------------------------------------

## Test Agent

Purpose:

-   write unit tests;
-   write integration tests;
-   add edge-case coverage;
-   execute tests;
-   analyze failures.

Possible commands:

``` bash
npm test
pytest -v
cargo test --coverage
```

Typical boundary:

``` md
Write tests.
Never remove a failing test merely because it cannot currently be fixed.
```

------------------------------------------------------------------------

## Lint Agent

Purpose:

-   formatting;
-   import ordering;
-   naming conventions;
-   lint-rule fixes.

Possible commands:

``` bash
npm run lint --fix
prettier --write .
```

Typical boundary:

``` md
Fix style and formatting only.
Do not intentionally change application behavior.
```

------------------------------------------------------------------------

## API Agent

Purpose:

-   REST endpoints;
-   GraphQL resolvers;
-   request validation;
-   error handling;
-   API tests.

Possible commands:

``` bash
npm run dev
npm test
```

Typical boundary:

``` md
You may modify API routes and their tests.
Ask before changing database schemas.
```

------------------------------------------------------------------------

## Development / Deployment Agent

Purpose:

-   development builds;
-   local deployment;
-   Docker image creation;
-   development-environment validation.

Keep this agent tightly constrained.

Example:

``` md
- Local and development environments only.
- Never deploy to production without explicit approval.
- Require approval before potentially destructive operations.
```

------------------------------------------------------------------------

# Start Small

Do not try to predict every future situation in the first version.

Start with:

1.  a clear role;
2.  the relevant commands;
3.  the important boundaries.

Then improve the file based on mistakes or ambiguity observed while
using the agent.

Good `AGENTS.md` files evolve through iteration.

If the agent repeatedly makes a particular mistake, add a concrete rule
or example addressing that mistake.

------------------------------------------------------------------------

# Recommended Template

``` md
---
name: your-agent-name
description: One-sentence description of what this agent does
---

# Role

You are an expert [technical writer / test engineer / API engineer / security analyst]
for this project.

You specialize in [specific responsibility].

Your primary output is [documentation / tests / API code / reports].

# Project Knowledge

## Technology Stack

- [technology + version]
- [technology + version]
- [important framework/library]

## Repository Structure

- `src/` - [purpose]
- `tests/` - [purpose]
- `docs/` - [purpose]

# Commands

## Install

`[command]`

## Development

`[command]`

## Build

`[command]`

## Test

`[command]`

## Lint

`[command]`

# Testing

- [test framework]
- [test location]
- [test expectations]
- [commands that must pass]

# Standards

## Naming

- Functions: [convention]
- Classes: [convention]
- Constants: [convention]

## Code Style

Follow existing repository patterns.

Example:

```language
[small example of preferred project code]
```

# Git Workflow

-   \[branch rules\]
-   \[commit rules\]
-   \[pull-request rules\]
-   Keep changes focused.
-   Do not modify unrelated files.

# Boundaries

## Always

-   \[safe required action\]
-   \[safe required action\]

## Ask First

-   \[database/schema changes\]
-   \[new dependencies\]
-   \[CI/CD changes\]
-   \[breaking API changes\]

## Never

-   Commit secrets or credentials.
-   Modify generated dependency directories.
-   Disable tests simply to make them pass.
-   Make unauthorized production changes.

# Definition of Done

Before finishing:

1.  Run relevant tests.
2.  Run linting.
3.  Run type checking if applicable.
4.  Run the build if applicable.
5.  Confirm no unrelated files changed.
6.  Update documentation when behavior or public APIs changed.
7.  Report what was changed and which checks were executed. \`\`\`

------------------------------------------------------------------------

# Checklist for Generating an AGENTS.md

Before generating the final file, determine the following from the
repository whenever possible:

-   exact technology stack and important versions;
-   package manager;
-   build command;
-   development command;
-   test command;
-   lint command;
-   type-check command;
-   repository directory structure;
-   test framework and test locations;
-   naming conventions;
-   representative code style;
-   branch and Git workflow;
-   generated directories;
-   sensitive or protected files;
-   production/deployment restrictions;
-   database migration rules;
-   API compatibility requirements.

Do not invent project-specific rules when the repository does not
establish them.

When something important cannot be determined, mark it for confirmation
rather than silently assuming it.

------------------------------------------------------------------------

# Quality Criteria

A good `AGENTS.md` should allow an agent to answer these questions
immediately:

**What is my job?**

The role and expected output are explicit.

**What project am I working in?**

The technology stack and repository structure are explicit.

**How do I work on it?**

Exact commands are provided.

**How do I know my change works?**

Testing and validation procedures are provided.

**What does good code look like?**

Concrete conventions and examples are provided.

**What am I allowed to change?**

Always / Ask First / Never boundaries are explicit.

**How do I finish the task safely?**

The Git workflow and definition of done are explicit.

If those questions can be answered from the file without guesswork, the
`AGENTS.md` is doing its job.
