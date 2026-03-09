// using native node fetch

const prompt = `You are a math teacher. Generate a quiz for a student in Grade 5 on the topic: "Fractions".
Generate exactly 5 questions. Distribute questions across these types: multiple_choice, true_false.

You MUST return the output as a SINGLE, VALID JSON ARRAY.
Do NOT wrap the JSON in markdown code blocks (\`\`\`json ... \`\`\`).
Do NOT add any introductory or concluding text. 
Start the response directly with '[' and end with ']'.

Use this exact structure for items in the array:

For multiple_choice:
{ "type": "multiple_choice", "question": "...", "options": ["A. ...", "B. ...", "C. ...", "D. ..."], "answer": "A", "explanation": "..." }

Make all numbers and values randomised so every student gets a unique set. Questions must be at the correct difficulty for Grade 5.`;

try {
    console.log('Sending request to Ollama URL: http://localhost:11434/api/chat');
    const res = await fetch("http://localhost:11434/api/chat", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'llama3', // Standard local model format
            messages: [{ role: 'user', content: prompt }],
            stream: false,
        }),
    });

    console.log('Ollama response status:', res.status, res.statusText);
    if (!res.ok) {
        const errText = await res.text();
        console.error('Ollama Error Text:', errText);
        process.exit(1);
    }

    const data = await res.json();
    const raw = data.message?.content || '';
    console.log("RAW RESPONSE RECIEVED -> LENGTH:", raw.length);
    console.log(raw.slice(0, 500) + '...');
} catch (err) {
    console.error('Fetch Failed:', err.message);
}
