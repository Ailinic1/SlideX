# SlideX

A presentation editor. Make a deck by dragging things onto a slide, present it
from the same program, and hand out a PDF that is exactly what was on the
screen.

A slide's number is never stored anywhere. Move a slide and every number
follows it in the same instant: the sorter, the number in the corner, the
agenda, "see slide 7" somewhere in the middle of slide 3, the presenter view
and the PDF. There is nothing to renumber, because there was never a second
copy of the number to go wrong.

Everything runs on your own computer, and nothing reaches the internet: the
fonts, the icons, the charts and the PDF writer are all part of the program. It
works the same on a plane as in the office. Sharing happens through a folder
you already sync - SharePoint, OneDrive, Dropbox - the way it does in
[Newsx](https://github.com/Ailinic1/Newsx), whose look, layout, generation
engine and push-and-pull this shares.

There is no AI in it anywhere, and a test fails if anybody puts one in.

---

## Running it

You need [Node.js](https://nodejs.org) 18 or newer. Nothing else - SlideX has
no dependencies to install.

| Platform | Start it with |
| --- | --- |
| Windows | double-click `SlideX.bat` |
| macOS / Linux | `./SlideX.sh` |
| Any | `npm start` |

SlideX opens in a window of its own -
[pywebview](https://pywebview.flowrey.dev), drawn by the web engine your system
already has. The first time, `SlideX.sh` and `SlideX.bat` set that up
themselves - a `.venv` beside the program with pywebview in it
(`requirements.txt`) - which needs an internet connection once. If that cannot
be done they open SlideX in your browser instead and say why;
`./SlideX.sh --setup` tries again, and `--browser` asks for the browser on
purpose.

On Linux the window's engine comes from the system rather than from pip:
`sudo apt install python3-gi gir1.2-webkit2-4.1` if it is not there already.
`python3 slidex.py --check` says whether the window can open. Leave the
terminal open while you work; closing it stops the program.

How to build the installers is in [BUILDING.md](BUILDING.md), and what changed
between versions is in [CHANGELOG.md](CHANGELOG.md).

Your decks live in `~/SlideX` (`C:\Users\<you>\SlideX` on Windows). Set
`SLIDEX_HOME` to keep them somewhere else, and `SLIDEX_PORT` to use a port
other than 7431.

---

## Numbers that cannot be wrong

Every presentation program has to answer the same question: what number is this
slide? Most of them answer it by writing a number down and then trying to
remember every place it was written.

SlideX does not write it down. A deck is an ordered list of slides, and a
number is worked out from that list at the moment anything is drawn. Which
means:

- Drag a slide up two places in the sorter, and the sorter, the corner of every
  slide, the agenda and the status bar all say the new numbers before you let
  go of the mouse.
- Delete slide 4 and slide 5 becomes slide 4 - on the slide itself, in the
  agenda, and in the sentence on slide 2 that says *the detail is on slide 5*.
- Undo it and every one of those goes back.
- The same is true of cut and paste, duplicate, moving a slide between
  sections, and changing which slides are hidden.

A cross-reference remembers **which slide** it points at, not what number that
slide happened to have. So a reorder can never make it point somewhere else,
and deleting the slide it names is caught by **Check** rather than silently
becoming a reference to whatever moved into that position.

Hidden slides get a choice, made once for the whole deck: skip them in the
numbering, so the audience sees 1, 2, 3 with no gaps, or keep them in it, for a
deck whose hidden slides are backup material people still cite by number.

---

## Making a deck

**New deck** on the start page. Name it, choose widescreen or 4:3, start from a
set of layouts and pick a palette. Or press **Generate a style** and let the
program draw one.

### Generating a style

Not sure what the deck should look like? **Generate a style** draws a complete
set of layouts - a title slide, a section divider, title and content, two
column, a big number, a quote, a full-bleed picture, a chart, a comparison, an
agenda and a closing slide - and **Generate another** (or <kbd>G</kbd>) draws a
different one, as many times as you like; **Previous** goes back to one you
passed. Leave the colours to each style, or hold a palette while you try them -
and light, dark, or whichever the seed feels like.

There is no AI in it. Each style is built by rules from a seed: a twelve-column
grid, a fixed scale of type sizes, text boxes measured for their words, and
designed arrangements composed so nothing touches the margins. The seed picks
the character - the palette, whether the deck is light or dark, the typefaces,
how loudly it speaks, whether the big slides are set from the left or down the
middle, which kind of title slide, which arrangement each content slide uses,
which colour a divider gives a whole slide to, tinted or outlined panels,
square or rounded corners, how icons are badged, which generated graphic
decorates it, and which slides the deck opens with. The same seed always makes
the same deck, down to the last dot of the last graphic, and the tests generate
two hundred of them - light and dark, on both slide shapes - and check that
nothing overflows, leaves the slide, collides, or is hard to read against what
is behind it.

**Dark decks** are not light decks with the colours inverted. A dark palette is
the same palette - the same name, the same nine roles - on a deep ground that
keeps its hue, so a dark Meadow is not a dark Cardinal; the text becomes
near-white, the tints and lines become lighter than what they sit on rather
than darker, and each brand colour is lifted until it carries small text on the
ground. Because nothing changes but the nine roles, every chart, graphic and
element follows without being touched. Roughly three styles in ten come back
dark; **Dark** on the generate screen asks for them and nothing else. A deck
that already exists can be turned dark, and back, from **Colours**.

A light deck gets dark slides too: the colour a deck gives a whole slide to -
its title, its dividers, its closing - is sometimes the ink rather than the
primary, which is what makes a light deck's section slides black.

A deck that already exists can try layouts too: **Generate a layout for this
slide** shows six at a time in the deck's own colours, with **Six more** after
that. What the slide has written moves to the element of the same name, so a
title stays a title.

A whole new style for a deck that already has slides in it tells you first how
much moves and how much has nowhere to go, and one <kbd>Ctrl</kbd>+<kbd>Z</kbd>
puts the old one back.

### The editor

The slides are down the left, the slide in the middle, and on the right the
inspector for whatever is selected.

- **The sorter** drags to reorder, multi-selects with <kbd>Shift</kbd> and
  <kbd>Ctrl</kbd>, and folds sections away. Numbers keep counting across
  sections: a section is a fold, not a restart.
- **Add things** from the Insert tab: titles, headings, body text, bullets,
  quotes; pictures, icons, charts, tables, code, big numbers, shapes, lines and
  arrows, generated graphics; and the fields that fill themselves in - the
  slide number, the date, the footer, a reference to another slide, an agenda.
  Click a button to put it in the middle, or drag it where it should go.
- **Move and resize** by dragging. Guides appear when an edge or a centre lines
  up with another element or with the slide's middle, and a pair of bars
  appears when the gap on one side matches the gap on the other. Hold
  <kbd>Alt</kbd> to place freely, <kbd>Shift</kbd> to keep a move to one axis
  or a resize to its proportions. Arrow keys nudge by a point, with
  <kbd>Shift</kbd> by ten. <kbd>Alt</kbd>-click reaches the element underneath
  the one on top.
- **Type in place** by double-clicking, or in the inspector. <kbd>Tab</kbd>
  inside a text box indents a bullet rather than leaving the box.
- **Colours are roles** - primary, secondary, accent, highlight, text, quiet
  text, lines, tint, paper - so choosing another palette recolours every slide,
  chart and graphic at once, and the light/dark switch beside them recolours
  the deck without touching a single element. A colour of its own is there for
  the logo that has to be exactly itself.
- **Everything is undoable**, without a limit, and everything saves itself as
  you work.

### Layouts

A deck's slides share layouts, the way a document's paragraphs share styles.
Change a layout and every slide using it changes - unless that slide has
deliberately changed the same thing, in which case it keeps what it said.
**Back to layout** on any element forgets the difference. Deleting an element
that comes from the layout hides it on this slide only, and says so.

### Words

A text box holds plain words with a little markup, the kind anybody can type
without a toolbar:

| Type | To get |
| --- | --- |
| one line | one paragraph |
| `# Heading` / `## Smaller` | a heading inside the box |
| `- item` | a bullet; two spaces in for the next level down, three levels deep |
| `1. item` | a numbered item; indented ones count a. b. c. and then i. ii. iii. |
| `> words` | a quote, with a bar in the accent colour |
| `**bold**` / `*italic*` | bold / italic |

**Insert a field** puts in something that fills itself in: `{n}`, `{total}`,
`{title}`, `{section}`, `{deck}`, `{date}`, `{footer}`, and `{ref:...}` for
another slide's number. **Shrink to fit** makes the type smaller when the words
would not otherwise fit - never below half size, and never by splitting a word
across lines. A box whose words do not fit shows a red mark with how many are
cut off.

### Graphics

**Charts** come in fourteen kinds - columns, bars, stacked columns, line, area,
pie, donut, progress against targets, rings, a waffle of 100, a pictogram of
icons, big numbers, a timeline and a table - all drawn in the deck's palette.
Type the numbers into the small spreadsheet in the inspector, or paste a block
copied from Excel, Google Sheets or a CSV over it.

**Icons** are one set of more than a hundred line drawings on the same
24-point grid, stroke weight and round ends as the program's own buttons, so
every icon on a slide matches every other. Search them by what they mean
(*risk*, *growth*, *deadline*), and put one on a circle, square or ring badge.

**Generated graphics** - twenty-six of them, grouped by the mood they have:
lines and fields (networks, waves, contours, orbits, flow lines, topography,
rays, spirals), grids and tiles (mosaic, hexagons, grid, isometric, weave,
lattice, circuit), dots (halftone, confetti, starfield, bubbles, scatter) and
shapes (blobs, data bars, stripes, arcs, steps, shards). Each is drawn from a
seed in the palette's colours, and fades towards whatever it sits on, so a soft
tint on a dark slide is dark. **Shuffle** is nothing more than a new seed. The
seed is saved with the slide, so the picture is the same on reload, on a
colleague's computer and in the PDF.

---

## Presenting

**Present** starts the talk full screen. The slide is the same drawing the
editor makes, so nothing moves when you start - it only gets bigger.

| | |
| --- | --- |
| <kbd>→</kbd> <kbd>Space</kbd> <kbd>Page Down</kbd> | Next |
| <kbd>←</kbd> <kbd>Page Up</kbd> | Back |
| a number, then <kbd>Enter</kbd> | Go to that slide |
| <kbd>B</kbd> / <kbd>W</kbd> | Blank the screen black or white, so the room looks at you |
| <kbd>L</kbd> | Laser pointer |
| <kbd>Home</kbd> / <kbd>End</kbd> | The first slide, the last slide |
| <kbd>Esc</kbd> | Stop |

Clicking the right two-thirds of the screen goes forward and the left third
back, for a room where the keyboard is out of reach. Hidden slides are skipped.

**The presenter view** opens in a second window for the other screen: the slide
that is up, the one after it, this slide's notes, the time the talk has taken,
the time of day, and where you are in the deck. It can drive the talk from
there, and the two windows follow each other. If your window will not open a
second one, SlideX says so and gives you the address to open yourself.

Transitions are none, a fade, or a slide across - chosen for the deck, with a
different one for a slide that wants it. A machine asking for reduced motion
gets none of them, whatever the deck says.

---

## Before you send it

**Check** lists everything that will not look right, worst first, and clicking
an item takes you to it:

- words that do not fit, and how many are cut off
- a reference to a slide somebody has deleted
- a `{field}` that is not one
- text that cannot be read against what is behind it, at the ratio that size
  actually needs
- a picture too small to project sharply
- characters the PDF fonts do not have
- a chart with no numbers, or a negative share of a whole
- a slide nothing on it can name
- anything hanging off the edge

A deck with nothing wrong gets one line saying so.

**PDF** writes the deck: one slide to a page, at the size the slides are - a
16:9 deck makes a 16:9 PDF, not a sheet of paper with a slide in the middle of
it. Text is real text in the standard Helvetica, Times and Courier
(searchable, selectable, readable aloud), charts, icons and graphics are
vector, and pictures are embedded once however often they appear. Three other
layouts print on paper: **notes**, with what you were going to say under each
slide, and **handouts** two, three or six to a page, with ruled lines beside
the three.

**PNG** saves this slide, or every slide, at screen, Full HD or 4K.

---

## Push, share, pull

**Push** and **Pull** are on the Share tab, as they are in Newsx.

| Step | What happens |
| --- | --- |
| **Push** (<kbd>Ctrl</kbd>+<kbd>S</kbd>) | Freezes the deck as a version, **and copies a `.sxbundle` and a PDF into your shared folder**. |
| *(the folder syncs)* | SharePoint, OneDrive or Dropbox does the rest. |
| **Pull** | Lists your colleagues' bundles in the shared folder, and shows what each would change before any of it is applied. |

The bundle is named by the moment it was shared and by whom -
`quarterly-review__20260918-134150__ben.sxbundle` - never by version number,
because two people pushing the same afternoon each have a version 4. The PDF is
there for the people who only want to read the deck.

The pull preview shows the slides that change, drawn as they will look after
the pull, and says in words what your colleague changed (*Title: rewritten*,
with the old words struck through and the new ones beside them) and what you
changed, which is kept. Two people who changed different things - different
slides, different words on different slides, one the palette and the other the
order - merge without a question. Only a property both of you changed is shown
side by side for you to choose.

**History** lists every version with who pushed it, when, and what changed. Any
version can be named, and **Go back to this version** returns the whole deck to
it. The history is only ever added to: going back never removes a version, and
becomes a new version the next time you push.

A colleague who does not have the deck yet uses **Open a shared deck** on the
start page with any of its bundles.

---

## Keyboard

| | |
| --- | --- |
| <kbd>Ctrl</kbd>+<kbd>K</kbd> | The command palette: every command by name, any slide by its title, any slide by its number |
| <kbd>Ctrl</kbd>+<kbd>M</kbd> | New slide |
| <kbd>Ctrl</kbd>+<kbd>S</kbd> | Push |
| <kbd>Ctrl</kbd>+<kbd>P</kbd> | Make a PDF |
| <kbd>F5</kbd> / <kbd>Shift</kbd>+<kbd>F5</kbd> | Present from the start / from this slide |
| <kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Y</kbd> | Undo / redo, without a limit |
| <kbd>Ctrl</kbd>+<kbd>C</kbd> / <kbd>X</kbd> / <kbd>V</kbd> | Copy, cut and paste - elements, or whole slides |
| <kbd>Ctrl</kbd>+<kbd>D</kbd> | Duplicate |
| <kbd>Delete</kbd> | Delete (an element from the layout is hidden on this slide) |
| <kbd>Enter</kbd> | Type in the selected text box |
| Arrows, <kbd>Shift</kbd>+arrows | Nudge by 1 or 10 points; with nothing selected, the previous and next slide |
| <kbd>Ctrl</kbd>+<kbd>]</kbd> / <kbd>[</kbd> | Bring to front / send to back |
| <kbd>Ctrl</kbd>+<kbd>A</kbd> | Select everything on the slide |
| <kbd>Ctrl</kbd>+<kbd>=</kbd> / <kbd>-</kbd> / <kbd>0</kbd> | Zoom in, out, fit (or <kbd>Ctrl</kbd>+wheel) |
| Right-click | The element's commands, or add something where you clicked |

Three themes, as in Newsx: dark (the default), light and high contrast. The
chrome is black, white and grey; the colour on screen is the deck's.

---

## Where your files are

```
~/SlideX/
  config.json                your name, shared folder, theme and grid
  decks/<deck>/
    deck.json                its name and version number
    working.json             the deck as it is now
    assets.json, assets/     pictures, named by their contents
    versions/                every push, as the whole deck
    history.json             how the versions relate to each other
    out/                     the PDFs
  trash/                     deleted decks, which can be put back
```

Copying a deck's folder to another computer carries everything with it. So does
a `.sxbundle`, which is the same thing in one file.

### What a deck file is

Plain JSON, versioned, with a stable id for every slide and every element. The
order of the deck is the order of the `slides` array, and that is the only
place order lives:

```json
{ "format": 1, "kind": "slidex-deck", "title": "Quarterly review",
  "aspect": "wide", "size": { "width": 960, "height": 540 },
  "palette": { "name": "Harbor", "primary": "#16324f", "…": "…" },
  "fonts":   { "heading": "sans", "body": "sans", "mono": "mono" },
  "options": { "numberHidden": "skip", "startNumber": 1,
               "transition": "fade", "footer": "" },
  "layouts":  [ { "id": "ly…", "name": "Title and content",
                  "kind": "titleContent", "elements": [ … ] } ],
  "sections": [ { "id": "sc…", "title": "Where we are" } ],
  "slides":   [ { "id": "sl…", "layout": "ly…", "sectionId": "sc…",
                  "hidden": false, "notes": "",
                  "overrides": { "<elementId>": { "content": { … } } },
                  "extras": [ … ] } ] }
```

No slide has a number in it. A slide records only what differs from its layout,
which is what makes changing a layout reach every slide that has not said
otherwise. A cross-reference holds `content.target`, the target slide's id.

Nothing in the format stands in the way of reading or writing PowerPoint later:
layouts are slide masters, overrides are placeholder content, and the ordered
list of slides is the same idea `p:sldIdLst` is. PPTX import and export are not
in this version.

---

## How it keeps the screen, the projector and the PDF the same

The slide on screen and the PDF are drawn by the same code (`web/shared/`),
which the browser and the server both run. It lays out every word with one
table of character widths - the standard PDF fonts', which Liberation Sans,
Serif and Mono (and Arial, Times New Roman and Courier New) share - and places
each line itself, so the browser never decides where a line breaks. The result
is a list of drawing operations; `svg.js` writes it as SVG for the screen and
the projector, `src/lib/pdf.js` writes the same list as a PDF, and
`canvas2d.js` draws it onto a canvas for a PNG.

One honest limit follows from using the fonts every PDF reader has: they cover
Western European characters. Anything else - Greek, CJK, most mathematical
symbols - prints as a question mark, a few common ones are replaced with an
honest stand-in (`≤` becomes `<=`), and Check says which characters are
affected before you send anything.

---

## There is no AI in it

Every "generation" here is a seeded random number generator and rules - the
same `mulberry32` Newsx uses. Nothing asks a model anything, and nothing can:
there is no network call in the program at all, and no dependency to hide one
in.

`npm run test:guard` walks the whole source tree and fails on a model API
hostname, an import of a model SDK, anything shaped like an API key, a chat or
completion call, any outbound request whose address is not this machine, any
address in the source that is not either 127.0.0.1 or a link in prose, and any
npm dependency at all.

---

## Tests

```bash
npm test             # the slide engine, numbering, the generator, the PDF, the guard, the API
npm run test:unit    # just the engine and the generator
npm run test:guard   # just the no-AI guard
npm run test:ui      # the real interface in headless Chrome
npm run test:window  # the pywebview window itself (needs pywebview and a display)
```

The API tests run two servers with two home folders and one shared folder, and
push, pull and conflict between them the way two computers would. The UI tests
drag, type and present with real mouse and keyboard events. They say *skip*
rather than fail when there is no Chrome.

## Licence

SlideX is released under the [MIT License](LICENSE).
