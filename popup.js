import { API_KEY } from './config.js';

document.getElementById("full-page-btn").addEventListener("click", () => {
    getTextFromPage("fullPage");
});

document.getElementById("highlighted-text-btn").addEventListener("click", () => {
    getTextFromPage("highlightedText");
});

function getTextFromPage(source) {
    // Hide start screen
    document.getElementById("start-screen").style.display = "none";
    // Show loading indicator while extracting text
    document.getElementById("loading-indicator").style.display = "block";

    // For testing purposes, add a button to skip waiting and use sample questions
    const skipWaitingButton = document.createElement("button");
    skipWaitingButton.textContent = "Use Sample Questions Instead";
    skipWaitingButton.style.marginTop = "10px";
    skipWaitingButton.addEventListener("click", () => {
        document.getElementById("loading-indicator").style.display = "none";
        startQuiz(sampleQuestions);
    });
    document.getElementById("loading-indicator").appendChild(skipWaitingButton);

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            func: extractText,
            args: [source]
        }, (result) => {
            if (result && result[0] && result[0].result) {
                sendTextToServer(result[0].result);
            } else {
                console.error("Failed to extract text");
                // Hide loading indicator
                document.getElementById("loading-indicator").style.display = "none";
                // Show start screen again
                document.getElementById("start-screen").style.display = "block";
                alert("Failed to extract text from the page.");
            }
        });
    });
}

function extractText(source) {
    return source === "highlightedText"
        ? window.getSelection().toString().trim() || "No text highlighted."
        : document.body.innerText.trim();
}

function sendTextToServer(text) {
    // Show loading indicator
    const loadingIndicator = document.getElementById("loading-indicator");
    loadingIndicator.style.display = "block";

    // Get the status message element
    const statusMessage = document.getElementById("status-message") || document.createElement("p");
    statusMessage.id = "status-message";
    statusMessage.textContent = "Analyzing text...";

    // Add it to the loading indicator if it's not already there
    if (!document.getElementById("status-message")) {
        loadingIndicator.appendChild(statusMessage);
    }

    console.log("Sending text to Gemini API:", text.substring(0, 100) + "...");

    // Check if text is too long and truncate if necessary
    const maxLength = 10000; // Gemini has token limits
    let processedText = text;
    if (text.length > maxLength) {
        processedText = text.substring(0, maxLength);
        console.log("Text truncated to", maxLength, "characters");
        document.getElementById("status-message").textContent = "Text is long, trimming to improve results...";
    }

    // Update status message
    document.getElementById("status-message").textContent = "Sending request to AI...";

    // Call Gemini API to generate questions
    generateQuestionsWithGemini(processedText)
        .then(questions => {
            console.log("Generated questions:", questions);
            console.log("Number of questions:", questions ? questions.length : 0);
            console.log("Questions type:", Array.isArray(questions) ? "Array" : typeof questions);

            // Hide loading indicator
            document.getElementById("loading-indicator").style.display = "none";

            if (questions && Array.isArray(questions) && questions.length > 0) {
                console.log("Starting quiz with Gemini-generated questions");
                // Start quiz with generated questions
                startQuiz(questions);
            } else {
                console.error("Invalid questions format or empty questions array");
                throw new Error("No valid questions generated");
            }
        })
        .catch(error => {
            console.error("Error generating questions:", error);
            // Hide loading indicator
            document.getElementById("loading-indicator").style.display = "none";

            // Show specific error message based on the error type
            let errorMessage = "Failed to generate questions. Using sample questions instead.";

            if (error.message.includes("API key")) {
                errorMessage = "Invalid API key. Please check your Gemini API key.";
            } else if (error.message.includes("429")) {
                errorMessage = "Too many requests to the Gemini API. Please try again later.";
            } else if (error.message.includes("parse")) {
                errorMessage = "Could not parse the response from Gemini. Using sample questions instead.";
            }

            alert(errorMessage);
            console.log("Falling back to sample questions");

            // Try to generate simple questions from the text if it's not too short
            if (processedText.length > 200) {
                try {
                    document.getElementById("status-message").textContent = "Generating basic questions from text...";
                    const simpleQuestions = generateSimpleQuestions(processedText);
                    if (simpleQuestions && simpleQuestions.length > 0) {
                        console.log("Generated simple questions as fallback");
                        startQuiz(simpleQuestions);
                        return;
                    }
                } catch (e) {
                    console.error("Failed to generate simple questions:", e);
                }
            }

            // Use sample questions as last resort
            startQuiz(sampleQuestions);
        });
}

// Function to generate questions using Gemini API
async function generateQuestionsWithGemini(text) {
    if (!API_KEY) {
        throw new Error("API key is not set in the environment!");
    }

    // Define models to try in order of preference
    const models = [
        "gemini-2.0-flash",
        "gemini-1.5-flash",
        "gemini-1.0-pro"
    ];

    // Try each model until one works
    for (const model of models) {
        try {
            console.log(`Trying model: ${model}`);
            document.getElementById("status-message").textContent = `Trying model: ${model}...`;

            const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

            // Create the prompt for Gemini
            const prompt = `
            You are a quiz generator API that returns only JSON. Generate a multiple-choice quiz based on the provided text.

            CRITICAL: Your entire response must be ONLY a valid JSON array. Do not include any explanations, markdown formatting, or text outside the JSON.

            Generate exactly 5 questions with 4 answer options each, using this exact JSON structure:
            [
              {
                "question": "Question text here?",
                "answers": ["Option A", "Option B", "Option C", "Option D"],
                "correct": 0
              },
              {
                "question": "Another question here?",
                "answers": ["Option A", "Option B", "Option C", "Option D"],
                "correct": 1
              }
            ]

            Rules:
            1. The "correct" field must be a number (0-3) indicating the index of the correct answer
            2. Questions must be about key concepts in the text
            3. Make answers plausible but with only one clearly correct option
            4. Use proper JSON syntax with double quotes for strings
            5. Do not use single quotes, comments, or trailing commas

            Text to generate questions from:
            ${text}
            `;

            console.log(`Sending request to ${model} with prompt:`, prompt.substring(0, 100) + "...");
            document.getElementById("status-message").textContent = `${model} is generating questions...`;

            const requestBody = {
                contents: [{
                    parts: [{
                        text: prompt
                    }]
                }],
                generationConfig: {
                    temperature: 0.2,
                    topK: 40,
                    topP: 0.95,
                    maxOutputTokens: 2048
                }
            };

            console.log("Request body:", JSON.stringify(requestBody).substring(0, 100) + "...");

            const response = await fetch(`${API_URL}?key=${API_KEY}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(requestBody)
            });

            console.log(`${model} response status:`, response.status);
            document.getElementById("status-message").textContent = `Processing ${model} response...`;

            // Get the response text first to debug
            const responseText = await response.text();
            console.log("Raw response:", responseText.substring(0, 200) + "...");

            if (!response.ok) {
                console.log(`${model} failed with status ${response.status}, trying next model...`);
                continue; // Try the next model
            }

            // Parse the JSON response
            const data = JSON.parse(responseText);
            console.log("Gemini API response structure:", Object.keys(data));

            if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
                console.error("Unexpected response structure:", data);
                continue; // Try the next model
            }

            // Extract the generated text from the response
            const generatedText = data.candidates[0].content.parts[0].text;
            console.log("Generated text:", generatedText.substring(0, 200) + "...");
            document.getElementById("status-message").textContent = "Formatting questions...";

            // Parse the JSON from the generated text
            try {
                // Clean up the text first - remove any markdown code blocks, etc.
                let cleanedText = generatedText.replace(/```json|```/g, '').trim();
                console.log("Cleaned text:", cleanedText.substring(0, 100) + "...");

                // First try to parse the whole response directly
                try {
                    console.log("Attempting to parse the whole response as JSON");
                    return JSON.parse(cleanedText);
                } catch (e) {
                    console.log("Could not parse whole response, trying to extract JSON array");
                }

                // Try to find a JSON array in the response
                const jsonMatch = cleanedText.match(/\[\s*\{.*\}\s*\]/s);
                if (jsonMatch) {
                    console.log("Found JSON array in response");
                    try {
                        return JSON.parse(jsonMatch[0]);
                    } catch (e) {
                        console.log("Found JSON array but couldn't parse it, trying to fix");
                    }
                }

                // Try to extract anything that looks like JSON
                console.log("Attempting to extract and fix JSON from text");
                const possibleJson = cleanedText.match(/(\[|\{).*(\]|\})/s);
                if (possibleJson) {
                    try {
                        return JSON.parse(possibleJson[0]);
                    } catch (e) {
                        console.log("Extracted JSON-like text but couldn't parse it, trying to fix");

                        // Try to manually fix common JSON issues
                        const fixedJson = fixJsonString(possibleJson[0]);
                        if (fixedJson) {
                            console.log("Successfully fixed JSON");
                            return fixedJson;
                        }
                    }
                }

                // Last resort: try to extract individual questions and build the array manually
                console.log("Attempting to extract questions manually");
                const questions = extractQuestionsManually(cleanedText);
                if (questions && questions.length > 0) {
                    console.log("Successfully extracted questions manually");
                    return questions;
                }

                // If we couldn't parse the response, try the next model
                console.log(`Couldn't parse ${model} response, trying next model...`);
                continue;
            } catch (parseError) {
                console.error(`Error parsing JSON from ${model} response:`, parseError);
                continue; // Try the next model
            }
        } catch (error) {
            console.error(`Error with ${model}:`, error);
            // Continue to the next model instead of throwing
            continue;
        }
    }

    // If we've tried all models and none worked, throw an error
    throw new Error("All Gemini models failed to generate questions");
}

// Function to generate simple questions from text without using API
function generateSimpleQuestions(text) {
    // Extract sentences that might be good for questions
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [];

    // Filter to sentences that are not too short or too long
    const goodSentences = sentences.filter(s =>
        s.trim().length > 30 &&
        s.trim().length < 150 &&
        !s.includes('?') && // Avoid sentences that are already questions
        /\b(is|are|was|were|has|have|had|can|could|will|would|should|may|might)\b/i.test(s) // Has a verb
    );

    // Take up to 5 sentences
    const selectedSentences = goodSentences.slice(0, Math.min(5, goodSentences.length));

    if (selectedSentences.length === 0) {
        return [];
    }

    // Generate questions from sentences
    return selectedSentences.map((sentence, index) => {
        // Extract important words (nouns, etc.)
        const words = sentence.split(/\s+/).filter(w => w.length > 4);

        // Find a word to ask about
        const targetWord = words[Math.floor(Math.random() * words.length)] || "this";

        // Create a question
        const question = `What does the text say about ${targetWord.replace(/[^\w\s]/g, '')}?`;

        // Create answer options (one correct from the sentence, three made up)
        const correctAnswer = sentence.trim();
        const wrongAnswers = [
            `The text doesn't mention ${targetWord}.`,
            `${targetWord} is not important according to the text.`,
            `${targetWord} is mentioned but in a different context.`
        ];

        // Create answers array with correct answer first
        const answers = [correctAnswer, ...wrongAnswers];

        // Shuffle the answers and track the new position of the correct answer
        const shuffledAnswers = [];
        const indices = [0, 1, 2, 3];
        let correctIndex = 0;

        // Fisher-Yates shuffle
        while (indices.length > 0) {
            const randomIndex = Math.floor(Math.random() * indices.length);
            const answerIndex = indices[randomIndex];

            // Remove this index from the array
            indices.splice(randomIndex, 1);

            // Add the answer to the shuffled array
            shuffledAnswers.push(answers[answerIndex]);

            // If this was the correct answer, update the correctIndex
            if (answerIndex === 0) {
                correctIndex = shuffledAnswers.length - 1;
            }
        }

        // Return question object
        return {
            question: question,
            answers: shuffledAnswers,
            correct: correctIndex
        };
    });
}

// Function to manually extract questions from text when JSON parsing fails
function extractQuestionsManually(text) {
    const questions = [];

    // Look for question patterns
    const questionMatches = text.match(/["']question["']\s*:\s*["']([^"']+)["']/g);
    const answerMatches = text.match(/["']answers["']\s*:\s*\[(.*?)\]/g);
    const correctMatches = text.match(/["']correct["']\s*:\s*(\d+)/g);

    if (!questionMatches || !answerMatches || !correctMatches) {
        return [];
    }

    // Try to build questions from the matches
    for (let i = 0; i < Math.min(questionMatches.length, answerMatches.length, correctMatches.length); i++) {
        try {
            // Extract question text
            const questionText = questionMatches[i].match(/["']question["']\s*:\s*["']([^"']+)["']/)[1];

            // Extract answers array
            let answersText = answerMatches[i].match(/["']answers["']\s*:\s*\[(.*?)\]/)[1];
            const answers = answersText.split(',').map(a => {
                // Remove quotes and trim
                return a.replace(/["']/g, '').trim();
            }).filter(a => a.length > 0);

            // Extract correct answer index
            const correctIndex = parseInt(correctMatches[i].match(/["']correct["']\s*:\s*(\d+)/)[1]);

            // Add question if we have all the parts
            if (questionText && answers.length === 4 && correctIndex >= 0 && correctIndex < 4) {
                questions.push({
                    question: questionText,
                    answers: answers,
                    correct: correctIndex
                });
            }
        } catch (e) {
            console.error("Error extracting question manually:", e);
        }
    }

    return questions;
}

// Function to fix common JSON formatting issues
function fixJsonString(jsonString) {
    try {
        console.log("Attempting to fix JSON:", jsonString.substring(0, 100) + "...");

        // Remove any markdown code block markers
        let cleaned = jsonString.replace(/```json|```/g, '').trim();

        // Remove any trailing commas in arrays or objects
        cleaned = cleaned.replace(/,\s*([\]}])/g, '$1');

        // Fix missing quotes around property names
        cleaned = cleaned.replace(/([{,]\s*)([a-zA-Z0-9_]+)(\s*:)/g, '$1"$2"$3');

        // Fix single quotes to double quotes
        cleaned = cleaned.replace(/'/g, '"');

        // Fix escaped quotes
        cleaned = cleaned.replace(/\\"/g, '"').replace(/\\\\/g, '\\');

        // Remove any non-JSON text before the first [ or { and after the last ] or }
        const startMatch = cleaned.match(/[\[\{]/);
        const endMatch = cleaned.match(/[\]\}][^[\]\}]*$/);

        if (startMatch && endMatch) {
            const startIndex = startMatch.index;
            const endIndex = endMatch.index + 1;
            cleaned = cleaned.substring(startIndex, endIndex);
        }

        // Fix any unescaped newlines in strings
        cleaned = cleaned.replace(/"[^"]*"/, (match) => {
            return match.replace(/\n/g, '\\n');
        });

        console.log("Fixed JSON:", cleaned.substring(0, 100) + "...");

        // Try to parse the fixed JSON
        return JSON.parse(cleaned);
    } catch (e) {
        console.error("Failed to fix JSON:", e);
        return null;
    }
}

// Sample questions to use if server fails
const sampleQuestions = [
    {
        question: "What is the capital of France?",
        answers: ["London", "Berlin", "Paris", "Madrid"],
        correct: 2
    },
    {
        question: "Which planet is known as the Red Planet?",
        answers: ["Venus", "Mars", "Jupiter", "Saturn"],
        correct: 1
    },
    {
        question: "What is 2 + 2?",
        answers: ["3", "4", "5", "6"],
        correct: 1
    },
    {
        question: "Who wrote 'Romeo and Juliet'?",
        answers: ["Charles Dickens", "William Shakespeare", "Jane Austen", "Mark Twain"],
        correct: 1
    },
    {
        question: "Which element has the chemical symbol 'O'?",
        answers: ["Gold", "Oxygen", "Osmium", "Oganesson"],
        correct: 1
    },
    {
        question: "What is the largest mammal in the world?",
        answers: ["African Elephant", "Blue Whale", "Giraffe", "Polar Bear"],
        correct: 1
    }
];


function startQuiz(quizData) {
    document.getElementById("start-screen").style.display = "none";
    document.getElementById("quiz-container").style.display = "block";

    console.log("Quiz data:", quizData);
    console.log("Quiz data type:", Array.isArray(quizData) ? "Array" : typeof quizData);
    console.log("Quiz data length:", quizData ? quizData.length : 0);

    if (!quizData || !Array.isArray(quizData) || quizData.length === 0) {
        console.error("Invalid quiz data, using sample questions instead");
        quizData = sampleQuestions;
    }

    // Reset quiz state
    currentQuestionIndex = 0;
    score = 0;

    // Store the quiz data in a global variable
    questions = quizData;

    console.log("Starting quiz with questions:", questions);

    loadQuestion();
}


// Global variables for quiz state

let currentQuestionIndex = 0;
let selectedAnswer = null;
let score = 0;

const questionText = document.getElementById("question-text");
const answersContainer = document.getElementById("answers");
const submitBtn = document.getElementById("submit-btn");
const nextBtn = document.getElementById("next-btn");

// Global variable to store the current quiz questions
let questions = [];

function loadQuestion() {
    // Use the questions array that was set in startQuiz
    let q = questions[currentQuestionIndex];
    questionText.textContent = q.question;
    answersContainer.innerHTML = "";
    selectedAnswer = null;

    q.answers.forEach((answer, index) => {
        let btn = document.createElement("button");
        btn.textContent = answer;
        btn.classList.add("answer-btn");
        btn.addEventListener("click", () => selectAnswer(index, btn));
        answersContainer.appendChild(btn);
    });

    submitBtn.disabled = true;
    submitBtn.style.display = "block";
    nextBtn.style.display = "none";
}

function selectAnswer(index, button) {
    selectedAnswer = index;

    document.querySelectorAll(".answer-btn").forEach(btn => btn.classList.remove("selected"));
    button.classList.add("selected");

    submitBtn.disabled = false;
}

submitBtn.addEventListener("click", () => {
    let correctIndex = questions[currentQuestionIndex].correct;
    let buttons = document.querySelectorAll(".answer-btn");

    buttons[correctIndex].classList.add("correct");

    if (selectedAnswer !== correctIndex) {
        buttons[selectedAnswer].classList.add("incorrect");
    } else {
        score++;
    }

    buttons.forEach(btn => btn.disabled = true);

    submitBtn.style.display = "none";
    nextBtn.style.display = "block";
});

nextBtn.addEventListener("click", () => {
    currentQuestionIndex++;
    if (currentQuestionIndex < questions.length) {
        loadQuestion();
    } else {
        showResults();
    }
});

function showResults() {
    questionText.textContent = `Quiz Complete! Your score: ${score}/${questions.length}`;
    answersContainer.innerHTML = "";
    submitBtn.style.display = "none";
    nextBtn.style.display = "none";
}
