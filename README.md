# Insta-petty

This is a webextension for tracking follower count and followed/unfollowed history on Instagram.

## Browser support
For now the extension only supports Firefox desktop and Firefox mobile.


## Installing

### Installing on Desktop

Installing extension is done by clicking 'Install Add-on from file', see
https://support.mozilla.org/en-US/kb/find-and-install-add-ons-add-features-to-firefox

### Installing on Android

Installing extension on Android is more involved, see https://bugzilla.mozilla.org/show_bug.cgi?id=1814123#c2


## Usage

1. Log into the Instagram account by opening http://www.instagram.com
2. Click on the extension button
3. Choose the user you would like to track. By default the extension tracks the logged in user
4. Press Refresh button


## Development

### Preparing environment
Install node.js and run to install all the required libraries and scripts.
```bash
npm install
```

### Building
```bash
npm run build
```
Builds the extension into the `dist/` directory.

## Distribution

### Packaging and signing
```bash
npm run package
```
Builds and creates a packaged `.xpi` file in the `web-ext-artifacts/` directory. See
https://github.com/TomasHubelbauer/firefox-permanent-unsigned-extension?tab=readme-ov-file#update-signing-the-extension-without-publishing-it-on-amo

**Note:** Signing requires AMO API credentials. Set them as environment variables:
```bash
export WEB_EXT_API_KEY="your-jwt-issuer"
export WEB_EXT_API_SECRET="your-jwt-secret"
```
Or create a `.web-ext-config.js` file in the project root.

### Cleaning artifacts
```bash
rm -rf dist/ web-ext-artifacts/ *.xpi
```
Removes the artifacts.

## License
MIT: https://opensource.org/license/mit
