// The icon set: one line-drawing vocabulary for the program and for the slide.
//
// Copied from Newsx (web/shared/glyphs.js), with the keywords extended for the
// things a deck talks about.
//
// One 24x24 grid, strokes only, 1.6 wide, round caps and joins. The ribbon
// draws them in the colour of the text beside them; a slide draws them in the
// deck's colours, alone or on a badge. Because they are one set, an icon
// dropped beside a heading is the same hand as the program's own buttons, and
// every icon on a slide matches every other.
//
// Plain path data, no DOM: the PDF writer draws from these too.

const r2 = (v) => Math.round(v * 1000) / 1000;
/** A circle, as path data. */
const c = (cx, cy, r) => 'M' + r2(cx - r) + ' ' + cy + 'a' + r + ' ' + r + ' 0 1 0 ' + r2(2 * r) + ' 0a' + r + ' ' + r + ' 0 1 0 ' + r2(-2 * r) + ' 0';

/** Icons the page can use, grouped the way the picker shows them. */
export const CONTENT_ICONS = {
  Science: {
    microscope: 'M8.5 3h5M9.5 3v8.5h3V3M10 11.5v2.5h2v-2.5M7 16.5h6.5M13.5 6.5a6.5 6.5 0 0 1 1.5 11.5M11 18.5V21M5.5 21h13',
    flask: 'M9 3h6M10 3v6.2L4.8 18.1A2 2 0 0 0 6.5 21h11a2 2 0 0 0 1.7-2.9L14 9.2V3M7.2 14h9.6',
    beaker: 'M5 3h13M6.5 3v16a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2V3M6.5 13h11M10 7.5h3.5',
    testTube: 'M14.5 3.5l6 6M16 5 6.2 14.8a3.5 3.5 0 0 0 5 5L21 10M9 12h7',
    petri: 'M3 11a9 4 0 1 0 18 0 9 4 0 1 0-18 0M3 11v2.5c0 2.2 4 4 9 4s9-1.8 9-4V11M9 10.5h.01M13 11.8h.01M15 9.8h.01',
    dna: 'M7 3c0 5 10 4.5 10 9s-10 4-10 9M17 3c0 5-10 4.5-10 9s10 4 10 9M8.5 6h7M8 12h8M8.5 18h7',
    atom: c(12, 12, 1.2) + 'M2.5 12a9.5 3.8 0 1 0 19 0 9.5 3.8 0 1 0-19 0M16.75 20.23A9.5 3.8 60 0 1 7.25 3.77 9.5 3.8 60 0 1 16.75 20.23M16.75 3.77A9.5 3.8-60 0 1 7.25 20.23 9.5 3.8-60 0 1 16.75 3.77',
    molecule: c(12, 12, 2.2) + c(12, 4, 1.8) + c(5, 18, 1.8) + c(19, 18, 1.8) + 'M12 5.8v4M10.2 13.4l-3.8 3.4M13.8 13.4l3.8 3.4',
    telescope: 'M3.5 12.5l11-5.5 2.2 4.4-11 5.5zM14.5 7l4.6-2.3 2.2 4.4-4.6 2.3M10.5 14.5 7.5 21M11.5 14l3.5 7',
    magnet: 'M5 3h4v8a3 3 0 0 0 6 0V3h4v8a7 7 0 0 1-14 0zM5 7h4M15 7h4',
    thermometer: 'M10 13.5V5a2 2 0 0 1 4 0v8.5a4 4 0 1 1-4 0zM12 9v7.5',
    drop: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z',
    leaf: 'M5 19C5 10 10 4 20 4c0 10-6 15-15 15zM5 19l8-8',
    bolt: 'M13 2 4 14h7l-1 8 9-12h-7z',
    globe: c(12, 12, 9) + 'M3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z',
  },
  Health: {
    heartPulse: 'M12 20s-7.5-4.6-8.8-9.3A4.6 4.6 0 0 1 12 6.6a4.6 4.6 0 0 1 8.8 4.1C19.5 15.4 12 20 12 20zM6.5 12h3l1.3-2.3 2 4.6 1.3-2.3h3.4',
    heart: 'M12 20s-7.5-4.6-8.8-9.3A4.6 4.6 0 0 1 12 6.6a4.6 4.6 0 0 1 8.8 4.1C19.5 15.4 12 20 12 20z',
    brain: 'M12 5a3 3 0 0 0-5.6 1.4A3 3 0 0 0 4 10a3 3 0 0 0 .7 4.6A3.2 3.2 0 0 0 8 19.5a3 3 0 0 0 4 .5M12 5a3 3 0 0 1 5.6 1.4A3 3 0 0 1 20 10a3 3 0 0 1-.7 4.6 3.2 3.2 0 0 1-3.3 4.9 3 3 0 0 1-4 .5M12 5v15M8.5 10.5c1 0 2 .7 2 2M15.5 10.5c-1 0-2 .7-2 2',
    stethoscope: 'M6 3.5H5v5.5a4.5 4.5 0 0 0 9 0V3.5h-1M9.5 13.5v1.5a5 5 0 0 0 10 0v-2' + c(19.5, 11, 2),
    pill: 'M10.5 20.5l10-10a4.95 4.95 0 0 0-7-7l-10 10a4.95 4.95 0 0 0 7 7zM8.5 8.5l7 7',
    syringe: 'M18 3l3 3M19.5 4.5 16 8M12.5 5.5l6 6M17 10l-8.5 8.5H5.5v-3L14 7M5.5 18.5 3 21M9 11l2 2M11.5 8.5l2 2',
    virus: c(12, 12, 5) + 'M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.9 2.9M15.5 15.5l2.9 2.9M18.4 5.6l-2.9 2.9M8.5 15.5l-2.9 2.9M10.5 10.5h.01M13.5 13h.01',
    hospital: 'M4 21V7h16v14M2 21h20M12 10v5M9.5 12.5h5M9.5 21v-3h5v3M8 7V3.5h8V7',
    bandage: 'M4.2 14.8l10.6-10.6a3 3 0 0 1 4.2 0l.8.8a3 3 0 0 1 0 4.2L9.2 19.8a3 3 0 0 1-4.2 0l-.8-.8a3 3 0 0 1 0-4.2zM10 10h.01M14 14h.01M12 12h.01',
    eye: 'M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z' + c(12, 12, 3),
    shieldCheck: 'M12 3l7 3v6c0 4.2-3 7.4-7 9-4-1.6-7-4.8-7-9V6zM9 12l2 2 4-4',
  },
  Data: {
    chartBar: 'M4 20h16M7 16v-5M12 16V6M17 16V9',
    chartLine: 'M4 4v16h16M7.5 15l4-4 3 3 5-6',
    chartPie: 'M11 4a8 8 0 1 0 9 9h-9zM14 3.2A8 8 0 0 1 20.8 10H14z',
    trendUp: 'M3 17l6-6 4 4 8-8M15 7h6v6',
    trendDown: 'M3 7l6 6 4-4 8 8M15 17h6v-6',
    target: c(12, 12, 9) + c(12, 12, 5) + c(12, 12, 1),
    database: 'M4 6a8 3 0 1 0 16 0 8 3 0 1 0-16 0M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
    code: 'M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16',
    cpu: 'M7 7h10v10H7zM10 10h4v4h-4zM10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4',
    network: c(6, 12, 2.2) + c(18, 6, 2.2) + c(18, 18, 2.2) + 'M8 11l8-4M8 13l8 4',
    laptop: 'M5 5h14v10H5zM2.5 19h19M5 15l-2.5 4M19 15l2.5 4',
    search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM16.2 16.2 21 21',
    hourglass: 'M6 3h12M6 21h12M7 3c0 5 10 5.5 10 9s-10 4-10 9M17 3c0 5-10 5.5-10 9s10 4 10 9',
    calculator: 'M6 3h12v18H6zM9 6.5h6v3H9zM9 13h.01M12 13h.01M15 13h.01M9 17h.01M12 17h.01M15 17h.01',
  },
  People: {
    user: c(12, 8, 4) + 'M4 21a8 8 0 0 1 16 0',
    users: 'M8.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM3 20a5.5 5.5 0 0 1 11 0M16 4.7a3.5 3.5 0 0 1 0 6.6M17 20h4a5.5 5.5 0 0 0-4-5.3',
    graduationCap: 'M2 9l10-5 10 5-10 5zM6 11v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5M22 9v6',
    presentation: 'M3 4h18M4.5 4v11h15V4M12 15v3M8 21l4-3 4 3M8 11.5l3-3 2 2 3-3',
    mic: 'M9 5a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0zM5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6',
    message: 'M4 5h16v11H9l-5 4z',
    messages: 'M3 4h12v8H7l-4 3zM9 14h9l3 3v-7a1 1 0 0 0-1-1h-3',
    megaphone: 'M3 10v4h3l8 5V5L6 10zM6 14l1.5 6H10l-1-5.4M17.5 9a4 4 0 0 1 0 6M20 6.5a8 8 0 0 1 0 11',
    mail: 'M3 5h18v14H3zM3 6l9 7 9-7',
    bell: 'M6 10a6 6 0 0 1 12 0c0 5 2 7 2 7H4s2-2 2-7zM10 20a2 2 0 0 0 4 0',
    home: 'M3 11l9-7 9 7M5 9.5V21h14V9.5M10 21v-6h4v6',
    building: 'M3 21h18M4 10h16M12 3l8.5 4.5h-17zM6.5 10v8M10.5 10v8M13.5 10v8M17.5 10v8M4 18h16',
  },
  Recognition: {
    award: c(12, 9, 6) + 'M8.5 13.8 7 22l5-3 5 3-1.5-8.2',
    trophy: 'M8 3h8v6a4 4 0 0 1-8 0zM8 5H4.5v1A3.5 3.5 0 0 0 8 9.5M16 5h3.5v1A3.5 3.5 0 0 1 16 9.5M12 13v4M8 21h8M9 21v-1.5a1.5 1.5 0 0 1 1.5-1.5h3a1.5 1.5 0 0 1 1.5 1.5V21',
    star: 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z',
    sparkles: 'M11 3l1.8 5.2L18 10l-5.2 1.8L11 17l-1.8-5.2L4 10l5.2-1.8zM18.5 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z',
    rocket: 'M12 15l-3-3c1.5-5 5-8.5 11-9-.5 6-4 9.5-8 12zM9 12H5.5l2.3-3.2c1-.8 2.5-1 4.2-.6M12 15v3.5l3.2-2.3c.8-1 1-2.5.6-4.2M6.5 17c-1.5 1-2 3.5-2 3.5s2.5-.5 3.5-2' + c(15.2, 8.8, 1.4),
    lightbulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z',
    flag: 'M6 3v18M6 4h12l-2.5 4L18 12H6',
    checkCircle: c(12, 12, 9) + 'M8 12.5l2.5 2.5 5.5-5.5',
    thumbsUp: 'M7 10v11H3V10zM7 10l4-7a2.5 2.5 0 0 1 2.5 2.5V9h5.2a2 2 0 0 1 2 2.3l-1.3 8A2 2 0 0 1 17.4 21H7',
    collaboration: c(9, 12, 6) + c(15, 12, 6),
  },
  Work: {
    calendar: 'M5 5h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM4 10h16M8 3v4M16 3v4',
    clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3.5 2',
    fileText: 'M6 3h8l5 5v13H6zM14 3v5h5M9 13h7M9 17h7M9 9h2',
    book: 'M5 4h13v15H6.5A1.5 1.5 0 0 0 5 20.5zM5 20.5A1.5 1.5 0 0 1 6.5 19H18v2H6.5A1.5 1.5 0 0 1 5 20.5z',
    bookOpen: 'M12 6.5C10.5 5 8 4.5 3 4.5v14c5 0 7.5.5 9 2 1.5-1.5 4-2 9-2v-14c-5 0-7.5.5-9 2zM12 6.5v14',
    newspaper: 'M4 5h13v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM17 9h3v10a2 2 0 0 1-2 2M7 9h7M7 13h7M7 17h4',
    clipboard: 'M9 4h6v3H9zM9 5.5H7a2 2 0 0 0-2 2V19a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7.5a2 2 0 0 0-2-2h-2',
    clipboardCheck: 'M9 4h6v3H9zM9 5.5H7a2 2 0 0 0-2 2V19a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7.5a2 2 0 0 0-2-2h-2M9 14l2 2 4-4',
    dollar: 'M12 2.5v19M16.5 6.5C15.6 5.2 14 4.5 12 4.5c-2.6 0-4.3 1.3-4.3 3.2 0 4.6 9 2.5 9 7.6 0 2-1.9 3.4-4.7 3.4-2.3 0-4-.8-4.9-2.2',
    briefcase: 'M3 8h18v12H3zM8 8V5h8v3M3 13h18M11 13v2h2v-2',
    mapPin: 'M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z' + c(12, 9, 2.5),
    compass: c(12, 12, 9) + 'M15.5 8.5l-2 5-5 2 2-5z',
    camera: 'M3 8a2 2 0 0 1 2-2h2.5L9 4h6l1.5 2H19a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' + c(12, 13, 3.5),
    link: 'M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1',
    quote: 'M10 6H5a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1h4v1a3 3 0 0 1-3 3M20 6h-5a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1h4v1a3 3 0 0 1-3 3',
    scale: 'M12 3v18M7 21h10M4 7h16M4 7l-2.5 6a2.5 2.5 0 0 0 5 0zM20 7l-2.5 6a2.5 2.5 0 0 0 5 0z',
    puzzle: 'M4 8h4a2 2 0 1 1 4 0h4v4a2 2 0 1 1 0 4v4h-4a2 2 0 1 0-4 0H4v-4a2 2 0 1 0 0-4z',
  },
};

/** The program's own buttons. */
const UI_ICONS = {
  // The ones a deck needs that a newsletter did not: presenting, the sorter,
  // and the fields that fill themselves in.
  slides: 'M3 5h14a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM21 7v10',
  slideAdd: 'M3 5h14a1 1 0 0 1 1 1v4M3 5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h7M17 14v6M14 17h6',
  layout: 'M3 5h18v14H3zM3 10h18M9 10v9',
  play: 'M8 5.5v13l11-6.5z',
  pause: 'M9 5v14M15 5v14',
  present: 'M3 4h18M4 4v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4M9.5 20l2.5-5 2.5 5',
  laser: 'M12 11.5h.01M4 12h3M17 12h3M12 4v3M12 17v3M6.5 6.5l2 2M15.5 15.5l2 2M17.5 6.5l-2 2M8.5 15.5l-2 2',
  blankScreen: 'M3 5h18v13H3zM7 9l10 6M17 9 7 15',
  notes: 'M5 3h10l4 4v14H5zM15 3v4h4M8 12h8M8 16h5',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3.5 2',
  timer: 'M9 2.5h6M12 5v4M12 9a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15zM17.8 8.2l1.8-1.8',
  hash: 'M9 3 7 21M17 3l-2 18M3.5 8.5h17M3 15.5h17',
  chevronDown: 'M6 10l6 6 6-6',
  chevronUp: 'M6 14l6-6 6 6',
  arrowLeft: 'M19 12H5m0 0 5-5m-5 5 5 5',
  arrowRight: 'M5 12h14m0 0-5-5m5 5-5 5',
  maximize: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  minimize: 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5',
  pointer: 'M6 3l12 9-5 1.4 2.6 5.5-2.7 1.3-2.6-5.5L6 18z',
  columns: 'M3 4h18v16H3zM12 4v16',
  bold: 'M7 4h6.5a4 4 0 0 1 0 8H7zM7 12h7.5a4 4 0 0 1 0 8H7z',
  italic: 'M10 4h8M6 20h8M14.5 4 9.5 20',
  bullets: 'M4 6h.01M4 12h.01M4 18h.01M9 6h11M9 12h11M9 18h11',
  indentIn: 'M4 6h16M9 12h11M9 18h11M4 10l3 2-3 2',
  indentOut: 'M4 6h16M9 12h11M9 18h11M7 10l-3 2 3 2',
  crop: 'M6 2v16h16M2 6h16v16',
  section: 'M3 5h18M3 12h12M3 19h18',
  agenda: 'M4 5h16v15H4zM4 9h16M8 13h9M8 17h6M8 3v4M16 3v4',
  reference: 'M9.5 14.5 14.5 9.5M8 11.5 6 13.5a3.5 3.5 0 0 0 5 5l2-2M16 12.5l2-2a3.5 3.5 0 0 0-5-5l-2 2',
  download: 'M12 3v12m0 0 4-4m-4 4-4-4M4 20h16',
  printer: 'M7 9V4h10v5M5 9h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2M7 14h10v7H7z',
  file: 'M6 3h8l5 5v13H6zM14 3v5h5',
  pdf: 'M6 3h8l5 5v13H6zM14 3v5h5M8.5 17v-4h1.5a1.2 1.2 0 0 1 0 2.4H8.5M12.5 13v4h1a2 2 0 0 0 0-4zM17.5 13h-1.8v4M15.7 15h1.5',
  package: 'M12 3l8 4v10l-8 4-8-4V7zM4 7l8 4 8-4M12 11v10',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  undo: 'M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  redo: 'm15 14 5-5-5-5M20 9H10a6 6 0 0 0 0 12h3',
  pencil: 'M4 20v-4L16 4l4 4L8 20zM14 6l4 4',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  trash: 'M4 7h16M10 4h4M6 7l1 14h10l1-14M10 11v7M14 11v7',
  close: 'M6 6l12 12M18 6 6 18',
  gear: 'M10.43 5.18L10.58 3.01A9.1 9.1 0 0 1 13.42 3.01L13.57 5.18A7 7 0 0 1 15.71 6.06L17.35 4.64A9.1 9.1 0 0 1 19.36 6.65L17.94 8.29A7 7 0 0 1 18.82 10.43L20.99 10.58A9.1 9.1 0 0 1 20.99 13.42L18.82 13.57A7 7 0 0 1 17.94 15.71L19.36 17.35A9.1 9.1 0 0 1 17.35 19.36L15.71 17.94A7 7 0 0 1 13.57 18.82L13.42 20.99A9.1 9.1 0 0 1 10.58 20.99L10.43 18.82A7 7 0 0 1 8.29 17.94L6.65 19.36A9.1 9.1 0 0 1 4.64 17.35L6.06 15.71A7 7 0 0 1 5.18 13.57L3.01 13.42A9.1 9.1 0 0 1 3.01 10.58L5.18 10.43A7 7 0 0 1 6.06 8.29L4.64 6.65A9.1 9.1 0 0 1 6.65 4.64L8.29 6.06A7 7 0 0 1 10.43 5.18ZM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  table: 'M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM3 10h18M3 15h18M9.5 5v14M15 5v14',
  braces: 'M9 4H8a2 2 0 0 0-2 2v3a2 2 0 0 1-2 2 2 2 0 0 1 2 2v3a2 2 0 0 0 2 2h1M15 4h1a2 2 0 0 1 2 2v3a2 2 0 0 0 2 2 2 2 0 0 0-2 2v3a2 2 0 0 1-2 2h-1',
  menu: 'M4 6h16M4 12h16M4 18h16',
  collapse: 'M6 14l6-6 6 6',
  expand: 'M6 10l6 6 6-6',
  chevronLeft: 'M14 6l-6 6 6 6',
  chevronRight: 'M10 6l6 6-6 6',
  replace: 'M4 8h13l-3-3M20 16H7l3 3',
  compare: 'M12 3v18M7 8l-4 4 4 4M17 8l4 4-4 4',
  checklist: 'M3 6l2 2 3-3M3 12l2 2 3-3M3 18l2 2 3-3M12 7h9M12 13h9M12 19h9',
  check: 'M5 13l4 4L19 7',
  refresh: 'M20 12a8 8 0 1 1-2.4-5.7M20 4v4h-4',
  suggest: 'M4 20v-4L14 6l4 4L8 20zM12 8l4 4M14 21h7',
  theme: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 3v18M12 7.6 16.4 12M12 12l4.4 4.4M12 16.4l2.2 2.2',
  arrowUp: 'M12 19V5m0 0-5 5m5-5 5 5',
  arrowDown: 'M12 5v14m0 0 5-5m-5 5-5-5',
  push: 'M12 20V8m0 0-4 4m4-4 4 4M4 4h16',
  upload: 'M12 16V4m0 0-4 4m4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3',
  pull: 'M12 4v12m0 0-4-4m4 4 4-4M4 20h16',
  exchange: 'M4 8h13l-3-3M20 16H7l3 3',
  text: 'M5 6V4h14v2M12 4v16M9 20h6',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 2.5-2.5L20 17' + c(15.5, 9, 1.5),
  shapes: 'M4 13h7v7H4z' + c(16.5, 7.5, 3.5) + 'M16.5 13l4 7h-8z',
  pattern: c(6, 6, 1.5) + c(12, 12, 1.5) + c(18, 6, 1.5) + c(6, 18, 1.5) + c(18, 18, 1.5) + 'M7.5 7.5l3 3M13.5 13.5l3 3M16.5 7.5l-3 3M10.5 13.5l-3 3',
  shuffle: 'M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5',
  dice: 'M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM8.5 8.5h.01M15.5 8.5h.01M12 12h.01M8.5 15.5h.01M15.5 15.5h.01',
  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5',
  grid: 'M4 4h16v16H4zM4 9.3h16M4 14.6h16M9.3 4v16M14.6 4v16',
  lock: 'M6 11h12v10H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  unlock: 'M6 11h12v10H6zM8.5 11V8a3.5 3.5 0 0 1 6.8-1.2',
  copy: 'M8 8h12v12H8zM16 8V4H4v12h4',
  eyeOff: 'M3 3l18 18M10.6 6.1A10 10 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-3 3.6M6.4 7.5C3.6 9.2 2 12 2 12s3.5 6 10 6a9.7 9.7 0 0 0 4.2-.9M9.9 9.9a3 3 0 0 0 4.2 4.2',
  zoomIn: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM16.2 16.2 21 21M11 8v6M8 11h6',
  zoomOut: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM16.2 16.2 21 21M8 11h6',
  palette: 'M12 3a9 9 0 1 0 0 18c1.2 0 2-.8 2-1.8 0-.5-.2-.9-.5-1.3-.3-.3-.5-.8-.5-1.3 0-1 .9-1.6 2-1.6H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3z' + c(7.5, 11.5, 1) + c(10, 7.5, 1) + c(14.5, 7.5, 1) + c(17, 11, 1),
  page: 'M6 3h12v18H6zM9 7h6M9 11h6M9 15h3',
  pages: 'M8 3h11v15H8zM5 6v15h11',
  bringFront: 'M8 8h12v12H8zM4 4h10v4M4 4v10h4',
  sendBack: 'M4 4h12v12H4zM20 8v12H8v-4',
  alignLeft: 'M4 3v18M8 7h12M8 12h8M8 17h10',
  alignCenter: 'M12 3v18M5 7h14M7 12h10M6 17h12',
  alignRight: 'M20 3v18M4 7h12M8 12h8M6 17h10',
  alignJustify: 'M4 6h16M4 10h16M4 14h16M4 18h16',
  alignTop: 'M3 4h18M7 8v12M12 8v8M17 8v10',
  alignMiddle: 'M3 12h18M7 6v12M12 8v8M17 7v10',
  alignBottom: 'M3 20h18M7 4v12M12 8v8M17 6v10',
  move: 'M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3',
  history: 'M3 12a9 9 0 1 0 2.6-6.4M3 4v5h5M12 7v5l3.5 2',
  users: CONTENT_ICONS.People.users,
  clock: CONTENT_ICONS.Work.clock,
  eye: CONTENT_ICONS.Health.eye,
  search: CONTENT_ICONS.Data.search,
  flag: CONTENT_ICONS.Recognition.flag,
  shieldCheck: CONTENT_ICONS.Health.shieldCheck,
  calendar: CONTENT_ICONS.Work.calendar,
  chartBar: CONTENT_ICONS.Data.chartBar,
  sparkles: CONTENT_ICONS.Recognition.sparkles,
  clipboard: CONTENT_ICONS.Work.clipboard,
  link: CONTENT_ICONS.Work.link,
  message: CONTENT_ICONS.People.message,
  messages: CONTENT_ICONS.People.messages,
  newspaper: CONTENT_ICONS.Work.newspaper,
  database: CONTENT_ICONS.Data.database,
  star: CONTENT_ICONS.Recognition.star,
};

/** Every drawing by name. */
export const GLYPHS = { ...UI_ICONS };
export const CONTENT_NAMES = [];
for (const group of Object.values(CONTENT_ICONS)) {
  for (const [name, d] of Object.entries(group)) {
    GLYPHS[name] = d;
    CONTENT_NAMES.push(name);
  }
}

export const hasGlyph = (name) => Object.prototype.hasOwnProperty.call(GLYPHS, name);

/** "heartPulse" -> "Heart pulse" */
export function glyphLabel(name) {
  const s = String(name || '').replace(/([A-Z])/g, ' $1').toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Words that should find an icon that is not called that. A deck's vocabulary
 * is added to the one Newsx searches with: somebody typing "risk", "deadline"
 * or "customer" should find a drawing without knowing its name.
 */
export const GLYPH_KEYWORDS = {
  microscope: 'lab pathology histology imaging', flask: 'chemistry lab experiment', beaker: 'chemistry lab',
  testTube: 'sample assay blood', petri: 'culture microbiology', dna: 'genetics genomics sequencing gene',
  atom: 'physics nuclear', molecule: 'chemistry compound drug', telescope: 'astronomy discovery',
  heartPulse: 'cardiology cardiac clinical vital', brain: 'neuroscience neurology cognition mental',
  stethoscope: 'clinic doctor physician clinical', pill: 'drug medication pharmacology', syringe: 'vaccine injection trial',
  virus: 'infection infectious covid pathogen', hospital: 'clinic care health system', chartBar: 'statistics data results',
  chartLine: 'trend growth data', chartPie: 'share proportion data', target: 'goal aim objective enrollment',
  database: 'data registry warehouse', code: 'software programming', cpu: 'computing ai machine learning',
  users: 'team people staff participants', user: 'person profile investigator', graduationCap: 'education student training trainee',
  presentation: 'talk conference seminar lecture', mic: 'talk podcast interview', megaphone: 'announcement news',
  award: 'prize honor recognition', trophy: 'win prize achievement', dollar: 'grant funding money budget award',
  fileText: 'paper publication manuscript article document', bookOpen: 'publication reading journal', lightbulb: 'idea innovation patent',
  calendar: 'event date schedule deadline', mapPin: 'location site place', rocket: 'launch start new', collaboration: 'partnership collaborators consortium joint',
  building: 'institution university department', newspaper: 'news press media', clipboardCheck: 'irb approval protocol compliance',
  scale: 'ethics law policy', globe: 'global international world', leaf: 'environment sustainability', drop: 'water blood fluid',
  // The words a deck is made of.
  chartBar: 'statistics data results revenue sales figures numbers',
  chartLine: 'trend growth data forecast revenue',
  chartPie: 'share proportion data split breakdown',
  target: 'goal aim objective kpi quota',
  users: 'team people staff customers audience headcount',
  user: 'person profile customer speaker',
  dollar: 'money budget cost price revenue funding',
  calendar: 'event date schedule deadline timeline quarter roadmap',
  rocket: 'launch start new release growth',
  lightbulb: 'idea innovation proposal insight',
  shieldCheck: 'risk security compliance safety trust',
  clipboardCheck: 'process checklist approval quality',
  building: 'company office organisation enterprise',
  globe: 'global international world market region',
  megaphone: 'announcement news marketing launch',
  presentation: 'talk meeting pitch deck training',
  mapPin: 'location site place market region',
  collaboration: 'partnership team joint alliance',
  scale: 'law policy governance balance tradeoff',
  bookOpen: 'guide documentation handbook story',
  search: 'research discovery find analysis',
  cpu: 'technology platform infrastructure computing',
  database: 'data warehouse storage records',
  code: 'software engineering product build',
  link: 'integration connection dependency',
  star: 'highlight favourite quality rating',
  trophy: 'win success achievement milestone',
  award: 'prize recognition milestone',
};

export function searchGlyphs(query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return CONTENT_NAMES.slice();
  return CONTENT_NAMES.filter((name) => (name.toLowerCase() + ' ' + glyphLabel(name).toLowerCase() + ' ' + (GLYPH_KEYWORDS[name] || '')).includes(q));
}
