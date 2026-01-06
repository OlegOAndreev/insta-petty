# Brief instructions for code agents

## General
* This is a webextension for tracking follower count and followed/unfollowed history on Instagram
* General information about this project is in README.md
* The code is written in TypeScript with minimal dependencies, pure CSS and HTML, bundled using esbuild

## Code location
* TypeScript files are located in src/
* HTML and CSS Files are located in public/
* Build results are located in public/

## Project rules
* Do not embed HTML or CSS in typescript files
* Do absolutely minimal changes to other CSS rules if you do any CSS modification
* When adding new CSS rules, prefer adding id-based rules instead of class-based rules
* Add class-based CSS rules only if you see duplication in rules

## Build & testing commands
* Install JavaScript/TypeScript libraries with `npm install`, do not run any other commands
* When changing TypeScript or html/css files, run `npm run build:ts`, do not run any other commands
* Run `npm run build` to check the final result in dist/
* Do not attempt opening browser for UI testing, always request the user to test the UI
