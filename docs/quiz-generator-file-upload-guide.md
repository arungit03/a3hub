# Quiz Generator PDF Configuration File Upload

The Quiz Paper Generator now supports loading configuration from PDF files, making it easy to save and reuse quiz paper generation settings.

## File Format

Upload a PDF file that contains configuration data in the following JSON format (can be embedded in the PDF):

```json
{
  "selectedPaperIds": ["paper_id_1", "paper_id_2", "paper_id_3"],
  "totalMarks": 100,
  "twoMarkCount": 10,
  "sixteenMarkCount": 5,
  "splitEnabled": false,
  "splitType": "2parts",
  "difficulty": "mixed",
  "questionType": "mixed",
  "shuffle": true
}
```

## Creating a PDF Configuration File

You can create a PDF with configuration data by:

1. **From a text editor**: Create a document with the JSON configuration, then export/save as PDF
2. **From a word processor**: Paste the configuration text and save as PDF
3. **From a script**: Generate a PDF programmatically with the configuration data embedded

## Field Descriptions

| Field | Type | Description | Default |
|-------|------|-------------|---------|
| `selectedPaperIds` | Array<string> | IDs of quiz papers to select | `[]` |
| `totalMarks` | Number | Total marks for the quiz | `100` |
| `twoMarkCount` | Number | Number of 2-mark questions | `10` |
| `sixteenMarkCount` | Number | Number of 16-mark questions | `5` |
| `splitEnabled` | Boolean | Enable splitting of 16-mark questions | `false` |
| `splitType` | String | Type of splitting: `"2parts"` or `"3parts"` | `"2parts"` |
| `difficulty` | String | Difficulty level: `"mixed"`, `"easy"`, `"medium"`, or `"hard"` | `"mixed"` |
| `questionType` | String | Question type: `"mixed"`, `"2mark"`, or `"16mark"` | `"mixed"` |
| `shuffle` | Boolean | Shuffle questions in the generated paper | `true` |

## How to Use

1. Click the **"Load from File"** button in the Quiz Paper Generator
2. Select your PDF configuration file
3. The form will automatically populate with the settings extracted from the PDF
4. Review and adjust if needed
5. Click **"Generate Preview"** to create the quiz paper

## Example Configuration

For a 100-mark quiz with 10 two-mark questions and 5 sixteen-mark questions:

```json
{
  "selectedPaperIds": [
    "physics_term1",
    "physics_term2",
    "physics_revision"
  ],
  "totalMarks": 100,
  "twoMarkCount": 10,
  "sixteenMarkCount": 5,
  "splitEnabled": true,
  "splitType": "2parts",
  "difficulty": "hard",
  "questionType": "mixed",
  "shuffle": true
}
```

## Benefits

- **Reusable**: Save your quiz configuration as a PDF and use it repeatedly
- **Time-saving**: Load complex settings with a single file upload
- **Consistent**: Ensure the same quiz structure across multiple papers
- **Shareable**: Share PDF configuration files with other staff members
- **Document-friendly**: PDFs are easier to print and archive than JSON files
