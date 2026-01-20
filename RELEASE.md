# Release Guide

This document describes how to create a new release for 0neThing.

## Release Process

### 1. Prepare the Release

1. **Update version number** in `package.json`:
   ```json
   {
     "version": "1.0.0"
   }
   ```

2. **Update CHANGELOG** (if you have one) with new features, bug fixes, and breaking changes.

3. **Commit changes**:
   ```bash
   git add package.json CHANGELOG.md
   git commit -m "chore: bump version to v1.0.0"
   git push
   ```

### 2. Create and Push Tag

Create a new tag with the version number:

```bash
# Create annotated tag
git tag -a v1.0.0 -m "Release v1.0.0"

# Push tag to GitHub (this triggers the build workflow)
git push origin v1.0.0
```

**Note:** The tag must start with `v` (e.g., `v1.0.0`, `v2.1.3`) to trigger the build workflow.

### 3. Monitor Build

1. Go to the [Actions tab](../../actions) in GitHub
2. Watch the "Build and Release" workflow
3. The workflow will:
   - Build on macOS, Windows, and Linux
   - Run typecheck before building
   - Create draft release with all artifacts

### 4. Finalize Release

1. Go to [Releases](../../releases)
2. Find the draft release created by the workflow
3. Edit the release notes:
   - Add description of new features
   - List bug fixes
   - Note any breaking changes
   - Add screenshots if applicable
4. **Publish the release** (remove draft status)

## Build Artifacts

The workflow produces the following files:

### macOS
- `AI-Chat-{version}.dmg` - Disk image installer
- `AI-Chat-{version}-mac.zip` - Portable app bundle

### Windows
- `AI-Chat-Setup-{version}.exe` - NSIS installer with installation wizard
- `AI-Chat-{version}.exe` - Portable executable

### Linux
- `AI-Chat-{version}.AppImage` - Universal Linux package
- `AI-Chat_{version}_amd64.deb` - Debian/Ubuntu package

## Local Testing

Before creating a release, test the build locally:

```bash
# Test build without packaging (fast)
bun run build:unpack

# Build for your current platform
bun run build:mac     # macOS
bun run build:win     # Windows
bun run build:linux   # Linux
```

## Version Numbering

We follow [Semantic Versioning](https://semver.org/):

- **Major** (v2.0.0): Breaking changes
- **Minor** (v1.1.0): New features, backwards compatible
- **Patch** (v1.0.1): Bug fixes, backwards compatible

## Rollback

If you need to rollback a release:

1. Delete the tag locally and remotely:
   ```bash
   git tag -d v1.0.0
   git push origin :refs/tags/v1.0.0
   ```

2. Delete the release on GitHub

3. Fix the issues and create a new tag

## Troubleshooting

### Build fails on one platform

- Check the workflow logs for errors
- Test locally on that platform if possible
- Common issues:
  - Native dependencies not building
  - Missing build tools on CI
  - Code signing issues (macOS)

### Release artifacts missing

- Ensure the `release/` directory is being created by electron-builder
- Check the upload-artifact steps in the workflow
- Verify the file patterns match actual output files

## CI/CD Configuration

The release workflow is defined in `.github/workflows/build.yml`.

Key environment variables:
- `GH_TOKEN`: Required for electron-builder to publish releases (automatically provided)

## Code Signing (Optional)

For production releases, you may want to add code signing:

### macOS
- Set up Apple Developer account
- Add certificates to CI
- Configure in `electron-builder.yml`

### Windows
- Get code signing certificate
- Add to CI secrets
- Configure in `electron-builder.yml`

See [electron-builder documentation](https://www.electron.build/code-signing) for details.
