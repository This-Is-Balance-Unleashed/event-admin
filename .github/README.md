# GitHub Actions CI/CD

This directory contains GitHub Actions workflows for continuous integration and automated code quality checks.

## Workflows

### 1. CI Workflow (`ci.yml`)

**Triggers:**

- Push to `main` or `develop` branches
- Pull requests to `main` or `develop` branches

**Jobs:**

#### Lint and Format Check

- Runs `oxlint` to check for code quality issues
- Runs `oxfmt --check` to verify code formatting
- Fails if any linting errors or formatting issues are found

#### Type Check

- Runs TypeScript type checking via build process
- Ensures type safety across the codebase

#### Test

- Runs the test suite with Vitest
- Ensures all tests pass before merging

**Usage:**
This workflow runs automatically on every push and PR. If it fails, fix the issues locally:

```bash
# Fix linting issues
bun run lint:fix

# Fix formatting issues
bun run fmt

# Run type check
bun run build --mode development

# Run tests
bun run test
```

### 2. Auto-fix Workflow (`autofix.yml`)

**Triggers:**

- Pull requests to `main` or `develop` branches
- Only runs for PRs from the same repository (not forks)

**What it does:**

- Automatically formats code with `oxfmt`
- Attempts to auto-fix linting issues with `oxlint --fix`
- Commits and pushes the changes back to the PR branch

**Note:** This workflow requires write permissions and will only run on non-fork PRs for security reasons.

## CI Status Badges

Add these badges to your main README.md:

```markdown
![CI](https://github.com/YOUR_USERNAME/YOUR_REPO/workflows/CI/badge.svg)
![Auto-fix](https://github.com/YOUR_USERNAME/YOUR_REPO/workflows/Auto-fix/badge.svg)
```

## Local Development

Before pushing, ensure your code passes all checks:

```bash
# Run all checks
bun run lint && bun run fmt:check && bun run test

# Or fix issues automatically
bun run lint:fix && bun run fmt
```

## Caching

The workflows use Bun's built-in caching for faster dependency installation. The `--frozen-lockfile` flag ensures reproducible builds.

## Performance

Using oxlint and oxfmt provides significant performance benefits:

- **oxlint**: 50-100x faster than ESLint
- **oxfmt**: 30x faster than Prettier

This means faster CI runs and quicker feedback on PRs.

## Troubleshooting

### CI fails on formatting check

Run locally: `bun run fmt:check`
Fix with: `bun run fmt`

### CI fails on linting

Run locally: `bun run lint`
Fix with: `bun run lint:fix`

### Type check fails

Run locally: `bun run build --mode development`
Fix TypeScript errors in your code

### Tests fail

Run locally: `bun run test`
Fix failing tests before pushing

## Modifying Workflows

To modify the workflows:

1. Edit the YAML files in `.github/workflows/`
2. Test locally with [act](https://github.com/nektos/act) (optional)
3. Push changes and verify they work in GitHub Actions

## Environment Variables

If your project needs environment variables in CI:

1. Add them to GitHub repository secrets
2. Reference them in the workflow:

```yaml
- name: Run build
  run: bun run build
  env:
    MY_SECRET: ${{ secrets.MY_SECRET }}
```

## Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Bun GitHub Actions](https://bun.sh/docs/install/ci)
- [Oxc Documentation](https://oxc.rs/)
