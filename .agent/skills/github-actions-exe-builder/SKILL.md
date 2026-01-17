---
name: github-actions-exe-builder
description: Use when configuring GitHub Actions to build, package, and publish applications (especially Electron) as Windows executables, or when encountering permission (403 Forbidden) and PowerShell environment issues in CI runners.
---

# GitHub Actions EXE Builder

## Overview
Automating the build and release process for Windows executables (.exe) requires careful configuration of GitHub Actions permissions and environment-specific syntax. This skill provides patterns for successful builds, publishing to Releases, or using Artifacts for testing.

## When to Use
- You need to build a Windows .exe from a Node.js/Electron project via GitHub Actions.
- You encounter `HttpError: 403 Forbidden` ("Resource not accessible by integration") when publishing a release.
- You want to generate download links for builds without creating a formal GitHub Release.
- You are using `windows-latest` runners and need to ensure script compatibility.

## Core Patterns

### 1. Release Publishing Pattern
Use this when you want to automatically create a GitHub Release and upload the installer.

```yaml
jobs:
  build:
    runs-on: windows-latest
    permissions:
      contents: write  # CRITICAL: Allows creating Releases
    steps:
      - uses: actions/checkout@v4
      - name: Build and Publish
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: npx electron-builder --win --x64 --publish always
```

### 2. Artifact Testing Pattern
Use this to generate a download link in the Actions summary without a formal Release.

```yaml
      - name: Build Only
        run: npx electron-builder --win --x64 --publish never

      - name: Upload Installer
        uses: actions/upload-artifact@v4
        with:
          name: windows-installer
          path: dist/*.exe
```

## Quick Reference

| Category | Key Configuration / Command |
| :--- | :--- |
| **Permissions** | `permissions: contents: write` (at job or workflow level) |
| **PowerShell Logic** | Use `-eq`, `;`, and double quotes: `if ("${{ ... }}" -eq "true")` |
| **Publishing** | `--publish always` (Release) vs `--publish never` (Artifacts) |
| **External Token** | Use `GH_TOKEN` or `GITHUB_TOKEN` in `env` |

## Common Mistakes & Troubleshooting

### HttpError: 403 Forbidden
- **Symptom**: `Resource not accessible by integration` during release creation.
- **Fix 1**: Add `permissions: contents: write` to the workflow YAML.
- **Fix 2**: In Repository **Settings > Actions > General**, set **Workflow permissions** to "Read and write permissions".
- **Fix 3**: If organization policies block the above, use a Personal Access Token (PAT) stored as a Secret (`GH_TOKEN`).

### PowerShell Syntax Traps
- **Multiple Commands**: Use `;` instead of `&&`.
- **String Comparisons**: Always quote variables to prevent empty string errors: `if ("${{ var }}" -eq "val")`.

## Implementation Checklist
- [ ] Job has `permissions: contents: write` (for Releases).
- [ ] Repo settings allow write permissions (or PAT is configured).
- [ ] PowerShell syntax used for Windows runners (`;` instead of `&&`).
- [ ] Output path in `upload-artifact` matches build output (usually `dist/`).
- [ ] Build triggered by Tag or Manual Dispatch as intended.
