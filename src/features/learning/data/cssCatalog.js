const createSlug = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/c\+\+/g, "c++")
    .replace(/[^a-z0-9+]+/g, "-")
    .replace(/^-+|-+$/g, "");

const buildCssPreviewDocument = ({
  title,
  styles,
  bodyMarkup,
  frameClass = "",
  extraBaseStyles = "",
}) => `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
      :root {
        color-scheme: light;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        padding: 24px;
        font-family: "Segoe UI", Arial, sans-serif;
        background:
          radial-gradient(circle at top left, rgba(96, 165, 250, 0.18), transparent 36%),
          linear-gradient(180deg, #f8fbff 0%, #eef4ff 100%);
        color: #0f172a;
      }

      .preview-shell {
        max-width: 720px;
        margin: 0 auto;
        padding: 20px;
        border-radius: 24px;
        border: 1px solid rgba(148, 163, 184, 0.2);
        background: rgba(255, 255, 255, 0.9);
        box-shadow: 0 18px 50px rgba(15, 23, 42, 0.08);
      }

      .preview-shell h1,
      .preview-shell h2,
      .preview-shell h3,
      .preview-shell p {
        margin-top: 0;
      }

      .preview-shell ${frameClass} {
        width: 100%;
      }

      ${extraBaseStyles}
      ${styles}
    </style>
  </head>
  <body>
    <div class="preview-shell">
      ${bodyMarkup}
    </div>
  </body>
</html>`;

const createExample = ({
  title,
  syntax,
  exampleCode,
  output,
  bodyMarkup,
  frameClass = "",
  extraBaseStyles = "",
}) => ({
  syntax,
  exampleHtml: bodyMarkup,
  exampleCode,
  output,
  previewHtml: buildCssPreviewDocument({
    title,
    styles: exampleCode,
    bodyMarkup,
    frameClass,
    extraBaseStyles,
  }),
});

const photoDataUri =
  "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='420' height='260' viewBox='0 0 420 260'%3E%3Crect width='420' height='260' fill='%23dbeafe'/%3E%3Ccircle cx='120' cy='95' r='42' fill='%2393c5fd'/%3E%3Ccircle cx='305' cy='72' r='28' fill='%23bfdbfe'/%3E%3Crect x='58' y='150' width='300' height='70' rx='18' fill='%233b82f6'/%3E%3Cpath d='M70 185l70-48 55 36 42-28 76 40' fill='none' stroke='%23eff6ff' stroke-width='18' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E";

export const CSS_COURSE_DEFINITION = Object.freeze({
  id: "css",
  title: "CSS",
  subtitle: "Style modern web pages step by step",
  accent: "from-sky-500 via-blue-500 to-indigo-600",
  badgeClass: "border-sky-200 bg-sky-50 text-sky-700",
  compilerLabel: "Open HTML Editor",
  compilerPath: "",
  toolLabel: "Open HTML Editor",
  toolPath: "/html-editor",
  heroSummary:
    "Learn colors, spacing, layouts, and responsive design with topic-by-topic CSS lessons, previews, quizzes, and progress tracking.",
});

export const CSS_TOPIC_GROUPS = Object.freeze({
  beginner: [
    "Introduction to CSS",
    "CSS Syntax",
    "CSS Selectors",
    "CSS Comments",
    "CSS Colors",
    "CSS Backgrounds",
    "CSS Borders",
    "CSS Margins",
    "CSS Padding",
    "CSS Height and Width",
    "CSS Box Model",
    "CSS Text",
    "CSS Fonts",
    "CSS Icons",
    "CSS Links",
    "CSS Lists",
    "CSS Tables",
    "CSS Display",
    "CSS Max Width",
    "CSS Position",
  ],
  intermediate: [
    "CSS Z-index",
    "CSS Overflow",
    "CSS Float",
    "CSS Inline-block",
    "CSS Align",
    "CSS Combinators",
    "CSS Pseudo-class",
    "CSS Pseudo-element",
    "CSS Opacity",
    "CSS Navigation Bar",
    "CSS Dropdowns",
    "CSS Image Gallery",
    "CSS Attribute Selectors",
    "CSS Forms",
    "CSS Counters",
    "CSS Website Layout",
    "CSS Units",
    "CSS Specificity",
  ],
  advanced: [
    "CSS Flexbox",
    "CSS Grid",
    "CSS Transforms",
    "CSS Transitions",
    "CSS Animations",
    "CSS Variables",
    "CSS Media Queries",
    "CSS Responsive Design",
    "CSS Shadows",
    "CSS Gradients",
    "CSS Object Fit",
    "CSS Clamp",
    "CSS Advanced Layout Practice",
  ],
});

export const CSS_TOPIC_TITLES = Object.freeze([
  ...CSS_TOPIC_GROUPS.beginner,
  ...CSS_TOPIC_GROUPS.intermediate,
  ...CSS_TOPIC_GROUPS.advanced,
]);

const CSS_TOPIC_LEVEL_BY_SLUG = Object.freeze(
  Object.entries(CSS_TOPIC_GROUPS).reduce((result, [level, titles]) => {
    titles.forEach((title) => {
      result[createSlug(title)] = level;
    });
    return result;
  }, {})
);

export const getCssTopicLevel = (slug) =>
  CSS_TOPIC_LEVEL_BY_SLUG[String(slug || "").trim()] || "";

export const CSS_TOPIC_ALIASES = Object.freeze({});

const CSS_EXAMPLE_LIBRARY = Object.freeze({
  "introduction-to-css": createExample({
    title: "Introduction to CSS",
    syntax: `selector {
  property: value;
}`,
    exampleCode: `h1 {
  color: #2563eb;
}

p {
  font-size: 18px;
}`,
    output:
      "The heading becomes blue and the paragraph text becomes a little larger.",
    bodyMarkup: `<h1>Campus Hub</h1><p>CSS adds style to plain HTML content.</p>`,
  }),
  "css-syntax": createExample({
    title: "CSS Syntax",
    syntax: `selector {
  property: value;
  property: value;
}`,
    exampleCode: `.demo-card {
  background-color: #eff6ff;
  border: 2px solid #60a5fa;
  padding: 16px;
  border-radius: 16px;
}`,
    output:
      "A light blue card appears with a rounded border and space inside it.",
    bodyMarkup: `<div class="demo-card">This card uses one selector with multiple property-value pairs.</div>`,
  }),
  "css-selectors": createExample({
    title: "CSS Selectors",
    syntax: `.card-title {
  color: #1d4ed8;
}`,
    exampleCode: `.card-title {
  color: #1d4ed8;
  font-weight: 700;
}

.card-text {
  color: #475569;
}`,
    output:
      "Only the selected heading and paragraph classes receive the custom styles.",
    bodyMarkup:
      `<h2 class="card-title">Selected title</h2><p class="card-text">Selectors help you target the exact element you want to style.</p>`,
  }),
  "css-comments": createExample({
    title: "CSS Comments",
    syntax: `/* This is a CSS comment */`,
    exampleCode: `/* Heading style */
h2 {
  color: #0f172a;
}

/* Message box style */
.note {
  background: #dbeafe;
  padding: 14px;
  border-radius: 14px;
}`,
    output:
      "The heading stays dark, and the note box gets a blue background with rounded corners.",
    bodyMarkup: `<h2>Comments are ignored by the browser</h2><div class="note">Comments help people understand the stylesheet.</div>`,
  }),
  "css-colors": createExample({
    title: "CSS Colors",
    syntax: `color: #2563eb;
background-color: rgb(239, 246, 255);`,
    exampleCode: `.color-card {
  color: #1d4ed8;
  background-color: rgb(239, 246, 255);
  border-left: 6px solid #3b82f6;
  padding: 16px;
  border-radius: 16px;
}`,
    output:
      "The text becomes blue, the card gets a pale blue background, and the left border stands out.",
    bodyMarkup: `<div class="color-card">Colors can change text, borders, and backgrounds.</div>`,
  }),
  "css-backgrounds": createExample({
    title: "CSS Backgrounds",
    syntax: `background: linear-gradient(135deg, #60a5fa, #4f46e5);`,
    exampleCode: `.hero {
  background: linear-gradient(135deg, #60a5fa, #4f46e5);
  color: white;
  padding: 24px;
  border-radius: 20px;
}`,
    output:
      "The block shows a blue to indigo gradient background with white text on top.",
    bodyMarkup: `<div class="hero"><h2>Gradient background</h2><p>Background styles help sections feel more alive.</p></div>`,
  }),
  "css-borders": createExample({
    title: "CSS Borders",
    syntax: `border: 2px solid #2563eb;`,
    exampleCode: `.border-box {
  border: 3px dashed #2563eb;
  padding: 18px;
  border-radius: 18px;
  background: white;
}`,
    output:
      "A dashed blue border appears around the box with rounded corners.",
    bodyMarkup: `<div class="border-box">Borders define the visible edge of an element.</div>`,
  }),
  "css-margins": createExample({
    title: "CSS Margins",
    syntax: `margin-top: 24px;`,
    exampleCode: `.first-box,
.second-box {
  padding: 14px;
  border-radius: 14px;
  background: #e2e8f0;
}

.second-box {
  margin-top: 24px;
  background: #bfdbfe;
}`,
    output:
      "The second box moves downward because margin adds space outside the element.",
    bodyMarkup:
      `<div class="first-box">First box</div><div class="second-box">Second box with top margin</div>`,
  }),
  "css-padding": createExample({
    title: "CSS Padding",
    syntax: `padding: 20px;`,
    exampleCode: `.padded-box {
  padding: 20px;
  background: #dbeafe;
  border-radius: 16px;
  border: 1px solid #93c5fd;
}`,
    output:
      "The text moves away from the border because padding adds space inside the element.",
    bodyMarkup: `<div class="padded-box">Padding creates breathing room inside a box.</div>`,
  }),
  "css-height-and-width": createExample({
    title: "CSS Height and Width",
    syntax: `width: 220px;
height: 120px;`,
    exampleCode: `.size-box {
  width: 220px;
  height: 120px;
  background: #bfdbfe;
  border-radius: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
}`,
    output:
      "The element becomes a fixed-size box that stays 220 pixels wide and 120 pixels tall.",
    bodyMarkup: `<div class="size-box">220 x 120</div>`,
  }),
  "css-box-model": createExample({
    title: "CSS Box Model",
    syntax: `width: 220px;
padding: 16px;
border: 4px solid #2563eb;
margin: 20px;`,
    exampleCode: `.model-box {
  width: 220px;
  padding: 16px;
  border: 4px solid #2563eb;
  margin: 20px auto;
  background: #eff6ff;
  border-radius: 18px;
}`,
    output:
      "The box shows content space, padding, border, and outer margin together.",
    bodyMarkup: `<div class="model-box">Content area inside the box model</div>`,
  }),
  "css-text": createExample({
    title: "CSS Text",
    syntax: `text-align: center;
text-transform: uppercase;`,
    exampleCode: `.message {
  text-align: center;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: #1e40af;
  font-weight: 700;
}`,
    output:
      "The text becomes centered, uppercase, and more spaced out.",
    bodyMarkup: `<p class="message">welcome to the css lesson</p>`,
  }),
  "css-fonts": createExample({
    title: "CSS Fonts",
    syntax: `font-family: Georgia, serif;
font-size: 22px;`,
    exampleCode: `.font-demo {
  font-family: Georgia, serif;
  font-size: 22px;
  font-style: italic;
  color: #334155;
}`,
    output:
      "The text changes to a serif font, grows larger, and becomes italic.",
    bodyMarkup: `<p class="font-demo">Fonts change the personality of a page.</p>`,
  }),
  "css-icons": createExample({
    title: "CSS Icons",
    syntax: `.icon {
  font-size: 32px;
  color: #2563eb;
}`,
    exampleCode: `.icon-row {
  display: flex;
  gap: 16px;
}

.icon {
  font-size: 32px;
  color: #2563eb;
  background: #dbeafe;
  width: 56px;
  height: 56px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 16px;
}`,
    output:
      "The star, heart, and music icons become larger, blue, and neatly aligned inside tiles.",
    bodyMarkup:
      `<div class="icon-row"><span class="icon">&#9733;</span><span class="icon">&#9829;</span><span class="icon">&#9835;</span></div>`,
  }),
  "css-links": createExample({
    title: "CSS Links",
    syntax: `a:hover {
  color: #1d4ed8;
}`,
    exampleCode: `.learn-link {
  color: #2563eb;
  text-decoration: none;
  font-weight: 700;
}

.learn-link:hover {
  color: #1d4ed8;
  text-decoration: underline;
}`,
    output:
      "The link looks clean by default and becomes darker with an underline on hover.",
    bodyMarkup: `<a class="learn-link" href="#">Open the next CSS topic</a>`,
  }),
  "css-lists": createExample({
    title: "CSS Lists",
    syntax: `list-style-type: square;`,
    exampleCode: `.task-list {
  list-style-type: square;
  color: #1e3a8a;
  padding-left: 24px;
}

.task-list li {
  margin-bottom: 8px;
}`,
    output:
      "The list uses square bullets and adds more space between each item.",
    bodyMarkup:
      `<ul class="task-list"><li>Read the lesson</li><li>Try the example</li><li>Take the quiz</li></ul>`,
  }),
  "css-tables": createExample({
    title: "CSS Tables",
    syntax: `border-collapse: collapse;`,
    exampleCode: `table {
  width: 100%;
  border-collapse: collapse;
}

th,
td {
  border: 1px solid #cbd5e1;
  padding: 12px;
  text-align: left;
}

th {
  background: #dbeafe;
}`,
    output:
      "The table cells join neatly, each cell gets padding, and the heading row looks highlighted.",
    bodyMarkup: `<table><tr><th>Name</th><th>Progress</th></tr><tr><td>Arun</td><td>72%</td></tr><tr><td>Nila</td><td>88%</td></tr></table>`,
  }),
  "css-display": createExample({
    title: "CSS Display",
    syntax: `display: inline-block;`,
    exampleCode: `.chip {
  display: inline-block;
  padding: 10px 14px;
  margin-right: 10px;
  border-radius: 999px;
  background: #dbeafe;
  color: #1d4ed8;
  font-weight: 700;
}`,
    output:
      "The labels sit side by side because inline-block keeps them on one line while allowing box styling.",
    bodyMarkup:
      `<span class="chip">HTML</span><span class="chip">CSS</span><span class="chip">JavaScript</span>`,
  }),
  "css-max-width": createExample({
    title: "CSS Max Width",
    syntax: `max-width: 420px;`,
    exampleCode: `.content {
  max-width: 420px;
  margin: 0 auto;
  background: white;
  padding: 18px;
  border-radius: 18px;
  border: 1px solid #cbd5e1;
}`,
    output:
      "The content area stays centered and never grows wider than 420 pixels.",
    bodyMarkup: `<div class="content"><h2>Readable content</h2><p>Max width keeps long lines from becoming hard to read on large screens.</p></div>`,
  }),
  "css-position": createExample({
    title: "CSS Position",
    syntax: `position: absolute;
top: 12px;
right: 12px;`,
    exampleCode: `.notice {
  position: relative;
  padding: 24px;
  background: #eff6ff;
  border-radius: 18px;
}

.badge {
  position: absolute;
  top: 12px;
  right: 12px;
  background: #2563eb;
  color: white;
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 12px;
}`,
    output:
      "The badge stays pinned to the top-right corner inside the notice box.",
    bodyMarkup:
      `<div class="notice"><span class="badge">New</span><h3>Positioned badge</h3><p>Absolute positioning places the badge exactly where we want it.</p></div>`,
  }),
  "css-z-index": createExample({
    title: "CSS Z-index",
    syntax: `z-index: 10;`,
    exampleCode: `.stack {
  position: relative;
  height: 150px;
}

.card-a,
.card-b {
  position: absolute;
  width: 180px;
  height: 100px;
  border-radius: 18px;
  padding: 14px;
  color: white;
}

.card-a {
  background: #60a5fa;
  top: 18px;
  left: 20px;
}

.card-b {
  background: #1d4ed8;
  top: 44px;
  left: 90px;
  z-index: 10;
}`,
    output:
      "The second card appears above the first card because its z-index is higher.",
    bodyMarkup:
      `<div class="stack"><div class="card-a">Card 1</div><div class="card-b">Card 2 on top</div></div>`,
  }),
  "css-overflow": createExample({
    title: "CSS Overflow",
    syntax: `overflow: auto;`,
    exampleCode: `.overflow-box {
  width: 260px;
  height: 110px;
  overflow: auto;
  padding: 14px;
  border-radius: 16px;
  background: white;
  border: 1px solid #cbd5e1;
  line-height: 1.6;
}`,
    output:
      "A scrollbar appears when the content becomes taller than the fixed box.",
    bodyMarkup: `<div class="overflow-box">Overflow controls what happens when content becomes bigger than the available box. It can stay visible, be hidden, or become scrollable so the layout remains neat and readable.</div>`,
  }),
  "css-float": createExample({
    title: "CSS Float",
    syntax: `float: left;`,
    exampleCode: `.avatar {
  float: left;
  width: 76px;
  height: 76px;
  margin-right: 16px;
  border-radius: 20px;
  background: #93c5fd;
}

.story {
  line-height: 1.6;
}`,
    output:
      "The square avatar floats to the left, and the paragraph wraps around it.",
    bodyMarkup:
      `<div class="avatar"></div><p class="story">Float lets smaller elements sit to one side while nearby text flows around them. It was used often before newer layout tools became common.</p>`,
  }),
  "css-inline-block": createExample({
    title: "CSS Inline-block",
    syntax: `display: inline-block;`,
    exampleCode: `.pill {
  display: inline-block;
  padding: 12px 16px;
  margin-right: 10px;
  border-radius: 16px;
  background: #bfdbfe;
  font-weight: 700;
}`,
    output:
      "The small boxes stay on the same line and still keep width, height, and padding.",
    bodyMarkup:
      `<div><span class="pill">Topic 1</span><span class="pill">Topic 2</span><span class="pill">Topic 3</span></div>`,
  }),
  "css-align": createExample({
    title: "CSS Align",
    syntax: `text-align: center;`,
    exampleCode: `.align-box {
  text-align: center;
  padding: 20px;
  background: #eff6ff;
  border-radius: 18px;
}`,
    output:
      "The text moves to the center of the box.",
    bodyMarkup: `<div class="align-box"><h2>Centered content</h2><p>Alignment helps content feel balanced.</p></div>`,
  }),
  "css-combinators": createExample({
    title: "CSS Combinators",
    syntax: `.card > p {
  color: #2563eb;
}`,
    exampleCode: `.card > p {
  color: #2563eb;
  font-weight: 700;
}

.card span {
  color: #475569;
}`,
    output:
      "Only the paragraph directly inside the card becomes blue, while the span keeps its own style.",
    bodyMarkup:
      `<div class="card"><p>Direct child paragraph</p><div><span>Nested span text</span></div></div>`,
  }),
  "css-pseudo-class": createExample({
    title: "CSS Pseudo-class",
    syntax: `button:hover {
  background: #1d4ed8;
}`,
    exampleCode: `.action-btn {
  border: 0;
  padding: 12px 18px;
  border-radius: 14px;
  background: #2563eb;
  color: white;
  font-weight: 700;
}

.action-btn:hover {
  background: #1d4ed8;
}`,
    output:
      "The button becomes darker when the pointer moves over it.",
    bodyMarkup: `<button class="action-btn">Hover me</button>`,
  }),
  "css-pseudo-element": createExample({
    title: "CSS Pseudo-element",
    syntax: `.label::before {
  content: "New";
}`,
    exampleCode: `.label::before {
  content: "New";
  display: inline-block;
  margin-right: 10px;
  padding: 4px 8px;
  border-radius: 999px;
  background: #bfdbfe;
  color: #1d4ed8;
  font-size: 12px;
  font-weight: 700;
}`,
    output:
      "The word New appears before the label even though it was not written in the HTML.",
    bodyMarkup: `<p class="label">CSS pseudo-elements add visual content.</p>`,
  }),
  "css-opacity": createExample({
    title: "CSS Opacity",
    syntax: `opacity: 0.5;`,
    exampleCode: `.panel {
  background: #2563eb;
  color: white;
  padding: 18px;
  border-radius: 18px;
  opacity: 0.55;
}`,
    output:
      "The panel becomes semi-transparent because opacity reduces the full visibility of the element.",
    bodyMarkup: `<div class="panel">Semi-transparent panel</div>`,
  }),
  "css-navigation-bar": createExample({
    title: "CSS Navigation Bar",
    syntax: `display: flex;
justify-content: space-between;`,
    exampleCode: `.nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 14px 18px;
  border-radius: 18px;
  background: #1e3a8a;
  color: white;
}

.nav-links {
  display: flex;
  gap: 14px;
}
`,
    output:
      "The brand stays on one side, and the links line up neatly on the other side.",
    bodyMarkup:
      `<nav class="nav"><strong>Campus Hub</strong><div class="nav-links"><span>Home</span><span>Courses</span><span>Profile</span></div></nav>`,
  }),
  "css-dropdowns": createExample({
    title: "CSS Dropdowns",
    syntax: `.menu:hover .dropdown {
  display: block;
}`,
    exampleCode: `.menu {
  position: relative;
  display: inline-block;
}

.trigger {
  background: #2563eb;
  color: white;
  padding: 10px 16px;
  border-radius: 14px;
}

.dropdown {
  display: block;
  margin-top: 12px;
  padding: 14px;
  border-radius: 16px;
  background: white;
  border: 1px solid #cbd5e1;
}`,
    output:
      "The dropdown panel appears below the trigger button as a separate styled box.",
    bodyMarkup:
      `<div class="menu"><div class="trigger">Courses</div><div class="dropdown"><p>HTML</p><p>CSS</p><p>JavaScript</p></div></div>`,
  }),
  "css-image-gallery": createExample({
    title: "CSS Image Gallery",
    syntax: `display: grid;
grid-template-columns: repeat(3, 1fr);`,
    exampleCode: `.gallery {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.gallery img {
  width: 100%;
  height: 120px;
  object-fit: cover;
  border-radius: 16px;
}`,
    output:
      "Three images line up in a neat gallery with equal size and cropped previews.",
    bodyMarkup: `<div class="gallery"><img src="${photoDataUri}" alt="Demo image one"><img src="${photoDataUri}" alt="Demo image two"><img src="${photoDataUri}" alt="Demo image three"></div>`,
  }),
  "css-attribute-selectors": createExample({
    title: "CSS Attribute Selectors",
    syntax: `input[type="email"] {
  border-color: #2563eb;
}`,
    exampleCode: `input[type="email"] {
  border: 2px solid #2563eb;
  padding: 12px;
  border-radius: 14px;
}

input[type="text"] {
  border: 2px solid #cbd5e1;
  padding: 12px;
  border-radius: 14px;
}`,
    output:
      "The email field gets a blue border while the text field keeps a neutral border.",
    bodyMarkup:
      `<div style="display:grid;gap:12px;"><input type="text" placeholder="Name"><input type="email" placeholder="Email"></div>`,
  }),
  "css-forms": createExample({
    title: "CSS Forms",
    syntax: `input,
button {
  width: 100%;
}`,
    exampleCode: `.form-card {
  display: grid;
  gap: 12px;
}

input,
button {
  width: 100%;
  padding: 12px;
  border-radius: 14px;
}

input {
  border: 1px solid #cbd5e1;
}

button {
  border: 0;
  background: #2563eb;
  color: white;
  font-weight: 700;
}`,
    output:
      "The form fields become full width, evenly spaced, and easy to read.",
    bodyMarkup:
      `<div class="form-card"><input placeholder="Your name"><input placeholder="Your department"><button type="button">Submit</button></div>`,
  }),
  "css-counters": createExample({
    title: "CSS Counters",
    syntax: `counter-reset: step;
counter-increment: step;`,
    exampleCode: `.steps {
  counter-reset: step;
  display: grid;
  gap: 10px;
}

.steps p::before {
  counter-increment: step;
  content: counter(step) ". ";
  font-weight: 700;
  color: #1d4ed8;
}`,
    output:
      "Each paragraph gets an automatic number in front of it without writing numbers in the HTML.",
    bodyMarkup:
      `<div class="steps"><p>Open the lesson</p><p>Read the example</p><p>Take the quiz</p></div>`,
  }),
  "css-website-layout": createExample({
    title: "CSS Website Layout",
    syntax: `display: grid;
grid-template-columns: 220px 1fr;`,
    exampleCode: `.layout {
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: 16px;
}

.sidebar,
.content {
  min-height: 140px;
  border-radius: 18px;
  padding: 18px;
}

.sidebar {
  background: #bfdbfe;
}

.content {
  background: #eff6ff;
}`,
    output:
      "The page is split into a left sidebar and a main content area.",
    bodyMarkup:
      `<div class="layout"><aside class="sidebar">Sidebar</aside><main class="content">Main content area</main></div>`,
  }),
  "css-units": createExample({
    title: "CSS Units",
    syntax: `width: 50%;
font-size: 1.25rem;`,
    exampleCode: `.unit-box {
  width: 50%;
  font-size: 1.25rem;
  padding: 1rem;
  border-radius: 1rem;
  background: #dbeafe;
}`,
    output:
      "The box uses percentage and rem units, so its size reacts to its container and root font size.",
    bodyMarkup: `<div class="unit-box">CSS units can be fixed or flexible.</div>`,
  }),
  "css-specificity": createExample({
    title: "CSS Specificity",
    syntax: `#special {
  color: #1d4ed8;
}`,
    exampleCode: `p {
  color: #475569;
}

.note {
  color: #0f172a;
}

#special {
  color: #1d4ed8;
}`,
    output:
      "The element with the id special becomes blue because the id selector is more specific.",
    bodyMarkup: `<p class="note" id="special">This paragraph follows the most specific rule.</p>`,
  }),
  "css-flexbox": createExample({
    title: "CSS Flexbox",
    syntax: `display: flex;
justify-content: space-between;`,
    exampleCode: `.flex-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.flex-card {
  flex: 1;
  padding: 18px;
  border-radius: 18px;
  background: #dbeafe;
  text-align: center;
  font-weight: 700;
}`,
    output:
      "The cards sit in one row with equal width and even spacing.",
    bodyMarkup:
      `<div class="flex-row"><div class="flex-card">One</div><div class="flex-card">Two</div><div class="flex-card">Three</div></div>`,
  }),
  "css-grid": createExample({
    title: "CSS Grid",
    syntax: `display: grid;
grid-template-columns: repeat(2, 1fr);`,
    exampleCode: `.grid-layout {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.grid-item {
  padding: 18px;
  border-radius: 18px;
  background: #bfdbfe;
  text-align: center;
  font-weight: 700;
}`,
    output:
      "The cards arrange in rows and columns like a neat dashboard.",
    bodyMarkup:
      `<div class="grid-layout"><div class="grid-item">A</div><div class="grid-item">B</div><div class="grid-item">C</div><div class="grid-item">D</div></div>`,
  }),
  "css-transforms": createExample({
    title: "CSS Transforms",
    syntax: `transform: rotate(-4deg) scale(1.04);`,
    exampleCode: `.transform-box {
  width: 180px;
  margin: 20px auto;
  padding: 20px;
  border-radius: 18px;
  background: #2563eb;
  color: white;
  text-align: center;
  transform: rotate(-4deg) scale(1.04);
}`,
    output:
      "The card rotates slightly and grows a little bigger.",
    bodyMarkup: `<div class="transform-box">Transform me</div>`,
  }),
  "css-transitions": createExample({
    title: "CSS Transitions",
    syntax: `transition: background-color 0.3s ease;`,
    exampleCode: `.transition-btn {
  border: 0;
  padding: 12px 18px;
  border-radius: 14px;
  background: #2563eb;
  color: white;
  font-weight: 700;
  transition: background-color 0.3s ease, transform 0.3s ease;
}

.transition-btn:hover {
  background: #1d4ed8;
  transform: translateY(-2px);
}`,
    output:
      "The button changes smoothly instead of jumping immediately to its hover style.",
    bodyMarkup: `<button class="transition-btn">Hover smoothly</button>`,
  }),
  "css-animations": createExample({
    title: "CSS Animations",
    syntax: `animation: pulse 1.6s infinite;`,
    exampleCode: `.pulse-dot {
  width: 64px;
  height: 64px;
  margin: 24px auto;
  border-radius: 999px;
  background: #2563eb;
  animation: pulse 1.6s infinite;
}

@keyframes pulse {
  0% {
    transform: scale(1);
    opacity: 1;
  }

  50% {
    transform: scale(1.16);
    opacity: 0.6;
  }

  100% {
    transform: scale(1);
    opacity: 1;
  }
}`,
    output:
      "The blue circle grows and fades slightly again and again.",
    bodyMarkup: `<div class="pulse-dot"></div>`,
  }),
  "css-variables": createExample({
    title: "CSS Variables",
    syntax: `:root {
  --brand-color: #2563eb;
}`,
    exampleCode: `:root {
  --brand-color: #2563eb;
  --brand-soft: #dbeafe;
}

.variable-card {
  color: var(--brand-color);
  background: var(--brand-soft);
  padding: 18px;
  border-radius: 18px;
  border-left: 6px solid var(--brand-color);
}`,
    output:
      "The card uses reusable color values stored in CSS variables.",
    bodyMarkup: `<div class="variable-card">Variables make future color changes easier.</div>`,
  }),
  "css-media-queries": createExample({
    title: "CSS Media Queries",
    syntax: `@media (max-width: 520px) {
  .media-row {
    flex-direction: column;
  }
}`,
    exampleCode: `.media-row {
  display: flex;
  gap: 12px;
}

.media-card {
  flex: 1;
  padding: 16px;
  border-radius: 16px;
  background: #bfdbfe;
  text-align: center;
}

@media (max-width: 520px) {
  .media-row {
    flex-direction: column;
  }
}`,
    output:
      "The cards appear in one row on wider screens and stack into a column on small screens.",
    bodyMarkup:
      `<div class="media-row"><div class="media-card">Card 1</div><div class="media-card">Card 2</div><div class="media-card">Card 3</div></div>`,
    extraBaseStyles: `.preview-shell { max-width: 500px; }`,
  }),
  "css-responsive-design": createExample({
    title: "CSS Responsive Design",
    syntax: `width: min(100%, 520px);`,
    exampleCode: `.responsive-card {
  width: min(100%, 520px);
  margin: 0 auto;
  padding: 18px;
  border-radius: 20px;
  background: linear-gradient(135deg, #dbeafe, #eef2ff);
}

.responsive-title {
  font-size: clamp(1.4rem, 4vw, 2rem);
}`,
    output:
      "The card stays readable on both narrow and wide screens by limiting width and scaling text smoothly.",
    bodyMarkup:
      `<div class="responsive-card"><h2 class="responsive-title">Responsive card</h2><p>Responsive design helps one page work across phones, tablets, and laptops.</p></div>`,
  }),
  "css-shadows": createExample({
    title: "CSS Shadows",
    syntax: `box-shadow: 0 18px 40px rgba(37, 99, 235, 0.18);`,
    exampleCode: `.shadow-card {
  padding: 20px;
  border-radius: 20px;
  background: white;
  box-shadow: 0 18px 40px rgba(37, 99, 235, 0.18);
}`,
    output:
      "The white card lifts away from the page because the shadow creates depth.",
    bodyMarkup: `<div class="shadow-card">Shadows make flat layouts feel layered.</div>`,
  }),
  "css-gradients": createExample({
    title: "CSS Gradients",
    syntax: `background: linear-gradient(135deg, #2563eb, #7c3aed);`,
    exampleCode: `.gradient-banner {
  padding: 22px;
  border-radius: 22px;
  color: white;
  background: linear-gradient(135deg, #2563eb, #7c3aed);
}`,
    output:
      "The banner shifts from blue to purple instead of using a single flat color.",
    bodyMarkup: `<div class="gradient-banner"><h2>Gradient banner</h2><p>Gradients blend two or more colors smoothly.</p></div>`,
  }),
  "css-object-fit": createExample({
    title: "CSS Object Fit",
    syntax: `object-fit: cover;`,
    exampleCode: `.photo-frame {
  width: 100%;
  max-width: 280px;
  height: 160px;
  border-radius: 18px;
  overflow: hidden;
}

.photo-frame img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}`,
    output:
      "The image fills the frame nicely without looking stretched.",
    bodyMarkup: `<div class="photo-frame"><img src="${photoDataUri}" alt="Landscape illustration"></div>`,
  }),
  "css-clamp": createExample({
    title: "CSS Clamp",
    syntax: `font-size: clamp(1.5rem, 4vw, 2.8rem);`,
    exampleCode: `.clamp-title {
  font-size: clamp(1.5rem, 4vw, 2.8rem);
  color: #1d4ed8;
  margin: 0;
}`,
    output:
      "The heading grows with screen width but stays within a safe minimum and maximum size.",
    bodyMarkup: `<h1 class="clamp-title">Clamp keeps text flexible and controlled</h1>`,
  }),
  "css-advanced-layout-practice": createExample({
    title: "CSS Advanced Layout Practice",
    syntax: `display: grid;
grid-template-columns: 220px 1fr;
gap: 16px;`,
    exampleCode: `.advanced-layout {
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: 16px;
}

.advanced-sidebar {
  padding: 18px;
  border-radius: 20px;
  background: linear-gradient(180deg, #2563eb, #1d4ed8);
  color: white;
}

.advanced-main {
  display: grid;
  gap: 16px;
}

.advanced-cards {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.advanced-card {
  padding: 18px;
  border-radius: 18px;
  background: #eff6ff;
}
`,
    output:
      "A sidebar and a multi-card content area work together like a simple product dashboard.",
    bodyMarkup: `<div class="advanced-layout"><aside class="advanced-sidebar"><h3>Dashboard</h3><p>Overview</p><p>Courses</p><p>Reports</p></aside><main class="advanced-main"><section class="advanced-cards"><div class="advanced-card">Card one</div><div class="advanced-card">Card two</div></section><section class="advanced-card">Wide content panel</section></main></div>`,
  }),
});

const createMcq = (id, question, options, answerIndex, explanation, code = "") => ({
  id,
  question,
  options,
  answerIndex,
  explanation,
  code,
  codeLanguage: code ? "css" : "",
});

const createCodeQuestion = ({
  id,
  question,
  expectedAnswer,
  starterCode = "/* Write your CSS answer here */\n",
  placeholder = "selector {\n  property: value;\n}",
  code = "",
  explanation = "AI checks whether your CSS answer demonstrates the lesson correctly.",
}) => ({
  id,
  type: "code",
  question,
  code,
  codeLanguage: "css",
  starterCode,
  placeholder,
  expectedAnswer,
  explanation,
});

export const CSS_SAMPLE_TOPIC_OVERRIDES = Object.freeze({
  "css:introduction-to-css": {
    explanation:
      "CSS stands for Cascading Style Sheets. It is used to control how HTML elements look on a web page. With CSS, you can change colors, spacing, fonts, layout, and even small animations without changing the HTML structure itself.",
    syntax: `selector {
  property: value;
}`,
    exampleHtml: `<h1>Welcome to CSS</h1>
<p>CSS makes plain HTML look cleaner and more attractive.</p>`,
    exampleCode: `h1 {
  color: #2563eb;
}

p {
  font-size: 18px;
  color: #334155;
}`,
    previewHtml: buildCssPreviewDocument({
      title: "CSS Introduction",
      styles: `h1 {
  color: #2563eb;
}

p {
  font-size: 18px;
  color: #334155;
}`,
      bodyMarkup:
        `<h1>Welcome to CSS</h1><p>CSS makes plain HTML look cleaner and more attractive.</p>`,
    }),
    output:
      "The heading turns blue and the paragraph becomes slightly bigger and easier to read.",
    notes: [
      "HTML builds the structure, and CSS controls the presentation.",
      "One CSS rule can style many matching elements at once.",
      "CSS can live in a separate file, inside a style tag, or on one element.",
    ],
    keyPoints: [
      "CSS styles HTML elements instead of replacing them.",
      "Every rule starts with a selector and contains property-value pairs.",
      "Small style changes can make a page much easier to read.",
    ],
    commonMistakes: [
      "Thinking CSS can work without any HTML element to style.",
      "Writing property names without values.",
      "Forgetting that CSS needs curly braces around the declarations.",
    ],
    quizQuestions: [
      createMcq(
        "css-introduction-quiz-1",
        "What is the main purpose of CSS?",
        [
          "To style and arrange HTML elements",
          "To store data in a database",
          "To create user accounts",
          "To replace the browser",
        ],
        0,
        "CSS is used to control appearance such as colors, spacing, and layout."
      ),
      createMcq(
        "css-introduction-quiz-2",
        "Which part of a CSS rule selects what should be styled?",
        ["Selector", "Output", "Comment", "Preview"],
        0,
        "The selector chooses which element or class receives the style."
      ),
      createMcq(
        "css-introduction-quiz-3",
        "Which pair belongs inside a CSS rule?",
        ["property: value;", "selector => value", "color = blue =>", "style -> text"],
        0,
        "CSS declarations are written as property: value;"
      ),
      createMcq(
        "css-introduction-quiz-4",
        "Which statement is true about HTML and CSS?",
        [
          "HTML gives structure and CSS gives style",
          "CSS creates the browser and HTML adds internet",
          "HTML and CSS do exactly the same job",
          "CSS can display a page without any HTML",
        ],
        0,
        "HTML and CSS work together: structure first, styling next."
      ),
      createCodeQuestion({
        id: "css-introduction-quiz-5",
        question:
          "Write CSS that makes the heading blue and the paragraph larger and easier to read.",
        starterCode: `h1 {
  
}

p {
  
}`,
        placeholder: `h1 {
  color: #2563eb;
}

p {
  font-size: 18px;
  color: #334155;
}`,
        expectedAnswer: `h1 {
  color: #2563eb;
}

p {
  font-size: 18px;
  color: #334155;
}`,
        explanation:
          "AI checks whether your CSS styles the heading and paragraph like the lesson example.",
      }),
    ],
  },
  "css:css-syntax": {
    explanation:
      "CSS syntax is the writing pattern used in every stylesheet. A rule starts with a selector, then curly braces, and inside the braces you write declarations. Each declaration has a property, a colon, a value, and usually a semicolon at the end.",
    syntax: `selector {
  property: value;
  property: value;
}`,
    exampleHtml: `<div class="card">
  One selector can hold many declarations inside curly braces.
</div>`,
    exampleCode: `.card {
  background-color: #eff6ff;
  border: 2px solid #60a5fa;
  padding: 16px;
}`,
    previewHtml: buildCssPreviewDocument({
      title: "CSS Syntax",
      styles: `.card {
  background-color: #eff6ff;
  border: 2px solid #60a5fa;
  padding: 16px;
  border-radius: 16px;
}`,
      bodyMarkup:
        `<div class="card">One selector can hold many declarations inside curly braces.</div>`,
    }),
    output:
      "The card gets a pale blue background, a border, and inner spacing because each declaration is written with correct syntax.",
    notes: [
      "The selector comes before the opening curly brace.",
      "Each property and value pair should end with a semicolon.",
      "Good formatting makes long CSS easier to read later.",
    ],
    keyPoints: [
      "Selectors are outside the braces, declarations are inside.",
      "A declaration uses property: value;",
      "Missing punctuation is one of the most common CSS errors.",
    ],
    commonMistakes: [
      "Using a comma instead of a colon between property and value.",
      "Forgetting the closing curly brace.",
      "Leaving out semicolons in a multi-line rule.",
    ],
    quizQuestions: [
      createMcq(
        "css-syntax-quiz-1",
        "What comes first in a CSS rule?",
        ["Selector", "Value", "Semicolon", "Property"],
        0,
        "The selector tells CSS which element should receive the rule."
      ),
      createMcq(
        "css-syntax-quiz-2",
        "Which symbol separates a property from its value?",
        [":", ";", ",", "="],
        0,
        "CSS uses a colon between the property and value."
      ),
      createMcq(
        "css-syntax-quiz-3",
        "Which symbol usually ends a CSS declaration?",
        [";", ":", ".", "/"],
        0,
        "A semicolon ends one declaration before the next begins."
      ),
      createMcq(
        "css-syntax-quiz-4",
        "Which example uses correct CSS syntax?",
        [
          `.box {
  color: blue;
}`,
          `.box (
  color = blue
)`,
          `.box => color: blue`,
          `.box [color: blue]`,
        ],
        0,
        "The correct example uses braces, a colon, and a semicolon."
      ),
      createCodeQuestion({
        id: "css-syntax-quiz-5",
        question:
          "Write a valid CSS rule for .card that adds a light background, a border, and padding.",
        starterCode: `.card {
  
}`,
        placeholder: `.card {
  background-color: #eff6ff;
  border: 2px solid #60a5fa;
  padding: 16px;
}`,
        expectedAnswer: `.card {
  background-color: #eff6ff;
  border: 2px solid #60a5fa;
  padding: 16px;
}`,
        explanation:
          "AI checks whether your rule uses correct CSS syntax and the needed declarations.",
      }),
    ],
  },
  "css:css-colors": {
    explanation:
      "CSS colors let you change the look and mood of a page. You can color text, borders, backgrounds, and shadows. Colors can be written in names like red, hex values like #2563eb, or rgb values like rgb(37, 99, 235).",
    syntax: `color: #2563eb;
background-color: rgb(239, 246, 255);`,
    exampleHtml: `<div class="notice">
  Color helps users notice important information quickly.
</div>`,
    exampleCode: `.notice {
  color: #1d4ed8;
  background-color: #dbeafe;
  border-left: 6px solid #2563eb;
  padding: 16px;
}`,
    previewHtml: buildCssPreviewDocument({
      title: "CSS Colors",
      styles: `.notice {
  color: #1d4ed8;
  background-color: #dbeafe;
  border-left: 6px solid #2563eb;
  padding: 16px;
  border-radius: 16px;
}`,
      bodyMarkup:
        `<div class="notice">Color helps users notice important information quickly.</div>`,
    }),
    output:
      "The text becomes deep blue, the background turns light blue, and the left border stands out clearly.",
    notes: [
      "Use enough contrast so text stays readable.",
      "Hex and rgb are common ways to write exact colors.",
      "The same color can be reused across many components for a consistent design.",
    ],
    keyPoints: [
      "CSS can style text, borders, and backgrounds with different colors.",
      "Readable contrast is more important than decoration.",
      "Hex values and rgb values are both valid CSS color formats.",
    ],
    commonMistakes: [
      "Choosing colors with low contrast between text and background.",
      "Misspelling color names.",
      "Forgetting the # symbol in a hex color.",
    ],
    quizQuestions: [
      createMcq(
        "css-colors-quiz-1",
        "Which property changes text color?",
        ["color", "background", "padding", "display"],
        0,
        "The color property changes the text color."
      ),
      createMcq(
        "css-colors-quiz-2",
        "Which example is a hex color?",
        ["#2563eb", "rgb(37, 99, 235)", "blue()", "color-blue"],
        0,
        "A hex color starts with # followed by hexadecimal characters."
      ),
      createMcq(
        "css-colors-quiz-3",
        "Which property changes the background color of an element?",
        ["background-color", "font-size", "margin", "position"],
        0,
        "background-color changes the fill color behind the content."
      ),
      createMcq(
        "css-colors-quiz-4",
        "Why is color contrast important?",
        [
          "It helps users read the content easily",
          "It removes all spacing",
          "It turns CSS into HTML",
          "It creates more selectors",
        ],
        0,
        "Strong contrast keeps text readable for more users."
      ),
      createCodeQuestion({
        id: "css-colors-quiz-5",
        question:
          "Write CSS for .notice that uses blue text, a light blue background, and a blue left border.",
        starterCode: `.notice {
  
}`,
        placeholder: `.notice {
  color: #1d4ed8;
  background-color: #dbeafe;
  border-left: 6px solid #2563eb;
  padding: 16px;
}`,
        expectedAnswer: `.notice {
  color: #1d4ed8;
  background-color: #dbeafe;
  border-left: 6px solid #2563eb;
  padding: 16px;
}`,
        explanation:
          "AI checks whether your CSS uses the main color properties from the lesson.",
      }),
    ],
  },
  "css:css-box-model": {
    explanation:
      "Every element in CSS behaves like a rectangular box. The box model has four parts: content, padding, border, and margin. Understanding these layers helps you control spacing and size without confusion.",
    syntax: `width: 220px;
padding: 16px;
border: 4px solid #2563eb;
margin: 20px;`,
    exampleHtml: `<div class="lesson-box">
  The content sits inside padding, border, and margin.
</div>`,
    exampleCode: `.lesson-box {
  width: 220px;
  padding: 16px;
  border: 4px solid #2563eb;
  margin: 20px auto;
  background: #eff6ff;
}`,
    previewHtml: buildCssPreviewDocument({
      title: "CSS Box Model",
      styles: `.lesson-box {
  width: 220px;
  padding: 16px;
  border: 4px solid #2563eb;
  margin: 20px auto;
  background: #eff6ff;
  border-radius: 18px;
}`,
      bodyMarkup:
        `<div class="lesson-box">The content sits inside padding, border, and margin.</div>`,
    }),
    output:
      "The box shows inner space around the text, a visible border, and outer space around the entire element.",
    notes: [
      "Padding is inside the border, while margin is outside the border.",
      "Border adds visible thickness around the element.",
      "The box model affects both spacing and the final size on the page.",
    ],
    keyPoints: [
      "Content, padding, border, and margin form the full element box.",
      "Padding grows the inside space; margin grows the outside space.",
      "Most layout spacing problems become easier after learning the box model.",
    ],
    commonMistakes: [
      "Mixing up padding and margin.",
      "Forgetting that borders also affect total size.",
      "Setting a small width but adding large padding and border without checking the result.",
    ],
    quizQuestions: [
      createMcq(
        "css-box-model-quiz-1",
        "Which part of the box model is the space outside the border?",
        ["Margin", "Padding", "Content", "Shadow"],
        0,
        "Margin is the outermost space around the element."
      ),
      createMcq(
        "css-box-model-quiz-2",
        "Which part of the box model creates space inside the border?",
        ["Padding", "Margin", "Display", "Float"],
        0,
        "Padding adds internal breathing room."
      ),
      createMcq(
        "css-box-model-quiz-3",
        "What is the visible line around an element called?",
        ["Border", "Margin", "Width", "Selector"],
        0,
        "The border is the visible edge around the padding and content."
      ),
      createMcq(
        "css-box-model-quiz-4",
        "Why is the box model important?",
        [
          "It helps control size and spacing accurately",
          "It changes HTML into CSS",
          "It removes selectors",
          "It prevents all layout issues automatically",
        ],
        0,
        "The box model explains where space comes from around each element."
      ),
      createCodeQuestion({
        id: "css-box-model-quiz-5",
        question:
          "Write CSS for .lesson-box that includes width, padding, border, margin, and a light background.",
        starterCode: `.lesson-box {
  
}`,
        placeholder: `.lesson-box {
  width: 220px;
  padding: 16px;
  border: 4px solid #2563eb;
  margin: 20px auto;
  background: #eff6ff;
}`,
        expectedAnswer: `.lesson-box {
  width: 220px;
  padding: 16px;
  border: 4px solid #2563eb;
  margin: 20px auto;
  background: #eff6ff;
}`,
        explanation:
          "AI checks whether your CSS includes the main box model properties from the lesson.",
      }),
    ],
  },
  "css:css-flexbox": {
    explanation:
      "Flexbox is a layout system for arranging items in a row or column. It is useful when you want items to line up neatly, share space, center content, or move to different positions without using float tricks.",
    syntax: `.row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}`,
    exampleHtml: `<div class="row">
  <div class="item">HTML</div>
  <div class="item">CSS</div>
  <div class="item">JS</div>
</div>`,
    exampleCode: `.row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.item {
  flex: 1;
  padding: 18px;
  border-radius: 18px;
  background: #dbeafe;
  text-align: center;
  font-weight: 700;
}`,
    previewHtml: buildCssPreviewDocument({
      title: "CSS Flexbox",
      styles: `.row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.item {
  flex: 1;
  padding: 18px;
  border-radius: 18px;
  background: #dbeafe;
  text-align: center;
  font-weight: 700;
}`,
      bodyMarkup:
        `<div class="row"><div class="item">HTML</div><div class="item">CSS</div><div class="item">JS</div></div>`,
    }),
    output:
      "The three boxes line up in one row, keep equal width, and stay separated by a clear gap.",
    notes: [
      "display: flex turns the parent into a flex container.",
      "justify-content controls horizontal distribution in a row layout.",
      "gap creates consistent spacing between items.",
    ],
    keyPoints: [
      "Flexbox styles the parent so the children align more easily.",
      "It is ideal for navbars, cards, buttons, and small layouts.",
      "justify-content and align-items are the most-used flex properties.",
    ],
    commonMistakes: [
      "Adding flex properties to the children when the parent should be the flex container.",
      "Forgetting to set display: flex on the parent.",
      "Expecting justify-content to work when there is no extra space to distribute.",
    ],
    quizQuestions: [
      createMcq(
        "css-flexbox-quiz-1",
        "Which value turns a container into a flex container?",
        ["display: flex", "position: flex", "float: flex", "align: flex"],
        0,
        "display: flex activates flexbox on the parent."
      ),
      createMcq(
        "css-flexbox-quiz-2",
        "Which property adds space between flex items without margins?",
        ["gap", "z-index", "opacity", "counter-reset"],
        0,
        "gap creates spacing directly between flex children."
      ),
      createMcq(
        "css-flexbox-quiz-3",
        "What does justify-content usually control in a row layout?",
        [
          "Horizontal distribution of items",
          "Text color",
          "Font size",
          "Border radius",
        ],
        0,
        "In a row, justify-content handles the main horizontal axis."
      ),
      createMcq(
        "css-flexbox-quiz-4",
        "Where should display: flex be written?",
        [
          "On the parent container",
          "On every child only",
          "Inside the HTML text content",
          "On the browser tab",
        ],
        0,
        "Flexbox starts on the parent container."
      ),
      createCodeQuestion({
        id: "css-flexbox-quiz-5",
        question:
          "Write CSS that turns .row into a flex container and gives .item equal space with centered text.",
        starterCode: `.row {
  
}

.item {
  
}`,
        placeholder: `.row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.item {
  flex: 1;
  padding: 18px;
  border-radius: 18px;
  background: #dbeafe;
  text-align: center;
  font-weight: 700;
}`,
        expectedAnswer: `.row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.item {
  flex: 1;
  padding: 18px;
  border-radius: 18px;
  background: #dbeafe;
  text-align: center;
  font-weight: 700;
}`,
        explanation:
          "AI checks whether your CSS creates the same flex layout shown in the lesson.",
      }),
    ],
  },
  "css:css-media-queries": {
    explanation:
      "Media queries let CSS respond to screen size or device conditions. They are commonly used to stack items on small screens, resize text, or adjust spacing so the layout works better on phones and tablets.",
    syntax: `@media (max-width: 520px) {
  .cards {
    flex-direction: column;
  }
}`,
    exampleHtml: `<div class="cards">
  <div class="card">Course 1</div>
  <div class="card">Course 2</div>
  <div class="card">Course 3</div>
</div>`,
    exampleCode: `.cards {
  display: flex;
  gap: 12px;
}

.card {
  flex: 1;
  padding: 16px;
  border-radius: 16px;
  background: #dbeafe;
  text-align: center;
}

@media (max-width: 520px) {
  .cards {
    flex-direction: column;
  }
}`,
    previewHtml: buildCssPreviewDocument({
      title: "CSS Media Queries",
      styles: `.cards {
  display: flex;
  gap: 12px;
}

.card {
  flex: 1;
  padding: 16px;
  border-radius: 16px;
  background: #dbeafe;
  text-align: center;
}

@media (max-width: 520px) {
  .cards {
    flex-direction: column;
  }
}`,
      bodyMarkup:
        `<div class="cards"><div class="card">Course 1</div><div class="card">Course 2</div><div class="card">Course 3</div></div>`,
      extraBaseStyles: `.preview-shell { max-width: 500px; }`,
    }),
    output:
      "On a wide screen the cards appear in one row, and on a narrow screen they stack vertically.",
    notes: [
      "A media query checks a condition before applying the CSS inside it.",
      "max-width is often used for phone-friendly changes.",
      "Responsive changes should improve readability, not only shrink content.",
    ],
    keyPoints: [
      "Media queries help one layout adapt to different screens.",
      "They are a core part of responsive design.",
      "Small screens often need stacked layouts, simpler spacing, and larger tap areas.",
    ],
    commonMistakes: [
      "Writing the media query but forgetting the styles inside it.",
      "Using breakpoints that do not match the actual design needs.",
      "Making text smaller on phones when readability should improve instead.",
    ],
    quizQuestions: [
      createMcq(
        "css-media-queries-quiz-1",
        "What is the main purpose of a media query?",
        [
          "To change styles when a condition like screen width is met",
          "To create a Firestore collection",
          "To delete unused CSS",
          "To build HTML tags",
        ],
        0,
        "Media queries apply styles only when their condition is true."
      ),
      createMcq(
        "css-media-queries-quiz-2",
        "Which condition is commonly used for smaller screens?",
        ["max-width", "font-family", "z-index", "counter-increment"],
        0,
        "max-width checks for screen widths up to a chosen size."
      ),
      createMcq(
        "css-media-queries-quiz-3",
        "Why are media queries useful?",
        [
          "They help a layout adapt to different devices",
          "They replace selectors",
          "They remove the need for HTML",
          "They stop all hover effects",
        ],
        0,
        "Responsive styling is one of the main jobs of media queries."
      ),
      createMcq(
        "css-media-queries-quiz-4",
        "Which layout change is common inside a small-screen media query?",
        [
          "Stacking cards in a column",
          "Making every element absolute",
          "Deleting all spacing",
          "Turning headings into comments",
        ],
        0,
        "Stacking content usually improves small-screen readability."
      ),
      createCodeQuestion({
        id: "css-media-queries-quiz-5",
        question:
          "Write CSS that keeps .cards in a row by default and stacks them in a column below 520px.",
        starterCode: `.cards {
  display: flex;
  gap: 12px;
}

@media (max-width: 520px) {
  .cards {
    
  }
}`,
        placeholder: `.cards {
  display: flex;
  gap: 12px;
}

@media (max-width: 520px) {
  .cards {
    flex-direction: column;
  }
}`,
        expectedAnswer: `.cards {
  display: flex;
  gap: 12px;
}

@media (max-width: 520px) {
  .cards {
    flex-direction: column;
  }
}`,
        explanation:
          "AI checks whether your media query makes the layout responsive on small screens.",
      }),
    ],
  },
});

export const buildCssExampleForTopic = ({ slug }) =>
  CSS_EXAMPLE_LIBRARY[String(slug || "").trim()] ||
  createExample({
    title: "CSS Topic",
    syntax: `selector {
  property: value;
}`,
    exampleCode: `.demo-block {
  padding: 16px;
  border-radius: 16px;
  background: #dbeafe;
  color: #1d4ed8;
}`,
    output:
      "The preview shows a simple styled block so you can connect the CSS rule with the visual result.",
    bodyMarkup: `<div class="demo-block">This topic uses the same CSS rule pattern with a different styling goal.</div>`,
  });
