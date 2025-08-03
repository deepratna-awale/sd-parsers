# Version Management with Git Hooks

This project includes automated version synchronization between git tags and package.json.

## Setup

The following git hooks and scripts are configured:

1. **Pre-push hook** (`.git/hooks/pre-push`) - Automatically syncs package.json version when pushing version tags
2. **Post-commit hook** (`.git/hooks/post-commit`) - Syncs package.json version after commits with version tags
3. **Manual sync script** (`scripts/sync-version.sh`) - Manual version synchronization tool

## Usage

### Automatic Workflow (Recommended)

1. **Create a new version tag:**
   ```bash
   git tag v1.2.3
   ```

2. **Push the tag:**
   ```bash
   git push origin v1.2.3
   ```

The pre-push hook will automatically:
- Detect the version tag format (v1.2.3)
- Update package.json version to match (1.2.3)
- Commit the package.json change
- Update the tag to point to the new commit

### Manual Sync

If you need to manually sync versions:

```bash
# Sync with latest tag
npm run sync-version

# Or sync with specific tag
./scripts/sync-version.sh v1.2.3
```

### Version Tag Format

Tags must follow the pattern: `v<major>.<minor>.<patch>[suffix]`

Examples:
- `v1.0.0` ✅
- `v1.2.3` ✅
- `v2.0.0-beta.1` ✅
- `v1.0.0-rc.1` ✅
- `1.0.0` ❌ (missing 'v' prefix)
- `version-1.0.0` ❌ (wrong format)

## Workflow Examples

### Release a new version

```bash
# 1. Make your changes and commit them
git add .
git commit -m "feat: add new feature"

# 2. Create and push a version tag
git tag v1.1.0
git push origin v1.1.0

# The package.json will be automatically updated and committed
```

### Check current version sync status

```bash
# Show current package.json version
node -p "require('./package.json').version"

# Show latest version tag
git describe --tags --abbrev=0

# Manual sync if needed
npm run sync-version
```

## Troubleshooting

### Hook not running?
- Ensure hooks are executable: `chmod +x .git/hooks/pre-push .git/hooks/post-commit`
- Check git hook configuration: `git config core.hooksPath`

### Version mismatch?
- Run manual sync: `npm run sync-version`
- Check tag format: `git tag --list | grep -E '^v[0-9]'`

### Script permissions?
```bash
chmod +x scripts/sync-version.sh
```
