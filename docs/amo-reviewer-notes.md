# AMO reviewer notes: personal KeePassXC-Browser fork

This is an unofficial personal fork of KeePassXC-Browser, distributed through the unlisted channel. Upstream attribution and GPL-3.0 license are retained. Source repository: https://github.com/wanstarge/keepassxc-browser/tree/personal/firefox-signed . The source commit and package hashes for each submission are in the accompanying build record.

## Reproducing the package

Requirements: Git and PowerShell 7 (pwsh), on Windows or another system supported by PowerShell. No JavaScript compilation, minification, npm installation, Transifex credentials or desktop build is required. Extract the supplied committed source archive and run:

```powershell
pwsh -File tools/build-personal-firefox.ps1
```

Git metadata is required for the script's source archive and build record steps. When starting from the source ZIP, first initialize a local repository and commit the extracted files (`git init`, `git add .`, `git -c user.name=Reviewer -c user.email=reviewer@example.invalid commit -m Source`). The commit identifier/build record then differs from the publisher's, but the extension files are reproduced from the same sources. Compare the unpacked extension files rather than ZIP timestamps.

The script copies `keepassxc-browser/`, replaces manifest.json using `dist/manifest_firefox.json` and `tools/firefox-personal.json`, and adds LICENSE. It changes the display name, version, homepage, independent Gecko ID, Firefox minimum version (142), and the data transmission declaration. It removes legacy `applications` in favor of `browser_specific_settings`. It adds no remote code, telemetry, diagnostic scripts or custom update server.

## Functional changes

Relative to upstream commit fab74af89765875e2104003374465374b19a2eff, only `content/autocomplete.js` and `content/fields.js` contain functional changes: constrain credential menus to the available viewport and keep compact keyboard selection visible; prevent repeated icon creation for the same segmented TOTP field. Regression tests are outside the extension package. Development used generative AI assistance.

## Data and native application

The extension provides credential retrieval/filling, passkey and OTP integration using an encrypted connection to a local KeePassXC native messaging host. Authentication information, browsing activity and website content can be transmitted to that local desktop application. These required categories are declared for Firefox's built-in consent flow. The personal build introduces no new collection endpoint. Independent add-on ID: `keepassxc-browser-scrollfix@wanxingge.site`; a matching desktop native host allowlist entry is required.

## Bundled third-party JavaScript

These files are inherited from upstream. Publisher verification compared their bytes against public npm release tarballs:

| File | Release | Comparison |
| --- | --- | --- |
| background/nacl.min.js | tweetnacl 1.0.3 | Exact byte match |
| background/nacl-util.min.js | tweetnacl-util 0.15.0 | Exact byte match |
| common/browser-polyfill.min.js | webextension-polyfill 0.12.0 | Same content after normalizing line endings |
| bootstrap/bootstrap.min.js | Bootstrap 5.3.2 | Same content after normalizing line endings and removing the trailing sourceMappingURL comment |

Original releases and readable source:

- TweetNaCl: https://registry.npmjs.org/tweetnacl/-/tweetnacl-1.0.3.tgz ; https://github.com/dchest/tweetnacl-js/tree/v1.0.3
- TweetNaCl util: https://registry.npmjs.org/tweetnacl-util/-/tweetnacl-util-0.15.0.tgz ; https://github.com/dchest/tweetnacl-util-js/tree/v0.15.0
- WebExtension polyfill: https://registry.npmjs.org/webextension-polyfill/-/webextension-polyfill-0.12.0.tgz ; https://github.com/mozilla/webextension-polyfill/tree/0.12.0
- Bootstrap: https://registry.npmjs.org/bootstrap/-/bootstrap-5.3.2.tgz ; https://github.com/twbs/bootstrap/tree/v5.3.2

No library code was changed by this personal fork. The inherited line-ending/source-map differences are disclosed here so they can be accounted for during verification.

## Existing lint warnings

Local web-ext 10 reports warnings for cross-browser `offscreen.createDocument`, `dom.openOrClosedShadowRoot` and three inherited innerHTML uses. The offscreen path guards the browser environment; the DOM API supports shadow-root field handling. The innerHTML warnings concern upstream translation/bootstrap code. These files were not changed by the functional patches. Warnings are disclosed for review and are not evidence of signing approval.
