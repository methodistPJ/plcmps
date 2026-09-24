# Change the PLC PDF name font to Whisper

Replace only `PDF_Assets.gs` in the same Google Apps Script project as `Code.gs` and `PDF_Renderer.gs`.

1. Open your Apps Script project.
2. Open `PDF_Assets.gs`, select all existing content, and paste the complete contents of the replacement file in this folder.
3. Save, then choose **Deploy → Manage deployments → Edit → New version → Deploy** on the existing web-app deployment.
4. Edit and save a PLC report to regenerate its PDF with Whisper. Previously generated PDFs will not change until regenerated.

The renderer addresses the cursive font through its `script` font slot. This replacement swaps that slot to Whisper, so changing only a font name in `PDF_Renderer.gs` or adding a Google Fonts CSS link would not alter an embedded PDF font.

`PLC-Whisper-preview.pdf` shows the result with fictional data. `OFL.txt` is the license supplied with the official [Whisper font](https://github.com/google/fonts/tree/main/ofl/whisper). The font is embedded in `PDF_Assets.gs`; it does not require installation on the teachers' computers.

The sample was rendered locally with the same PDF engine and checked visually. A live Apps Script save still needs verification after deployment.
