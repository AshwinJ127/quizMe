# QuizMe!

QuizMe! is a Chrome extension that generates interactive, multiple‑choice quizzes based on the text content of a webpage. It extracts either the full page text or the text you highlight, then uses the Gemini API to create quiz questions.

## Features

- **Text Extraction:**  
  Choose between using the full page text or your highlighted selection to generate quiz questions.
- **AI-Generated Questions:**  
  Utilizes the Gemini API to dynamically generate a set of 5 multiple‑choice questions.
- **User-Friendly Interface:**  
  A clean, responsive design displays the quiz questions and your score.

## File Structure

- **manifest.json**  
  Configures the extension (permissions, default popup, icons, and background script).

- **popup.html**  
  The main HTML file for the extension popup that appears when you click the QuizMe! icon.

- **popup.css**  
  Contains the CSS styling for the extension’s user interface.

- **popup.js**  
  Implements the core logic for text extraction, API calls to Gemini, quiz generation, and quiz flow.

- **config.js**  
  Exports configuration values like the Gemini API key. (This file is imported into `popup.js` using ES modules.)

- **process.env**  
  Contains environment variable settings for development purposes but is not automatically loaded in a browser environment.

- **background.js**  
  A minimal background script that logs installation events (reserved for future background tasks).

## Prerequisites

- **Google Chrome (or any Chromium-based browser)**  
- **Gemini API Key:**  
  You need a valid Gemini API key. For development, the key is stored in `config.js`.  
  **Note:** Exposing an API key client‑side is not secure for production; consider a server‑side proxy for sensitive keys.

## Installation and Running Locally

### 1. Clone the Repository

Open your terminal and run:

```bash
git clone https://github.com/AshwinJ127/quizMe.git
cd quizMe
```
### Step 2: Configure Your API Key

Open the `config.js` file and replace the default key with your own Gemini API key:

```js
export const API_KEY = "YOUR_GEMINI_API_KEY";
```
### Step 3: Load the Extension in Chrome
Open Chrome and navigate to:

```arduino
chrome://extensions
```
Enable Developer mode (toggle switch in the top‑right corner).

Click on Load unpacked.

Select the repository’s root folder (the folder containing manifest.json).

### Step 4: Testing the Extension
Click the QuizMe! icon in your Chrome toolbar.

In the popup, choose either:

Full Page: to extract text from the entire page.

Highlighted Text: to extract only the text you have selected.

Wait a few moments as the extension processes the text and queries the Gemini API.

Answer the generated quiz questions to see your score.

## License
This project is licensed under the MIT License. See the LICENSE file for more details.
