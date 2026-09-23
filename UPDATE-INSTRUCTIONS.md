# PLC save fix, teacher search and PDF names

## GitHub

Replace `app.js` and `audit.css` in your PLC repository. Keep your current `index.html`, `style.css` and `assets` folder. After Pages updates, hard-refresh the website (Ctrl+Shift+R).

## Apps Script — essential for the PDF fix

Replace the entire contents of `Code.gs` with the supplied file, then save. Update the EXISTING web-app deployment: Deploy → Manage deployments → select the deployed web app → Edit (pencil) → Version: New version → Deploy. Updating the existing deployment keeps the GAS URL already configured in your frontend. Saving code alone does not update a versioned deployment.

Backend version: `2026-09-23-plc-fix-2`. The `getMasterData` response includes this version so deployment can be identified.

The attached source already used explicit paragraph strings, while the screenshot showed the earlier empty-argument error. This suggests that an older deployed version may still be active. The replacement wraps every PDF paragraph call in a string-normalizing helper and distinguishes a confirmed failure before any Sheet write from an uncertain write outcome. Network interruptions still require an archive check before retrying.

## Teacher selection

All group-member, prepared-by and verified-by selectors now accept typing and show up to eight matching names. Click a suggestion or use Arrow keys and Enter. Typed text alone is not accepted as a staff selection. Editing the typed name clears the previous ID, preventing accidental submission under the wrong teacher.

## Cursive PDF names

The prepared-by and verified-by blocks use short names in the Allura cursive font at 24 pt, without the blank signing gap or table borders. Roles remain underneath; full names remain in the member table. An unselected verifier displays “Belum ditetapkan”.

Optional: add a `Nama_Pendek` column to `Staff_Master` and enter each teacher's preferred short name. If blank, the script uses the first two words before bin/binti/a/l/a/p. Populate this column where that automatic abbreviation is unsuitable. These are styled name labels, not captured handwritten signatures.

## Checks completed

JavaScript syntax and existing API contract tests pass. A strict local Google Docs mock runs every PDF builder, checks paragraph string arguments, short-name font settings, optional verifier handling, and pre-write versus ambiguous-write failures. Browser checks with isolated test data pass for edit hydration, filtered suggestions, keyboard selection and save flow. No test reports were written to the school backend.

Live Google Docs PDF rendering and font appearance remain to be checked after redeployment. For an existing report, use Edit and save to regenerate its PDF with the new styling.

References: [Google Apps Script deployments](https://developers.google.com/apps-script/concepts/deployments), [Body.appendParagraph](https://developers.google.com/apps-script/reference/document/body#appendParagraph(String)), [Text font formatting](https://developers.google.com/apps-script/reference/document/text#setFontFamily(String)).
