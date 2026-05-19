# AnchorWrite

AnchorWrite is a lightweight browser-based tool that makes handwritten, scanned, or visually complex PDFs searchable without changing how the document looks.

Instead of relying entirely on OCR, AnchorWrite allows you to manually assign semantic tags to pages or regions of a PDF. These tags are then embedded invisibly into the exported PDF along with a generated glossary page.

The result is a PDF that:
- still looks identical to the original
- can be searched using normal Ctrl+F
- remains portable and self-contained
- works offline and entirely in the browser

No accounts, uploads, or cloud processing are required for normal use.

---

# About AnchorWrite

AnchorWrite was built around a simple idea:

> Human semantic tagging is often more reliable than automated OCR for handwritten notes, diagrams, research papers, and scanned material.

The app lets you:
- upload a PDF
- draw regions over meaningful parts of the document
- assign tags to those regions or pages
- export a searchable PDF with an automatically generated glossary/index

AnchorWrite is especially useful for:
- handwritten notes
- research papers
- study material
- scanned archives
- diagrams and figures
- annotated PDFs

The generated glossary page acts like a semantic table of contents for the document.

---

# How to Use AnchorWrite

1. Upload a PDF into the application.

2. Navigate through pages and zoom/pan as needed.

3. Draw boxes over meaningful regions in the document.

4. Add tags to:
   - specific regions
   - entire pages

5. Export the PDF.

AnchorWrite will generate:
- an indexed glossary page
- invisible searchable semantic anchors
- clickable references (where supported)

The visual appearance of the original PDF remains unchanged.

You can then:
- search the PDF using Ctrl+F
- quickly jump between concepts
- navigate tagged regions more easily

---

# Hosting AnchorWrite Locally

Technically, there is not much need to self-host AnchorWrite because the application is almost entirely client-side and runs directly in the browser.

However, if you want to run it locally:

```bash
npm install
npm run dev
```

Then open the local development URL shown in the terminal.

To build a production version:

```bash
npm run build
```

---

# Disclaimer

The website/UI for AnchorWrite was developed using Lovable.

This decision was intentional:
- the application is mostly client-side
- the functionality is relatively self-contained
- and the author is not deeply fluent in JavaScript frontend development

Using Lovable allowed the project to move from idea to working prototype much more quickly while keeping focus on the actual product concept and PDF processing workflow rather than frontend boilerplate.
