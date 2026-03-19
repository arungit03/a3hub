export const HTML_COURSE_DEFINITION = Object.freeze({
  id: "html",
  title: "HTML",
  subtitle: "Build web page structure step by step",
  accent: "from-orange-500 via-amber-500 to-yellow-500",
  badgeClass: "border-orange-200 bg-orange-50 text-orange-700",
  compilerLabel: "Open HTML Editor",
  compilerPath: "",
  toolLabel: "Open HTML Editor",
  toolPath: "/html-editor",
  heroSummary:
    "Learn how web pages are structured, preview them live, and practice in a built-in Try it Yourself HTML editor.",
});

export const HTML_TOPIC_TITLES = Object.freeze([
  "Introduction to HTML",
  "HTML Editors",
  "Basic HTML Page Structure",
  "HTML Elements",
  "HTML Attributes",
  "HTML Headings",
  "HTML Paragraphs",
  "HTML Formatting",
  "HTML Comments",
  "HTML Colors",
  "HTML Links",
  "HTML Images",
  "HTML Favicon",
  "HTML Tables",
  "HTML Lists",
  "HTML Block and Inline Elements",
  "HTML Div",
  "HTML Classes",
  "HTML Id",
  "HTML Iframes",
  "HTML Forms",
  "HTML Form Attributes",
  "HTML Input Types",
  "HTML Input Attributes",
  "HTML Buttons",
  "HTML Labels",
  "HTML Semantic Elements",
  "HTML Audio",
  "HTML Video",
  "HTML YouTube Embeds",
  "HTML Entities",
  "HTML Symbols",
  "HTML Charset",
  "HTML Responsive Design Basics",
  "HTML Meta Tags",
  "HTML Layout Structure",
  "HTML Navigation Bar Structure",
  "HTML Portfolio Page Structure",
  "HTML Login Form Design Structure",
  "HTML Registration Form Structure",
  "HTML Resume Page Structure",
  "HTML Mini Project Practice",
]);

export const HTML_TOPIC_ALIASES = Object.freeze({
  "introduction-to-html": "introduction",
  "basic-html-page-structure": "page-structure",
  "html-elements": "elements",
  "html-attributes": "attributes",
  "html-headings": "headings",
  "html-paragraphs": "paragraphs",
  "html-formatting": "formatting",
  "html-comments": "comments",
  "html-colors": "colors",
  "html-links": "links",
  "html-images": "images",
  "html-favicon": "favicon",
  "html-tables": "tables",
  "html-lists": "lists",
  "html-block-and-inline-elements": "block-inline",
  "html-div": "div",
  "html-classes": "classes",
  "html-id": "id",
  "html-iframes": "iframes",
  "html-forms": "forms",
  "html-form-attributes": "form-attributes",
  "html-input-types": "input-types",
  "html-input-attributes": "input-attributes",
  "html-buttons": "buttons",
  "html-labels": "labels",
  "html-semantic-elements": "semantic-elements",
  "html-audio": "audio",
  "html-video": "video",
  "html-youtube-embeds": "youtube-embeds",
  "html-entities": "entities",
  "html-symbols": "symbols",
  "html-charset": "charset",
  "html-responsive-design-basics": "responsive-design",
  "html-meta-tags": "meta-tags",
  "html-layout-structure": "layout-structure",
  "html-navigation-bar-structure": "navigation-bar",
  "html-portfolio-page-structure": "portfolio-page",
  "html-login-form-design-structure": "login-form",
  "html-registration-form-structure": "registration-form",
  "html-resume-page-structure": "resume-page",
  "html-mini-project-practice": "mini-project",
});

export const HTML_SAMPLE_TOPIC_OVERRIDES = Object.freeze({
  "html:introduction-to-html": {
    explanation:
      "HTML stands for HyperText Markup Language. It is used to build the structure of a web page. HTML tells the browser where to show headings, paragraphs, images, links, tables, and forms.",
    syntax: `<!DOCTYPE html>
<html>
  <head>
    <title>Page Title</title>
  </head>
  <body>
    Content goes here
  </body>
</html>`,
    exampleCode: `<!DOCTYPE html>
<html>
  <head>
    <title>My First Page</title>
  </head>
  <body>
    <h1>Hello World</h1>
    <p>This is my first HTML page.</p>
  </body>
</html>`,
    output:
      "The browser shows a large Hello World heading and a paragraph below it.",
    notes: [
      "HTML uses opening and closing tags for most elements.",
      "The browser reads HTML from top to bottom.",
      "HTML creates structure, while CSS and JavaScript add style and behavior later.",
    ],
    commonMistakes: [
      "Forgetting to close a tag like </p> or </body>.",
      "Writing content outside the <body> element.",
      "Leaving out the <!DOCTYPE html> line in beginner examples.",
    ],
  },
  "html:html-elements": {
    explanation:
      "An HTML element is the full piece made from an opening tag, content, and usually a closing tag. For example, a paragraph element uses <p>content</p>.",
    syntax: `<tagname>Content</tagname>`,
    exampleCode: `<h1>Welcome</h1>
<p>This is a paragraph.</p>
<button>Click Me</button>`,
    output:
      "The browser shows a heading, a paragraph, and a button.",
    notes: [
      "Most HTML elements have a start tag and an end tag.",
      "Some elements like <img> do not wrap text content.",
      "The content inside a tag is what the user usually sees.",
    ],
    commonMistakes: [
      "Mixing the closing order of nested tags.",
      "Using the wrong element for the content type.",
      "Forgetting that tag names are written inside angle brackets.",
    ],
  },
  "html:html-links": {
    explanation:
      "HTML links let users move from one page to another. The <a> tag creates a link, and the href attribute stores the destination.",
    syntax: `<a href="https://example.com">Visit Example</a>`,
    exampleCode: `<h2>Useful Links</h2>
<a href="https://www.w3schools.com">Learn HTML</a>`,
    output:
      "The browser shows a clickable Learn HTML link.",
    notes: [
      "The text between <a> and </a> becomes the clickable part.",
      "href can point to another website, page, file, or section.",
      "You can use target=\"_blank\" to open a link in a new tab.",
    ],
    commonMistakes: [
      "Writing the destination text outside the anchor tag.",
      "Misspelling href as ref or hrf.",
      "Forgetting quotes around the URL value.",
    ],
  },
  "html:html-images": {
    explanation:
      "Images are added using the <img> tag. The src attribute tells the browser where the image file is, and the alt attribute gives text when the image cannot load or for screen readers.",
    syntax: `<img src="photo.jpg" alt="Profile photo" width="220">`,
    exampleCode: `<h2>College Logo</h2>
<img
  src="https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=400&q=80"
  alt="Laptop on a study desk"
  width="220"
>`,
    output:
      "The browser shows the heading and the image below it.",
    notes: [
      "Always write meaningful alt text for accessibility.",
      "Width and height can control the display size.",
      "The <img> tag does not need a closing tag with separate content.",
    ],
    commonMistakes: [
      "Leaving out the alt attribute.",
      "Using a broken file path in src.",
      "Trying to wrap text inside the <img> tag.",
    ],
  },
  "html:html-tables": {
    explanation:
      "HTML tables organize data into rows and columns. A table usually uses <table>, <tr> for rows, <th> for headings, and <td> for normal data cells.",
    syntax: `<table>
  <tr>
    <th>Name</th>
    <th>Score</th>
  </tr>
  <tr>
    <td>Asha</td>
    <td>92</td>
  </tr>
</table>`,
    exampleCode: `<table border="1">
  <tr>
    <th>Name</th>
    <th>Department</th>
  </tr>
  <tr>
    <td>Ravi</td>
    <td>CSE</td>
  </tr>
  <tr>
    <td>Diya</td>
    <td>ECE</td>
  </tr>
</table>`,
    output:
      "The browser shows a table with Name and Department columns and two data rows.",
    notes: [
      "Use <th> for table headings so the browser treats them as labels.",
      "Each row belongs inside a <tr> tag.",
      "All data cells inside a row should line up with the headings.",
    ],
    commonMistakes: [
      "Putting <td> directly inside <table> without a row.",
      "Using different cell counts in the same simple table by mistake.",
      "Forgetting to close row tags.",
    ],
  },
  "html:html-forms": {
    explanation:
      "HTML forms collect user input such as names, email addresses, passwords, and selections. The <form> element wraps the full input area.",
    syntax: `<form>
  <label for="name">Name</label>
  <input id="name" type="text">
  <button type="submit">Submit</button>
</form>`,
    exampleCode: `<form>
  <label for="student-name">Name:</label><br>
  <input id="student-name" type="text" placeholder="Enter your name"><br><br>

  <label for="student-email">Email:</label><br>
  <input id="student-email" type="email" placeholder="Enter your email"><br><br>

  <button type="submit">Register</button>
</form>`,
    output:
      "The browser shows two labeled input boxes and a Register button.",
    notes: [
      "A label should describe the input clearly.",
      "Different input types help browsers validate and format data.",
      "The form tag can later connect to a backend using action and method.",
    ],
    commonMistakes: [
      "Using inputs without labels.",
      "Forgetting the type attribute when a special input type is needed.",
      "Closing the form before all fields are added.",
    ],
  },
});

export const HTML_SAMPLE_PROBLEMS_BY_TOPIC = Object.freeze({
  "html:introduction-to-html": [
    {
      id: "html-introduction-problem-1",
      title: "Fill The Missing Tags",
      difficulty: "Easy",
      statement:
        "Complete a very simple HTML page by adding the missing <html>, <head>, <title>, and <body> tags in the correct places.",
      sampleInput: "No input",
      sampleOutput: "A page with a heading and one paragraph",
      hint: "Think about the normal order of a basic HTML document.",
    },
    {
      id: "html-introduction-problem-2",
      title: "Correct The Page Structure",
      difficulty: "Easy",
      statement:
        "A beginner wrote page content inside the <head> section. Move the visible content into the correct part of the document.",
      sampleInput: "No input",
      sampleOutput: "Visible heading and paragraph inside the page body",
      hint: "Only metadata belongs inside the head section.",
    },
    {
      id: "html-introduction-problem-3",
      title: "Write Your First Web Page",
      difficulty: "Medium",
      statement:
        "Write a full HTML page that shows your name in a heading and one short paragraph introducing yourself.",
      sampleInput: "No input",
      sampleOutput: "A heading with a name and one paragraph",
      hint: "Start with <!DOCTYPE html> and build the structure step by step.",
    },
  ],
  "html:html-elements": [
    {
      id: "html-elements-problem-1",
      title: "Identify The Correct Tag",
      difficulty: "Easy",
      statement:
        "Choose and write the correct HTML tag to display a main heading, a paragraph, and a button on the same page.",
      sampleInput: "No input",
      sampleOutput: "One heading, one paragraph, one button",
      hint: "Use the most common beginner tags for each content type.",
    },
    {
      id: "html-elements-problem-2",
      title: "Fix The Nested Elements",
      difficulty: "Easy",
      statement:
        "A code sample closes nested tags in the wrong order. Rewrite it with the correct opening and closing structure.",
      sampleInput: "No input",
      sampleOutput: "Properly nested heading and paragraph content",
      hint: "The last tag opened should close first.",
    },
    {
      id: "html-elements-problem-3",
      title: "Create A Simple Welcome Card",
      difficulty: "Medium",
      statement:
        "Write a small HTML snippet with a heading, a paragraph, and a button inside a div container.",
      sampleInput: "No input",
      sampleOutput: "A welcome card layout",
      hint: "Use one parent container with three child elements.",
    },
  ],
  "html:html-links": [
    {
      id: "html-links-problem-1",
      title: "Fill The Missing href",
      difficulty: "Easy",
      statement:
        "Complete an anchor tag by adding the missing href attribute so the text opens https://example.com.",
      sampleInput: "No input",
      sampleOutput: "A working clickable link",
      hint: "The URL is stored inside the href value.",
    },
    {
      id: "html-links-problem-2",
      title: "Correct The Broken Link",
      difficulty: "Easy",
      statement:
        "A student wrote <link> instead of <a>. Replace it with the correct clickable HTML structure.",
      sampleInput: "No input",
      sampleOutput: "A visible clickable text link",
      hint: "Use the anchor tag for normal hyperlinks.",
    },
    {
      id: "html-links-problem-3",
      title: "Create A Navigation Row",
      difficulty: "Medium",
      statement:
        "Write three navigation links named Home, About, and Contact using anchor tags.",
      sampleInput: "No input",
      sampleOutput: "Three visible links in one row or column",
      hint: "Each visible label should be inside its own <a> element.",
    },
  ],
  "html:html-images": [
    {
      id: "html-images-problem-1",
      title: "Add The Correct Image Tag",
      difficulty: "Easy",
      statement:
        "Write an image element that loads photo.jpg and uses meaningful alt text.",
      sampleInput: "No input",
      sampleOutput: "An image with fallback text support",
      hint: "Use src for the file path and alt for description.",
    },
    {
      id: "html-images-problem-2",
      title: "Find The Missing Attribute",
      difficulty: "Easy",
      statement:
        "An image loads, but screen readers have no description. Add the missing accessibility attribute.",
      sampleInput: "No input",
      sampleOutput: "The same image tag with descriptive fallback text",
      hint: "This attribute is short but very important.",
    },
    {
      id: "html-images-problem-3",
      title: "Build A Photo Section",
      difficulty: "Medium",
      statement:
        "Create a section with a heading and one image displayed below it at a fixed width.",
      sampleInput: "No input",
      sampleOutput: "A heading with one visible image",
      hint: "Use a heading tag first and then an <img> tag.",
    },
  ],
  "html:html-tables": [
    {
      id: "html-tables-problem-1",
      title: "Complete The Table Row",
      difficulty: "Easy",
      statement:
        "Fill in the missing tags to complete a table row with two cells: Ravi and 92.",
      sampleInput: "No input",
      sampleOutput: "A table row containing two values",
      hint: "A row uses <tr> and data cells use <td>.",
    },
    {
      id: "html-tables-problem-2",
      title: "Match Tag With Purpose",
      difficulty: "Easy",
      statement:
        "Write which tag should be used for a table heading cell and which tag should be used for normal table data.",
      sampleInput: "No input",
      sampleOutput: "<th> for heading, <td> for data",
      hint: "Heading cells are different from normal data cells.",
    },
    {
      id: "html-tables-problem-3",
      title: "Create A Student Table",
      difficulty: "Medium",
      statement:
        "Write a simple table with columns Name and Department and add two student rows.",
      sampleInput: "No input",
      sampleOutput: "A 2-column table with 2 rows of data",
      hint: "Start with headings, then add data rows below.",
    },
  ],
  "html:html-forms": [
    {
      id: "html-forms-problem-1",
      title: "Fill The Missing Form Tag",
      difficulty: "Easy",
      statement:
        "Add the correct wrapper tag around a name input and submit button so the code becomes a valid form.",
      sampleInput: "No input",
      sampleOutput: "A simple form with one input and one button",
      hint: "One parent tag collects all the input controls.",
    },
    {
      id: "html-forms-problem-2",
      title: "Connect Label And Input",
      difficulty: "Easy",
      statement:
        "Write a label and input pair where the label clearly points to an email field.",
      sampleInput: "No input",
      sampleOutput: "One label and one email input",
      hint: "Use for on the label and id on the input.",
    },
    {
      id: "html-forms-problem-3",
      title: "Create A Mini Registration Form",
      difficulty: "Medium",
      statement:
        "Write a small HTML form with name, email, and password inputs plus a submit button.",
      sampleInput: "No input",
      sampleOutput: "A simple registration form layout",
      hint: "Use different input types for email and password.",
    },
  ],
});

export const HTML_SAMPLE_QUIZ_BY_TOPIC = Object.freeze({
  "html:introduction-to-html": [
    {
      id: "html-introduction-quiz-1",
      question: "What does HTML mainly do on a web page?",
      options: [
        "Creates the structure of the page",
        "Runs database queries",
        "Compiles C programs",
        "Stores user passwords",
      ],
      answerIndex: 0,
      explanation: "HTML gives the browser the structure and meaning of page content.",
    },
    {
      id: "html-introduction-quiz-2",
      question: "Which tag contains the visible page content?",
      options: ["<head>", "<body>", "<title>", "<meta>"],
      answerIndex: 1,
      explanation: "The browser shows normal page content from inside the body tag.",
    },
    {
      id: "html-introduction-quiz-3",
      question: "What is the purpose of <!DOCTYPE html>?",
      code: `<!DOCTYPE html>
<html>
  <body>
    <h1>Hello</h1>
  </body>
</html>`,
      codeLanguage: "html",
      options: [
        "It tells the browser to use the HTML5 document type",
        "It creates a heading",
        "It adds CSS automatically",
        "It closes the document",
      ],
      answerIndex: 0,
      explanation: "The doctype tells the browser which HTML standard to use.",
    },
    {
      id: "html-introduction-quiz-4",
      question: "Which part usually stores the page title shown in the browser tab?",
      options: ["<body>", "<footer>", "<head>", "<section>"],
      answerIndex: 2,
      explanation: "The title tag lives inside the head section.",
    },
    {
      id: "html-introduction-quiz-5",
      question: "What will this code show in the browser body?",
      code: `<body>
  <h1>Hello World</h1>
  <p>Welcome</p>
</body>`,
      codeLanguage: "html",
      options: [
        "A heading and a paragraph",
        "Only the page title",
        "Nothing at all",
        "A table",
      ],
      answerIndex: 0,
      explanation: "The code shows one heading followed by one paragraph.",
    },
  ],
  "html:html-elements": [
    {
      id: "html-elements-quiz-1",
      question: "Which line is a complete HTML paragraph element?",
      options: ["<p>", "</p>", "<p>Hello</p>", "p Hello /p"],
      answerIndex: 2,
      explanation: "A normal element includes opening tag, content, and closing tag.",
    },
    {
      id: "html-elements-quiz-2",
      question: "What does this code create?",
      code: `<button>Save</button>`,
      codeLanguage: "html",
      options: ["An image", "A button", "A heading", "A table cell"],
      answerIndex: 1,
      explanation: "The button tag creates a clickable button element.",
    },
    {
      id: "html-elements-quiz-3",
      question: "Which HTML element is best for a main heading?",
      options: ["<p>", "<h1>", "<span>", "<small>"],
      answerIndex: 1,
      explanation: "h1 is the main heading element.",
    },
    {
      id: "html-elements-quiz-4",
      question: "Why is the closing order important in nested tags?",
      options: [
        "Browsers need properly nested structure",
        "It changes internet speed",
        "It removes attributes",
        "It creates JavaScript functions",
      ],
      answerIndex: 0,
      explanation: "Nested tags should close in reverse order to stay valid.",
    },
    {
      id: "html-elements-quiz-5",
      question: "Which code shows a heading followed by a paragraph?",
      options: [
        "<h1>Title</h1><p>Text</p>",
        "<title>Title</title><head>Text</head>",
        "<h1><p>Text</h1></p>",
        "<body Title paragraph>",
      ],
      answerIndex: 0,
      explanation: "That snippet uses the right elements in the right order.",
    },
  ],
  "html:html-links": [
    {
      id: "html-links-quiz-1",
      question: "Which tag creates a normal clickable link?",
      options: ["<img>", "<a>", "<link>", "<button>"],
      answerIndex: 1,
      explanation: "The anchor tag is used for hyperlinks.",
    },
    {
      id: "html-links-quiz-2",
      question: "Which attribute stores the destination of a link?",
      options: ["src", "alt", "href", "id"],
      answerIndex: 2,
      explanation: "href stores the address the link opens.",
    },
    {
      id: "html-links-quiz-3",
      question: "What will this code show?",
      code: `<a href="https://example.com">Visit Site</a>`,
      codeLanguage: "html",
      options: [
        "A clickable Visit Site link",
        "An image named Visit Site",
        "A table heading",
        "Plain hidden text",
      ],
      answerIndex: 0,
      explanation: "The anchor text becomes the clickable label.",
    },
    {
      id: "html-links-quiz-4",
      question: "What does target=\"_blank\" do?",
      options: [
        "Opens the link in a new tab or window",
        "Changes the link color to black",
        "Deletes the link",
        "Adds a tooltip only",
      ],
      answerIndex: 0,
      explanation: "The _blank target usually opens the destination in a new tab.",
    },
    {
      id: "html-links-quiz-5",
      question: "Which HTML is written correctly?",
      options: [
        "<a href='about.html'>About</a>",
        "<a>href='about.html'>About</a>",
        "<link href='about.html'>About</link>",
        "<a src='about.html'>About</a>",
      ],
      answerIndex: 0,
      explanation: "That is the correct structure for an anchor tag with href.",
    },
  ],
  "html:html-images": [
    {
      id: "html-images-quiz-1",
      question: "Which tag is used to show an image?",
      options: ["<picture-text>", "<img>", "<src>", "<media>"],
      answerIndex: 1,
      explanation: "The img tag is used for images.",
    },
    {
      id: "html-images-quiz-2",
      question: "Which attribute describes the image for accessibility?",
      options: ["alt", "href", "for", "name"],
      answerIndex: 0,
      explanation: "alt gives alternative text for screen readers and broken images.",
    },
    {
      id: "html-images-quiz-3",
      question: "What does this code do?",
      code: `<img src="campus.jpg" alt="College campus" width="200">`,
      codeLanguage: "html",
      options: [
        "Shows an image at 200px width",
        "Creates a table",
        "Opens a video player",
        "Creates a new page title",
      ],
      answerIndex: 0,
      explanation: "The image is displayed with the given width and alt text.",
    },
    {
      id: "html-images-quiz-4",
      question: "What happens if src points to the wrong file?",
      options: [
        "The image may not load",
        "The browser becomes a text editor",
        "The page title disappears",
        "The HTML tags stop working forever",
      ],
      answerIndex: 0,
      explanation: "A bad path usually prevents the image from loading.",
    },
    {
      id: "html-images-quiz-5",
      question: "Which snippet is best practice?",
      options: [
        "<img src='logo.png' alt='Company logo'>",
        "<img alt='Logo'>",
        "<img href='logo.png'>",
        "<image src='logo.png'></image>",
      ],
      answerIndex: 0,
      explanation: "That snippet includes both src and useful alt text.",
    },
  ],
  "html:html-tables": [
    {
      id: "html-tables-quiz-1",
      question: "Which tag creates a table row?",
      options: ["<td>", "<th>", "<tr>", "<table-row>"],
      answerIndex: 2,
      explanation: "tr stands for table row.",
    },
    {
      id: "html-tables-quiz-2",
      question: "Which tag is usually used for a heading cell?",
      options: ["<th>", "<td>", "<head>", "<caption-cell>"],
      answerIndex: 0,
      explanation: "th is used for header cells.",
    },
    {
      id: "html-tables-quiz-3",
      question: "What will this code create?",
      code: `<table>
  <tr>
    <th>Name</th>
    <th>Score</th>
  </tr>
  <tr>
    <td>Asha</td>
    <td>95</td>
  </tr>
</table>`,
      codeLanguage: "html",
      options: [
        "A 2-column table with one data row",
        "A form with two inputs",
        "A list with two items",
        "An image gallery",
      ],
      answerIndex: 0,
      explanation: "The code defines a small table with headings and one row.",
    },
    {
      id: "html-tables-quiz-4",
      question: "Where should <td> normally appear?",
      options: [
        "Inside a <tr>",
        "Inside a <head>",
        "Inside a <title>",
        "Inside a <meta>",
      ],
      answerIndex: 0,
      explanation: "Data cells belong inside table rows.",
    },
    {
      id: "html-tables-quiz-5",
      question: "Which statement is true about HTML tables?",
      options: [
        "Tables are useful for row and column data",
        "Tables can only show images",
        "Tables replace all div elements",
        "Tables do not use rows",
      ],
      answerIndex: 0,
      explanation: "Tables are best for structured row-column data.",
    },
  ],
  "html:html-forms": [
    {
      id: "html-forms-quiz-1",
      question: "Which tag wraps a group of form controls?",
      options: ["<form>", "<input>", "<fieldset-text>", "<label>"],
      answerIndex: 0,
      explanation: "The form tag wraps the whole set of inputs.",
    },
    {
      id: "html-forms-quiz-2",
      question: "Which element is used to collect typed text from the user?",
      options: ["<button>", "<label>", "<input>", "<img>"],
      answerIndex: 2,
      explanation: "Input fields collect user-entered data.",
    },
    {
      id: "html-forms-quiz-3",
      question: "What will this code show?",
      code: `<label for="email">Email</label>
<input id="email" type="email">`,
      codeLanguage: "html",
      options: [
        "A label and an email input field",
        "A heading and a paragraph",
        "A table row",
        "An audio player",
      ],
      answerIndex: 0,
      explanation: "The snippet creates a labeled email field.",
    },
    {
      id: "html-forms-quiz-4",
      question: "Why are labels important in forms?",
      options: [
        "They explain what each field is for",
        "They replace the form tag",
        "They automatically save the form",
        "They only change background color",
      ],
      answerIndex: 0,
      explanation: "Labels help users and improve accessibility.",
    },
    {
      id: "html-forms-quiz-5",
      question: "Which button type is used for sending a form?",
      options: ["submit", "image", "style", "frame"],
      answerIndex: 0,
      explanation: "submit is the normal type for sending a form.",
    },
  ],
});

const buildPreviewSummary = (label) =>
  `The browser renders a simple example showing ${label}.`;

export const buildHtmlExampleForTopic = ({ slug }) => {
  const normalizedSlug = String(slug || "").trim().toLowerCase();
  const category = HTML_TOPIC_ALIASES[normalizedSlug] || normalizedSlug;

  switch (category) {
    case "introduction":
    case "editors":
    case "page-structure":
      return {
        syntax: `<!DOCTYPE html>
<html>
  <head>
    <title>My Page</title>
  </head>
  <body>
    <h1>Hello</h1>
  </body>
</html>`,
        exampleCode: `<!DOCTYPE html>
<html>
  <head>
    <title>My Page</title>
  </head>
  <body>
    <h1>Hello World</h1>
    <p>This page is built with HTML.</p>
  </body>
</html>`,
        output: buildPreviewSummary("a heading and one paragraph"),
      };
    case "elements":
      return {
        syntax: `<h1>Heading</h1>
<p>Paragraph</p>
<button>Button</button>`,
        exampleCode: `<h1>Campus News</h1>
<p>Admissions are open now.</p>
<button>Apply</button>`,
        output: buildPreviewSummary("a heading, paragraph, and button"),
      };
    case "attributes":
      return {
        syntax: `<a href="https://example.com">Open</a>
<img src="photo.jpg" alt="Description">`,
        exampleCode: `<a href="https://example.com" target="_blank">Visit Example</a>
<p title="Helpful hint">Move the mouse over this text.</p>`,
        output: buildPreviewSummary("a link and a paragraph with a tooltip"),
      };
    case "headings":
      return {
        syntax: `<h1>Main Heading</h1>
<h2>Sub Heading</h2>`,
        exampleCode: `<h1>Department Updates</h1>
<h2>Events This Week</h2>
<h3>Workshop Schedule</h3>`,
        output: buildPreviewSummary("three heading levels"),
      };
    case "paragraphs":
      return {
        syntax: `<p>This is a paragraph.</p>`,
        exampleCode: `<p>HTML paragraphs help you show text in readable blocks.</p>
<p>Each paragraph starts on a new line in the browser.</p>`,
        output: buildPreviewSummary("two separate paragraphs"),
      };
    case "formatting":
      return {
        syntax: `<b>Bold</b>
<i>Italic</i>
<strong>Important</strong>`,
        exampleCode: `<p><strong>Important:</strong> Submit the form before Friday.</p>
<p><em>Please read the instructions carefully.</em></p>`,
        output: buildPreviewSummary("formatted important text"),
      };
    case "comments":
      return {
        syntax: `<!-- This comment is not shown in the browser -->`,
        exampleCode: `<!-- Main welcome message -->
<h1>Welcome Students</h1>
<p>This text is visible in the browser.</p>`,
        output: buildPreviewSummary("visible heading and paragraph, while the comment stays hidden"),
      };
    case "colors":
      return {
        syntax: `<p style="color: red;">Colored text</p>`,
        exampleCode: `<h1 style="color: #ea580c;">HTML Colors</h1>
<p style="background-color: #fef3c7; padding: 12px;">This paragraph has a background color.</p>`,
        output: buildPreviewSummary("a colored heading and paragraph"),
      };
    case "links":
      return {
        syntax: `<a href="https://example.com">Example Link</a>`,
        exampleCode: `<a href="https://example.com">Open Example Website</a>`,
        output: buildPreviewSummary("a clickable website link"),
      };
    case "images":
      return {
        syntax: `<img src="photo.jpg" alt="Photo" width="220">`,
        exampleCode: `<img
  src="https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=700&q=80"
  alt="Laptop and notebook on a desk"
  width="260"
>`,
        output: buildPreviewSummary("a single image"),
      };
    case "favicon":
      return {
        syntax: `<link rel="icon" href="favicon.ico">`,
        exampleCode: `<!DOCTYPE html>
<html>
  <head>
    <title>HTML Favicon</title>
    <link rel="icon" href="https://www.google.com/favicon.ico">
  </head>
  <body>
    <p>Check the browser tab icon.</p>
  </body>
</html>`,
        output: "The browser tab shows the page title and, when allowed, a favicon icon.",
      };
    case "tables":
      return {
        syntax: `<table>
  <tr><th>Name</th><th>Score</th></tr>
  <tr><td>Asha</td><td>95</td></tr>
</table>`,
        exampleCode: `<table border="1" cellpadding="8">
  <tr>
    <th>Name</th>
    <th>Score</th>
  </tr>
  <tr>
    <td>Asha</td>
    <td>95</td>
  </tr>
  <tr>
    <td>Ravi</td>
    <td>88</td>
  </tr>
</table>`,
        output: buildPreviewSummary("a 2-column table"),
      };
    case "lists":
      return {
        syntax: `<ul>
  <li>Item 1</li>
  <li>Item 2</li>
</ul>`,
        exampleCode: `<h2>Things to Bring</h2>
<ul>
  <li>ID Card</li>
  <li>Notebook</li>
  <li>Pen</li>
</ul>`,
        output: buildPreviewSummary("an unordered list"),
      };
    case "block-inline":
      return {
        syntax: `<div>Block</div>
<span>Inline</span>`,
        exampleCode: `<div style="background:#e2e8f0; padding:10px;">This div takes full width.</div>
<span style="background:#fde68a;">This span stays inline.</span>`,
        output: buildPreviewSummary("one block element and one inline element"),
      };
    case "div":
      return {
        syntax: `<div>Content group</div>`,
        exampleCode: `<div style="border:1px solid #cbd5e1; padding:16px; border-radius:12px;">
  <h2>Student Card</h2>
  <p>Name: Meena</p>
</div>`,
        output: buildPreviewSummary("a grouped content card"),
      };
    case "classes":
      return {
        syntax: `<p class="notice">Important text</p>`,
        exampleCode: `<style>
  .notice { color: #dc2626; font-weight: bold; }
</style>
<p class="notice">Lab report due tomorrow.</p>`,
        output: buildPreviewSummary("a styled paragraph using a class"),
      };
    case "id":
      return {
        syntax: `<h1 id="top">Welcome</h1>`,
        exampleCode: `<h1 id="top">Department Page</h1>
<a href="#top">Back to top</a>`,
        output: buildPreviewSummary("an element with an id and an anchor link"),
      };
    case "iframes":
      return {
        syntax: `<iframe src="page.html" title="Embedded page"></iframe>`,
        exampleCode: `<iframe
  srcdoc="<h2>Embedded Preview</h2><p>This content is inside an iframe.</p>"
  title="Sample iframe"
  width="100%"
  height="120"
></iframe>`,
        output: buildPreviewSummary("an embedded iframe preview"),
      };
    case "forms":
    case "form-attributes":
    case "input-types":
    case "input-attributes":
    case "buttons":
    case "labels":
      return {
        syntax: `<form>
  <label for="name">Name</label>
  <input id="name" type="text">
  <button type="submit">Submit</button>
</form>`,
        exampleCode: `<form>
  <label for="name">Name</label><br>
  <input id="name" type="text" placeholder="Enter your name"><br><br>
  <label for="email">Email</label><br>
  <input id="email" type="email" required><br><br>
  <button type="submit">Submit</button>
</form>`,
        output: buildPreviewSummary("a simple HTML form"),
      };
    case "semantic-elements":
      return {
        syntax: `<header></header>
<main></main>
<footer></footer>`,
        exampleCode: `<header><h1>College Portal</h1></header>
<main><p>Main content goes here.</p></main>
<footer><small>2026 A3 Hub</small></footer>`,
        output: buildPreviewSummary("a semantic page structure"),
      };
    case "audio":
      return {
        syntax: `<audio controls>
  <source src="audio.mp3" type="audio/mpeg">
</audio>`,
        exampleCode: `<audio controls>
  <source src="sample.mp3" type="audio/mpeg">
  Your browser does not support audio.
</audio>`,
        output: "The browser shows an audio player when a valid audio file is available.",
      };
    case "video":
      return {
        syntax: `<video controls width="320">
  <source src="movie.mp4" type="video/mp4">
</video>`,
        exampleCode: `<video controls width="320">
  <source src="sample.mp4" type="video/mp4">
  Your browser does not support video.
</video>`,
        output: "The browser shows a video player when a valid video file is available.",
      };
    case "youtube-embeds":
      return {
        syntax: `<iframe src="https://www.youtube.com/embed/videoId"></iframe>`,
        exampleCode: `<iframe
  width="100%"
  height="220"
  src="https://www.youtube.com/embed/dQw4w9WgXcQ"
  title="YouTube video player"
></iframe>`,
        output: buildPreviewSummary("an embedded YouTube frame"),
      };
    case "entities":
      return {
        syntax: `&lt; &gt; &amp;`,
        exampleCode: `<p>Use &lt;p&gt; to create a paragraph.</p>
<p>Tom &amp; Jerry is written with an entity.</p>`,
        output: buildPreviewSummary("HTML entities shown as symbols"),
      };
    case "symbols":
      return {
        syntax: `&copy; &check; &#9733;`,
        exampleCode: `<p>&copy; 2026 A3 Hub</p>
<p>&#9733; Featured topic</p>`,
        output: buildPreviewSummary("special symbols"),
      };
    case "charset":
      return {
        syntax: `<meta charset="UTF-8">`,
        exampleCode: `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8">
    <title>Charset Example</title>
  </head>
  <body>
    <p>Price: ₹250</p>
  </body>
</html>`,
        output: buildPreviewSummary("text with special characters"),
      };
    case "responsive-design":
    case "meta-tags":
      return {
        syntax: `<meta name="viewport" content="width=device-width, initial-scale=1.0">`,
        exampleCode: `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Responsive Page</title>
  </head>
  <body>
    <div style="max-width: 420px; margin: 0 auto; padding: 16px; border: 1px solid #cbd5e1;">
      Responsive content box
    </div>
  </body>
</html>`,
        output: buildPreviewSummary("a simple mobile-friendly content box"),
      };
    case "layout-structure":
    case "navigation-bar":
    case "portfolio-page":
    case "login-form":
    case "registration-form":
    case "resume-page":
    case "mini-project":
      return {
        syntax: `<div class="layout">
  <header>Header</header>
  <main>Main content</main>
</div>`,
        exampleCode: `<div style="font-family: sans-serif;">
  <header style="background:#0f172a;color:white;padding:12px 16px;">Project Header</header>
  <main style="padding:16px;">
    <h2>Section Title</h2>
    <p>This is a simple HTML layout practice example.</p>
    <button>Action</button>
  </main>
</div>`,
        output: buildPreviewSummary("a small layout practice page"),
      };
    default:
      return {
        syntax: `<p>HTML example</p>`,
        exampleCode: `<p>Hello from HTML.</p>`,
        output: buildPreviewSummary("a simple HTML paragraph"),
      };
  }
};
