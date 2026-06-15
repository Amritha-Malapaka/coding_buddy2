const express = require('express');
const Groq = require('groq-sdk');
const { problems } = require('../data/store');

const router = express.Router();
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const MODEL = 'llama-3.3-70b-versatile';

router.post('/tutor', async (req, res) => {
  try {
    const {
      problemId,
      code,
      requestType,
      messageHistory = [],
      failedTestCase = null,
      userMessage = '',
      hintLevel,
      tutorName = 'Sage'
    } = req.body;

    if (!process.env.GROQ_API_KEY) {
      return res.status(500).json({ reply: 'GROQ_API_KEY is not configured.' });
    }

    if (!problemId || !code || !requestType) {
      return res.status(400).json({
        reply: 'problemId, code, and requestType are required.',
      });
    }

    const problem = problems.find((item) => item.id === problemId);
    if (!problem) {
      return res.status(404).json({ reply: 'Problem not found.' });
    }

    let systemPrompt = `You are ${tutorName}, a sharp coding tutor. Be warm but
extremely concise.

STRICT FORMAT RULES:
- Maximum 60 words total. Never exceed this.
- Use **bold** for max 2 key terms per response
- Use bullet points only when listing 2+ things (max 3 bullets)
- Each bullet = one short sentence
- Never use headers
- End with one short encouraging sentence (5 words max)

ABSOLUTE RULES:
- NEVER write code or pseudocode
- NEVER reveal the answer
- You MAY mention a line number that is wrong
- Plain English only — explain any jargon immediately

FOR EACH REQUEST TYPE:
why_failing → 1-2 sentences on what logic is wrong
what_to_do → 1 nudge + 1 leading question
explain_concept → 1 real-world analogy + 1 connection to the problem
hint level 1 → one vague sentence, no technique names
hint level 2 → name the technique, one sentence only
hint level 3 → 2-3 bullet steps, conceptual only`;

    if (requestType === 'hint') {
      if (hintLevel === 1) {
        systemPrompt +=
          `\n\nHINT LEVEL 1: Give a very vague conceptual nudge - one sentence only. Do not mention any data structures or algorithms by name.`;
      } else if (hintLevel === 2) {
        systemPrompt +=
          `\n\nHINT LEVEL 2: Name the general technique or data structure they should think about, but do not explain how to use it.`;
      } else if (hintLevel === 3) {
        systemPrompt +=
          `\n\nHINT LEVEL 3: Walk them through the conceptual approach step-by-step in plain English. Still no code.`;
      }
    }

    const promptContext = [
      `Request Type: ${requestType}`,
      `Problem Title: ${problem.title}`,
      `Problem Description: ${problem.description}`,
      failedTestCase ? `Failed Test Case Input: ${failedTestCase.input || ''}` : '',
      failedTestCase
        ? `Expected Output: ${failedTestCase.expected || failedTestCase.expectedOutput || ''}`
        : '',
      failedTestCase ? `Actual Output: ${failedTestCase.actual || ''}` : '',
      `Student Code:\n${code}`,
      userMessage ? `Student Message: ${userMessage}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: promptContext },
      ],
      model: MODEL,
    });

    const reply = completion.choices[0].message.content;
    res.json({ reply });
  } catch (error) {
    console.error('Tutor endpoint error:', error?.message || error);
    res.status(500).json({ reply: 'Failed to generate tutor response.' });
  }
});

router.post('/visualize', async (req, res) => {
  try {
    const { problemTitle, problemDescription, userCode, failedTestCase, concept } = req.body;

    if (!process.env.GROQ_API_KEY) {
      return res.status(500).json({ error: 'GROQ_API_KEY is not configured.' });
    }

    const failedTestCaseString = failedTestCase
      ? `Input: ${failedTestCase.input || ''}\nExpected: ${failedTestCase.expected || failedTestCase.expectedOutput || ''}\nActual: ${failedTestCase.actual || ''}`
      : 'No failed test case provided.';

    const prompt = `You are a visualization engine. Given a coding problem and a specific algorithm concept, generate a step-by-step JSON trace showing how the correct algorithm would process the given test input.

Return ONLY a raw JSON object. No markdown, no code fences, no explanation.
The JSON must follow this exact structure depending on the concept type:

For array/two-pointer/sliding-window problems:
{
  "type": "array",
  "array": [the actual input values as an array of numbers or strings],
  "pointers": ["left", "right"],  (only include pointers that are used)
  "steps": [
    {
      "pointerPositions": { "left": 0, "right": 3 },
      "highlightIndices": [0, 3],
      "activeIndices": [],
      "note": "one short sentence describing this step"
    }
  ],
  "result": "what the correct answer is"
}

For binary search problems:
{
  "type": "binary_search",
  "array": [sorted array values],
  "steps": [
    {
      "low": 0,
      "high": 7,
      "mid": 3,
      "note": "one short sentence"
    }
  ],
  "result": "the answer"
}

For hash map problems:
{
  "type": "hashmap",
  "steps": [
    {
      "processing": "current element being processed",
      "mapState": { "key": "value pairs in the map at this moment" },
      "note": "one short sentence"
    }
  ],
  "result": "the answer"
}

For tree/recursion problems:
{
  "type": "tree",
  "nodes": [
    { "id": 1, "value": "val", "children": [2, 3], "depth": 0 }
  ],
  "steps": [
    {
      "visitedNodes": [1],
      "currentNode": 1,
      "note": "one short sentence"
    }
  ],
  "result": "the answer"
}

Keep the steps array to a maximum of 8 steps. Use the ACTUAL values from the test input, not generic placeholders. The note for each step should describe what is happening conceptually, not just the indices.

Problem Title: ${problemTitle || 'General Problem'}
Problem Description: ${problemDescription || ''}
User's Code:
${userCode || ''}
Failed Test Case:
${failedTestCaseString}
Target Algorithm Concept: ${concept || 'array'}

Keep all step notes under 8 words each.`;

    const completion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: MODEL,
    });

    let text = completion.choices[0].message.content.trim();

    if (text.startsWith("```json")) {
      text = text.substring(7);
    } else if (text.startsWith("```")) {
      text = text.substring(3);
    }
    if (text.endsWith("```")) {
      text = text.substring(0, text.length - 3);
    }
    text = text.trim();

    try {
      const parsed = JSON.parse(text);
      return res.json(parsed);
    } catch (parseErr) {
      console.error('Failed to parse visualization response:', text);
      return res.json({ error: "Could not generate visualization for this problem type" });
    }

  } catch (error) {
    console.error('Visualize endpoint error:', error);
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

router.post('/ai-help', async (req, res) => {
  try {
    const {
      code,
      problem_description,
      failed_test_cases,
      error_message,
      user_question,
    } = req.body;

    const huggingFaceApiKey = process.env.HUGGINGFACE_API_KEY || '';
    const huggingFaceModel = 'mistralai/Mistral-7B-Instruct-v0.2';

    if (!huggingFaceApiKey) {
      return res.status(500).json({
        error: 'Hugging Face API key not configured',
        message: 'Please set HUGGINGFACE_API_KEY environment variable',
      });
    }

    let context = '';

    if (problem_description) {
      context += `Problem Description:\n${problem_description}\n\n`;
    }

    if (code) {
      context += `User's Current Code:\n\`\`\`\n${code}\n\`\`\`\n\n`;
    }

    if (failed_test_cases && failed_test_cases.length > 0) {
      context += 'Failed Test Cases:\n';
      failed_test_cases.forEach((test, index) => {
        context += `Test ${index + 1}:\n`;
        context += `  Input: ${test.input || 'N/A'}\n`;
        context += `  Expected: ${test.expectedOutput || 'N/A'}\n`;
        context += `  Actual: ${test.actualOutput || 'N/A'}\n`;
        if (test.error) context += `  Error: ${test.error}\n`;
      });
      context += '\n';
    }

    if (error_message) {
      context += `Error Message:\n${error_message}\n\n`;
    }

    const userQuery =
      user_question ||
      "Please help me understand what's wrong with my code and provide hints to fix it.";

    const prompt = `<s>[INST] You are a helpful coding mentor. Your role is to:
1. Analyze the user's code and the problem they're trying to solve
2. Identify issues or bugs without giving away the complete solution
3. Provide helpful hints, explanations, and guidance
4. Be encouraging and supportive

${context}

User's Question: ${userQuery}

Provide a helpful response that guides the user toward solving the problem themselves. Do not give the complete solution - instead, give hints, point out specific issues, suggest debugging strategies, or explain concepts they might be missing. Keep your response concise (2-4 paragraphs). [/INST]`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(
      `https://api-inference.huggingface.co/models/${huggingFaceModel}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${huggingFaceApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs: prompt,
          parameters: {
            max_new_tokens: 512,
            temperature: 0.7,
            top_p: 0.95,
            do_sample: true,
            return_full_text: false,
          },
        }),
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Hugging Face API error:', errorText);
      return res.status(500).json({
        error: 'Failed to get AI response',
        details: errorText,
      });
    }

    const result = await response.json();

    let aiResponse = '';
    if (Array.isArray(result) && result[0]?.generated_text) {
      aiResponse = result[0].generated_text.trim();
    } else if (result.generated_text) {
      aiResponse = result.generated_text.trim();
    } else {
      aiResponse =
        'I apologize, but I was unable to generate a helpful response. Please try rephrasing your question.';
    }

    res.json({ response: aiResponse });
  } catch (error) {
    console.error('AI Help error:', error);

    if (error.name === 'AbortError') {
      return res.status(504).json({
        error: 'Request timeout',
        message: 'The AI service took too long to respond. Please try again.',
      });
    }

    res.status(500).json({
      error: 'Internal server error',
      message: error.message,
    });
  }
});

router.post('/ai/adversarial', async (req, res) => {
  try {
    const { code, language, problemTitle, problemDescription, language_id, problemId } = req.body;

    if (!code || !problemId || !language_id) {
      return res.status(400).json({ error: 'code, problemId, and language_id are required' });
    }

    if (!process.env.GROQ_API_KEY) {
      return res.status(500).json({ error: 'GROQ_API_KEY is not configured.' });
    }

    const attackPrompt = `You are a competitive programmer trying to BREAK this solution. Read the code carefully and find its weaknesses.

Generate 5 adversarial test inputs that might cause this specific code to fail. Target these vulnerability types:
1. Integer overflow or very large numbers
2. Empty or null-like input
3. All same values (e.g. [5,5,5,5])
4. Already sorted or reverse sorted
5. Single element

For each, explain WHY you think it might break this specific code — reference actual lines you see.

Return ONLY JSON:
{
  "attacks": [
    {
      "input": "the exact stdin string to test",
      "targetedWeakness": "one sentence about what you see in their code that this exploits",
      "confidence": "will_break" | "might_break" | "probably_fine"
    }
  ]
}`;

    const promptContext = `Problem Title: ${problemTitle}
Problem Description: ${problemDescription}
Language: ${language}
Student Code:
${code}`;

    const attackCompletion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: attackPrompt },
        { role: 'user', content: promptContext },
      ],
      model: MODEL,
    });

    let text = attackCompletion.choices[0].message.content.trim();
    if (text.startsWith("```json")) {
      text = text.substring(7);
    } else if (text.startsWith("```")) {
      text = text.substring(3);
    }
    if (text.endsWith("```")) {
      text = text.substring(0, text.length - 3);
    }
    text = text.trim();

    let parsedAttacks;
    try {
      const parsed = JSON.parse(text);
      parsedAttacks = parsed.attacks || [];
    } catch (parseErr) {
      console.error('Failed to parse attacks JSON:', text);
      return res.status(500).json({ error: 'Failed to generate valid attack inputs from AI.' });
    }

    if (parsedAttacks.length === 0) {
      return res.status(500).json({ error: 'No attacks generated.' });
    }

    parsedAttacks = parsedAttacks.slice(0, 5);

    const problem = problems.find(p => p.id === problemId);

    const inputsToSolve = [];
    const expectedOutputs = new Array(parsedAttacks.length).fill(null);

    parsedAttacks.forEach((attack, idx) => {
      if (problem && problem.testCases) {
        const match = problem.testCases.find(tc =>
          tc.input.trim() === attack.input.trim() ||
          tc.input.trim().replace(/\r\n/g, '\n') === attack.input.trim().replace(/\r\n/g, '\n')
        );
        if (match) {
          expectedOutputs[idx] = match.expectedOutput;
        }
      }
      if (expectedOutputs[idx] === null) {
        inputsToSolve.push({ idx, input: attack.input });
      }
    });

    if (inputsToSolve.length > 0) {
      const solverPrompt = `You are an expert competitive programmer and a correct reference solver.
Given the following problem description, generate the exact expected output (stdout) for each of the provided inputs.

Problem Title: ${problemTitle}
Problem Description: ${problemDescription}

Inputs to solve:
${inputsToSolve.map((item, i) => `--- Input ${i+1} ---\n${item.input}`).join('\n\n')}

For each input, solve the problem correctly.
Return ONLY a JSON array containing the exact expected stdout strings for each input in the same order. Do not include any explanation or markdown formatting.
Example format:
[
  "output for Input 1",
  "output for Input 2",
  ...
]`;

      const solverCompletion = await groq.chat.completions.create({
        messages: [{ role: 'user', content: solverPrompt }],
        model: MODEL,
      });

      let solverText = solverCompletion.choices[0].message.content.trim();
      if (solverText.startsWith("```json")) {
        solverText = solverText.substring(7);
      } else if (solverText.startsWith("```")) {
        solverText = solverText.substring(3);
      }
      if (solverText.endsWith("```")) {
        solverText = solverText.substring(0, solverText.length - 3);
      }
      solverText = solverText.trim();

      try {
        const solvedOutputs = JSON.parse(solverText);
        inputsToSolve.forEach((item, i) => {
          expectedOutputs[item.idx] = solvedOutputs[i];
        });
      } catch (err) {
        console.error('Failed to parse solver JSON:', solverText);
        inputsToSolve.forEach((item) => {
          expectedOutputs[item.idx] = '';
        });
      }
    }

    const submissions = parsedAttacks.map(attack => ({
      source_code: code,
      language_id: language_id,
      stdin: attack.input
    }));

    const { executeBatch, normalizeOutput } = require('../services/judge0');
    const runResults = await executeBatch(submissions);

    const attacksResult = parsedAttacks.map((attack, idx) => {
      const run = runResults[idx];
      const expected = expectedOutputs[idx] || '';

      const survived = run.status?.id === 3 &&
                       normalizeOutput(run.stdout) === normalizeOutput(expected);

      return {
        input: attack.input,
        targetedWeakness: attack.targetedWeakness,
        confidence: attack.confidence,
        survived,
        actual: run.stdout || run.stderr || run.compile_output || '',
        expected: expected
      };
    });

    const survivedCount = attacksResult.filter(a => a.survived).length;
    const verdict = survivedCount === 5 ? 'Battle Hardened' : 'Needs Hardening';

    let tip = '';
    if (survivedCount < 5) {
      const failedAttacks = attacksResult.filter(a => !a.survived);
      const tipPrompt = `You are Sage, a wise and friendly coding tutor.
The student's code failed on some adversarial test inputs:
${failedAttacks.map((a, i) => `${i+1}. Input: "${a.input}" | Targeted Weakness: "${a.targetedWeakness}"`).join('\n')}

Student's code:
${code}

Give a one-sentence conceptual tip to the student on how to improve/harden their code against these specific failures. Do not write any code. Keep it under 30 words.`;

      try {
        const tipCompletion = await groq.chat.completions.create({
          messages: [{ role: 'user', content: tipPrompt }],
          model: MODEL,
        });
        tip = tipCompletion.choices[0].message.content.trim();
      } catch (tipErr) {
        console.error('Failed to generate tip:', tipErr);
      }
    }

    res.json({
      attacks: attacksResult,
      survived: survivedCount,
      total: 5,
      verdict,
      tip
    });

  } catch (error) {
    console.error('Adversarial endpoint error:', error);
    res.status(500).json({ error: 'Failed to run adversarial analysis.' });
  }
});

module.exports = router;
