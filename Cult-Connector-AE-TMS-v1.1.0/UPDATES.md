# In-panel updates (GitHub Releases)

Cult Connector checks for updates using the **GitHub Releases API** (no Cult server required for the check).

## Repository

Configured in the panel script:

- **Owner:** `CultExtensions`
- **Repo:** `cult-studio`
- **API:** `GET https://api.github.com/repos/CultExtensions/cult-studio/releases/latest`

You can change `UPDATE_GITHUB_OWNER` and `UPDATE_GITHUB_REPO` at the top of `Cult Connector (AE ↔ TMS).jsx` if you publish from another repo (e.g. a public release mirror).

## How it works in After Effects

1. On panel load, a background task compares `PLUGIN_VERSION` (e.g. `1.1.0`) to the latest release tag on GitHub.
2. If GitHub is newer, **“New version available (vX.Y.Z)”** appears in blue at the **bottom left** of the Composition tab (next to Readme).
3. Click the link → confirm → the panel downloads the release asset and installs the `.jsxbin` (or saves to `Documents/CultConnector_Update` if auto-install is blocked).

## Publishing a release (maintainers)

1. Bump `PLUGIN_VERSION` in `Cult Connector (AE ↔ TMS).jsx` to match the tag (semver, e.g. `1.1.0`).

2. Build / export the panel as **`.jsxbin`** (recommended for end users).

3. Create a GitHub Release on `CultExtensions/cult-studio`:
   - **Tag:** `v1.1.0` (panel strips the leading `v` for comparison)
   - **Asset (preferred name):** `Cult.Connector.AE.TMS.jsxbin`
   - **Alternate names also work:** `Cult Connector (AE ↔ TMS).jsxbin` or any `.jsxbin` (first match used as fallback)

4. Users restart After Effects after install.

## Troubleshooting

| Symptom | Cause |
|--------|--------|
| Link never appears | Already on latest version, or GitHub API blocked (firewall/proxy) |
| “Update check failed” | No network permission in AE prefs, or HTML returned instead of JSON |
| Download OK but old panel still runs | AE still loading an old `.jsxbin` from the app bundle — remove duplicate installs and restart AE |

## Optional: cult-translator-crowdin repo

Older builds pointed at `cult-translator-crowdin` or `cult-connector`. v1.1.0 uses `cult-studio` for release assets. Keep release asset naming consistent when publishing.
