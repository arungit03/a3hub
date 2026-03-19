export const DEFAULT_HTML_TEMPLATE = `<!DOCTYPE html>
<html>
<head>
  <title>My Page</title>
</head>
<body>
  <h1>Hello World</h1>
  <p>This is my first HTML page.</p>
</body>
</html>`;

export const HTML_EDITOR_EXAMPLES = Object.freeze([
  {
    id: "heading-example",
    title: "Heading Example",
    description: "Basic heading levels",
    code: `<!DOCTYPE html>
<html>
<body>
  <h1>Main Heading</h1>
  <h2>Sub Heading</h2>
  <h3>Section Heading</h3>
</body>
</html>`,
  },
  {
    id: "paragraph-example",
    title: "Paragraph Example",
    description: "Simple paragraphs",
    code: `<!DOCTYPE html>
<html>
<body>
  <p>This is the first paragraph.</p>
  <p>This is the second paragraph.</p>
</body>
</html>`,
  },
  {
    id: "link-example",
    title: "Link Example",
    description: "Anchor tag practice",
    code: `<!DOCTYPE html>
<html>
<body>
  <a href="https://example.com" target="_blank">Visit Example</a>
</body>
</html>`,
  },
  {
    id: "image-example",
    title: "Image Example",
    description: "Image with alt text",
    code: `<!DOCTYPE html>
<html>
<body>
  <img
    src="https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=700&q=80"
    alt="Laptop on a desk"
    width="260"
  >
</body>
</html>`,
  },
  {
    id: "table-example",
    title: "Table Example",
    description: "Simple data table",
    code: `<!DOCTYPE html>
<html>
<body>
  <table border="1" cellpadding="8">
    <tr>
      <th>Name</th>
      <th>Score</th>
    </tr>
    <tr>
      <td>Asha</td>
      <td>95</td>
    </tr>
  </table>
</body>
</html>`,
  },
  {
    id: "list-example",
    title: "List Example",
    description: "Unordered list layout",
    code: `<!DOCTYPE html>
<html>
<body>
  <ul>
    <li>Notebook</li>
    <li>Pen</li>
    <li>ID Card</li>
  </ul>
</body>
</html>`,
  },
  {
    id: "form-example",
    title: "Form Example",
    description: "Basic form fields",
    code: `<!DOCTYPE html>
<html>
<body>
  <form>
    <label for="name">Name</label><br>
    <input id="name" type="text"><br><br>
    <label for="email">Email</label><br>
    <input id="email" type="email"><br><br>
    <button type="submit">Submit</button>
  </form>
</body>
</html>`,
  },
  {
    id: "div-example",
    title: "Div Example",
    description: "Grouped content card",
    code: `<!DOCTYPE html>
<html>
<body>
  <div style="border:1px solid #cbd5e1; padding:16px; border-radius:12px;">
    <h2>Student Card</h2>
    <p>Name: Divya</p>
  </div>
</body>
</html>`,
  },
]);

export const getHtmlEditorExampleById = (exampleId) =>
  HTML_EDITOR_EXAMPLES.find((item) => item.id === exampleId) || null;
