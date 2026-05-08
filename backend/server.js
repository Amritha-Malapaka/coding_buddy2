require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
  origin: "http://localhost:3000",
  credentials: true
}));
app.use(express.json());

// Ensure data directory exists
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const PROGRESS_FILE = path.join(DATA_DIR, 'progress.json');
if (!fs.existsSync(PROGRESS_FILE)) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify({}));
}

// Mock database
const demoUsers = [
  { id: '1', username: 'admin', password: 'admin' },
  { id: '2', username: 'user1', password: 'pass1' },
  { id: '3', username: 'user2', password: 'pass2' }
];

const users = demoUsers.map((user) => {
  const isBcryptHash = typeof user.password === 'string' && user.password.startsWith('$2');
  return {
    ...user,
    password: isBcryptHash ? user.password : bcrypt.hashSync(user.password, 10)
  };
});

const PROBLEMS_FILE = path.join(DATA_DIR, 'problems.json');
let problems = [];
try {
  if (fs.existsSync(PROBLEMS_FILE)) {
    const problemsContent = fs.readFileSync(PROBLEMS_FILE, 'utf8');
    problems = JSON.parse(problemsContent);
  } else {
    console.warn('problems.json not found in data directory.');
  }
} catch (error) {
  console.error('Error loading problems.json:', error);
}

const JWT_SECRET = process.env.JWT_SECRET || '';

const getTokenFromCookieHeader = (cookieHeader) => {
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(';').map((part) => part.trim());
  const tokenCookie = cookies.find((cookie) => cookie.startsWith('token='));
  if (!tokenCookie) return null;

  return decodeURIComponent(tokenCookie.substring('token='.length));
};

// Routes
app.get('/api/problems', (req, res) => {
  const problemList = problems.map(p => ({
    id: p.id,
    title: p.title,
    difficulty: p.difficulty
  }));
  res.json(problemList);
});

app.get('/api/problems/:id', (req, res) => {
  const problem = problems.find(p => p.id === req.params.id);
  if (!problem) {
    return res.status(404).json({ error: 'Problem not found' });
  }
  res.json(problem);
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = users.find(u => u.username === username);

  if (!JWT_SECRET) {
    return res.status(500).json({ error: 'JWT_SECRET is not configured' });
  }

  if (!user || !bcrypt.compareSync(password || '', user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign(
    { userId: user.id, username: user.username },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'strict'
  });

  const safeUser = { id: user.id, username: user.username };
  res.json(safeUser);
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    sameSite: 'strict'
  });
  res.json({ message: 'Logged out successfully' });
});

app.get('/api/me', (req, res) => {
  const token = getTokenFromCookieHeader(req.headers.cookie);

  if (!JWT_SECRET) {
    return res.status(500).json({ error: 'JWT_SECRET is not configured' });
  }

  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return res.json({ id: decoded.userId, username: decoded.username });
  } catch (error) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
});

// --- Progress Tracking Endpoints ---

app.post('/api/progress/solve', (req, res) => {
  const { userId, problemId, language, timeTaken } = req.body;

  if (!userId || !problemId || !language) {
    return res.status(400).json({ error: 'userId, problemId, and language are required' });
  }

  let progressData = {};
  try {
    const fileContent = fs.readFileSync(PROGRESS_FILE, 'utf8');
    progressData = JSON.parse(fileContent);
  } catch (error) {
    console.error('Error reading progress file:', error);
  }

  if (!progressData[userId]) {
    progressData[userId] = {
      solves: []
    };
  }

  const userProgress = progressData[userId];

  // Check if already solved
  const alreadySolved = userProgress.solves.some(solve => solve.problemId === problemId);

  if (!alreadySolved) {
    userProgress.solves.push({
      problemId,
      language,
      timeTaken: timeTaken || 0,
      timestamp: new Date().toISOString()
    });

    try {
      fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progressData, null, 2));
    } catch (error) {
      console.error('Error writing progress file:', error);
      return res.status(500).json({ error: 'Failed to save progress' });
    }
  }

  res.json({ success: true, message: 'Progress updated', alreadySolved });
});

app.get('/api/progress/:userId', (req, res) => {
  const { userId } = req.params;

  let progressData = {};
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      const fileContent = fs.readFileSync(PROGRESS_FILE, 'utf8');
      progressData = JSON.parse(fileContent);
    }
  } catch (error) {
    console.error('Error reading progress file:', error);
    return res.status(500).json({ error: 'Failed to read progress' });
  }

  const userProgress = progressData[userId] || { solves: [] };
  
  const solvedProblems = userProgress.solves.map(s => s.problemId);
  const totalSolved = solvedProblems.length;

  // Calculate streak: consecutive days with at least one solve up to today or yesterday
  let streak = 0;
  if (userProgress.solves.length > 0) {
    // Sort solves by date descending
    const sortedSolves = [...userProgress.solves].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    const uniqueDates = Array.from(new Set(sortedSolves.map(s => new Date(s.timestamp).toISOString().split('T')[0])));
    
    const todayStr = new Date().toISOString().split('T')[0];
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    let currentDateStr = todayStr;
    
    if (uniqueDates.includes(todayStr) || uniqueDates.includes(yesterdayStr)) {
        if (!uniqueDates.includes(todayStr)) {
           currentDateStr = yesterdayStr;
        }
        
        let currentCheckDate = new Date(currentDateStr);
        
        for (const dateStr of uniqueDates) {
           if (dateStr === currentCheckDate.toISOString().split('T')[0]) {
              streak++;
              currentCheckDate.setDate(currentCheckDate.getDate() - 1);
           } else if (new Date(dateStr) < currentCheckDate) {
              break; // Date gap found
           }
        }
    }
  }

  res.json({
    solvedProblems,
    totalSolved,
    streak
  });
});

const PISTON_API_URL = 'https://emkc.org/api/v2/piston/execute';
const PISTON_LANGUAGES = {
  python: { language: 'python', version: '3.10.0' },
  javascript: { language: 'javascript', version: '18.15.0' },
  java: { language: 'java', version: '15.0.2' },
  cpp: { language: 'cpp', version: '10.2.0' }
};

app.post('/api/run-code', async (req, res) => {
  try {
    const { code, language, problemId } = req.body;

    if (!code || !language || !problemId) {
      return res.status(400).json({
        error: 'code, language, and problemId are required'
      });
    }

    const runtime = PISTON_LANGUAGES[language];
    if (!runtime) {
      return res.status(400).json({
        error: 'Unsupported language. Supported: python, javascript, java, cpp'
      });
    }

    const problem = problems.find(p => p.id === problemId);
    if (!problem) {
      return res.status(404).json({ error: 'Problem not found' });
    }

    const testCases = problem.testCases || [];
    if (testCases.length === 0) {
      return res.status(400).json({ error: 'No test cases available for this problem' });
    }

    const results = [];
    let passed = 0;
    let executionError = null;

    for (const testCase of testCases) {
      const pistonResponse = await fetch(PISTON_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          language: runtime.language,
          version: runtime.version,
          files: [{ content: code }],
          stdin: testCase.input || ''
        })
      });

      if (!pistonResponse.ok) {
        const errorText = await pistonResponse.text();
        return res.status(502).json({
          error: `Piston API request failed: ${errorText}`
        });
      }

      const executionResult = await pistonResponse.json();
      const compileError = executionResult.compile?.stderr || executionResult.compile?.output || '';
      const runtimeError = executionResult.run?.stderr || '';
      const actualOutput = (executionResult.run?.stdout || '').trim();
      const expectedOutput = (testCase.expectedOutput || '').trim();
      const testPassed = !compileError && !runtimeError && actualOutput === expectedOutput;

      if (testPassed) {
        passed += 1;
      }

      if (!executionError && (compileError || runtimeError)) {
        executionError = compileError || runtimeError;
      }

      results.push({
        input: testCase.input || '',
        expected: testCase.expectedOutput || '',
        actual: actualOutput,
        passed: testPassed
      });
    }

    return res.json({
      passed,
      total: testCases.length,
      results,
      error: executionError
    });
  } catch (error) {
    console.error('Piston run-code error:', error);
    return res.status(500).json({
      passed: 0,
      total: 0,
      results: [],
      error: error.message || 'Internal server error'
    });
  }
});

app.post('/api/tutor', async (req, res) => {
  try {
    const {
      problemId,
      code,
      requestType,
      messageHistory = [],
      failedTestCase = null,
      userMessage = '',
      hintLevel
    } = req.body;

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ reply: 'GEMINI_API_KEY is not configured.' });
    }

    if (!problemId || !code || !requestType) {
      return res.status(400).json({ reply: 'problemId, code, and requestType are required.' });
    }

    const problem = problems.find(p => p.id === problemId);
    if (!problem) {
      return res.status(404).json({ reply: 'Problem not found.' });
    }

    let systemPrompt = "You are a coding tutor helping a student debug their solution. You follow \nthese strict rules:\n1. NEVER write any code or code snippets, not even one line or pseudocode\n2. NEVER reveal the solution or any part of it\n3. You MAY mention a specific line number in the student's code that is \n   problematic, but only describe what is wrong conceptually\n4. When requestType is 'why_failing': explain in plain English why the \n   approach or logic is failing for the given test case\n5. When requestType is 'what_to_do': give a conceptual nudge — describe \n   what the correct thinking should be, without saying how to code it\n6. When requestType is 'explain_concept': explain the underlying concept \n   (e.g. two pointers, recursion, hash maps) in simple terms with a \n   real-world analogy\n7. Keep responses under 150 words. Be encouraging and friendly.";

    if (requestType === 'hint') {
      if (hintLevel === 1) {
        systemPrompt += "\n\nHINT LEVEL 1 INSTRUCTION: Give a very vague conceptual nudge — one sentence only. Do not mention any data structures or algorithms by name.";
      } else if (hintLevel === 2) {
        systemPrompt += "\n\nHINT LEVEL 2 INSTRUCTION: Name the general technique or data structure they should think about, but do not explain how to use it for this problem.";
      } else if (hintLevel === 3) {
        systemPrompt += "\n\nHINT LEVEL 3 INSTRUCTION: Walk them through the conceptual approach step by step in plain English. Still no code. This is the most help you will ever give.";
      }
    }

    const promptContext = [
      `Request Type: ${requestType}`,
      `Problem Title: ${problem.title}`,
      `Problem Description: ${problem.description}`,
      failedTestCase ? `Failed Test Case Input: ${failedTestCase.input || ''}` : '',
      failedTestCase ? `Expected Output: ${failedTestCase.expected || failedTestCase.expectedOutput || ''}` : '',
      failedTestCase ? `Actual Output: ${failedTestCase.actual || ''}` : '',
      `Student Code:\n${code}`,
      userMessage ? `Student Message: ${userMessage}` : ''
    ].filter(Boolean).join('\n\n');

    const messages = [
      { role: 'user', parts: [{ text: `${systemPrompt}\n\n${promptContext}` }] },
      ...messageHistory.map((message) => ({
        role: message.role === 'assistant' || message.role === 'model' ? 'model' : 'user',
        parts: [{ text: typeof message.content === 'string' ? message.content : '' }]
      }))
    ];

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent({ contents: messages });
    const reply = result.response.text();

    return res.json({ reply });
  } catch (error) {
    console.error('Tutor endpoint error:', error);
    return res.status(500).json({ reply: 'Failed to generate tutor response.' });
  }
});

// Judge0 API Configuration
const JUDGE0_API_URL = 'https://ce.judge0.com';

// Language IDs for Judge0
const LANGUAGE_IDS = {
  'c': 50,
  'cpp': 54,
  'python': 71,
  'python3': 71,
  'javascript': 63,
  'java': 62
};

// Submit code to Judge0 and get result
app.post('/run-code', async (req, res) => {
  try {
    const { source_code, language_id, stdin = '' } = req.body;

    if (!source_code) {
      return res.status(400).json({ error: 'source_code is required' });
    }

    if (!language_id) {
      return res.status(400).json({ error: 'language_id is required' });
    }

    // Step 1: Submit code to Judge0
    const submissionData = {
      source_code: source_code,
      language_id: parseInt(language_id),
      stdin: stdin
    };

    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    console.log('Submitting code to Judge0...');

    const submitResponse = await fetch(`${JUDGE0_API_URL}/submissions?base64_encoded=false&wait=false`, {
      method: 'POST',
      headers,
      body: JSON.stringify(submissionData)
    });

    if (!submitResponse.ok) {
      const error = await submitResponse.text();
      console.error('Judge0 submission error:', error);
      return res.status(500).json({ error: 'Failed to submit code', details: error });
    }

    const { token } = await submitResponse.json();
    console.log('Submission token:', token);

    // Step 2: Poll for result
    let result = null;
    let attempts = 0;
    const maxAttempts = 30; // 30 seconds timeout

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second

      const resultResponse = await fetch(`${JUDGE0_API_URL}/submissions/${token}?base64_encoded=false`, {
        headers
      });

      if (!resultResponse.ok) {
        console.error('Error fetching result, attempt:', attempts + 1);
        attempts++;
        continue;
      }

      result = await resultResponse.json();
      console.log('Status:', result.status?.description, 'Attempt:', attempts + 1);

      // Check if processing is complete
      if (result.status?.id !== 1 && result.status?.id !== 2) { // Not "In Queue" or "Processing"
        break;
      }

      attempts++;
    }

    if (!result) {
      return res.status(504).json({ error: 'Timeout waiting for execution result' });
    }

    const response = {
      status: {
        id: result.status?.id,
        description: result.status?.description
      },
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      compile_output: result.compile_output || '',
      message: result.message || '',
      time: result.time,
      memory: result.memory,
      token: token
    };

    console.log('Execution completed:', result.status?.description);
    res.json(response);

  } catch (error) {
    console.error('Run code error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Get submission result by token (for checking status later)
app.get('/submissions/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const headers = {
      'Accept': 'application/json'
    };

    const response = await fetch(`${JUDGE0_API_URL}/submissions/${token}?base64_encoded=false`, {
      headers
    });

    if (!response.ok) {
      return res.status(500).json({ error: 'Failed to fetch submission' });
    }

    const result = await response.json();

    res.json({
      status: result.status,
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      compile_output: result.compile_output || '',
      time: result.time,
      memory: result.memory
    });

  } catch (error) {
    console.error('Get submission error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Submit solution - run all test cases
app.post('/submit', async (req, res) => {
  try {
    const { problem_id, source_code, language_id } = req.body;

    if (!problem_id || !source_code || !language_id) {
      return res.status(400).json({ error: 'problem_id, source_code, and language_id are required' });
    }

    const problem = problems.find(p => p.id === problem_id);
    if (!problem) {
      return res.status(404).json({ error: 'Problem not found' });
    }

    if (!problem.testCases || problem.testCases.length === 0) {
      return res.status(400).json({ error: 'No test cases available for this problem' });
    }

    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    const results = [];
    let allPassed = true;

    // Run each test case sequentially
    for (let i = 0; i < problem.testCases.length; i++) {
      const testCase = problem.testCases[i];
      console.log(`Running test case ${i + 1}/${problem.testCases.length} for problem ${problem_id}`);

      // Submit code to Judge0
      const submissionData = {
        source_code: source_code,
        language_id: parseInt(language_id),
        stdin: testCase.input
      };

      const submitResponse = await fetch(`${JUDGE0_API_URL}/submissions?base64_encoded=false&wait=false`, {
        method: 'POST',
        headers,
        body: JSON.stringify(submissionData)
      });

      if (!submitResponse.ok) {
        results.push({
          testCase: i + 1,
          passed: false,
          error: 'Failed to submit code',
          input: testCase.input,
          expectedOutput: testCase.expectedOutput,
          actualOutput: ''
        });
        allPassed = false;
        continue;
      }

      const { token } = await submitResponse.json();

      // Poll for result
      let result = null;
      let attempts = 0;
      const maxAttempts = 30;

      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000));

        const resultResponse = await fetch(`${JUDGE0_API_URL}/submissions/${token}?base64_encoded=false`, {
          headers
        });

        if (!resultResponse.ok) {
          attempts++;
          continue;
        }

        result = await resultResponse.json();

        if (result.status?.id !== 1 && result.status?.id !== 2) {
          break;
        }

        attempts++;
      }

      if (!result) {
        results.push({
          testCase: i + 1,
          passed: false,
          error: 'Timeout',
          input: testCase.input,
          expectedOutput: testCase.expectedOutput,
          actualOutput: ''
        });
        allPassed = false;
        continue;
      }

      // Check if execution was successful
      if (result.status?.id !== 3) { // Not Accepted
        results.push({
          testCase: i + 1,
          passed: false,
          error: result.status?.description || 'Execution failed',
          stderr: result.stderr || '',
          compile_output: result.compile_output || '',
          input: testCase.input,
          expectedOutput: testCase.expectedOutput,
          actualOutput: result.stdout || ''
        });
        allPassed = false;
        continue;
      }

      // Compare output (trim whitespace)
      const actualOutput = (result.stdout || '').trim();
      const expectedOutput = testCase.expectedOutput.trim();
      const passed = actualOutput === expectedOutput;

      if (!passed) {
        allPassed = false;
      }

      results.push({
        testCase: i + 1,
        passed,
        input: testCase.input,
        expectedOutput: testCase.expectedOutput,
        actualOutput: actualOutput,
        time: result.time,
        memory: result.memory
      });
    }

    const response = {
      problem_id,
      overallStatus: allPassed ? 'Accepted' : 'Wrong Answer',
      totalTestCases: problem.testCases.length,
      passedTestCases: results.filter(r => r.passed).length,
      testResults: results
    };

    console.log(`Submission completed: ${response.overallStatus} (${response.passedTestCases}/${response.totalTestCases})`);
    res.json(response);

  } catch (error) {
    console.error('Submit error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Hugging Face AI Help Endpoint
const HUGGINGFACE_API_KEY = process.env.HUGGINGFACE_API_KEY || '';
const HUGGINGFACE_MODEL = 'mistralai/Mistral-7B-Instruct-v0.2';

app.post('/ai-help', async (req, res) => {
  try {
    const { code, problem_description, failed_test_cases, error_message, user_question } = req.body;

    if (!HUGGINGFACE_API_KEY) {
      return res.status(500).json({ 
        error: 'Hugging Face API key not configured',
        message: 'Please set HUGGINGFACE_API_KEY environment variable'
      });
    }

    // Build context from available data
    let context = '';
    
    if (problem_description) {
      context += `Problem Description:\n${problem_description}\n\n`;
    }
    
    if (code) {
      context += `User's Current Code:\n\`\`\`\n${code}\n\`\`\`\n\n`;
    }
    
    if (failed_test_cases && failed_test_cases.length > 0) {
      context += `Failed Test Cases:\n`;
      failed_test_cases.forEach((test, idx) => {
        context += `Test ${idx + 1}:\n`;
        context += `  Input: ${test.input || 'N/A'}\n`;
        context += `  Expected: ${test.expectedOutput || 'N/A'}\n`;
        context += `  Actual: ${test.actualOutput || 'N/A'}\n`;
        if (test.error) context += `  Error: ${test.error}\n`;
      });
      context += `\n`;
    }
    
    if (error_message) {
      context += `Error Message:\n${error_message}\n\n`;
    }

    // Build the prompt for the AI
    const userQuery = user_question || 'Please help me understand what\'s wrong with my code and provide hints to fix it.';
    
    const prompt = `<s>[INST] You are a helpful coding mentor. Your role is to:
1. Analyze the user's code and the problem they're trying to solve
2. Identify issues or bugs without giving away the complete solution
3. Provide helpful hints, explanations, and guidance
4. Be encouraging and supportive

${context}

User's Question: ${userQuery}

Provide a helpful response that guides the user toward solving the problem themselves. Do not give the complete solution - instead, give hints, point out specific issues, suggest debugging strategies, or explain concepts they might be missing. Keep your response concise (2-4 paragraphs). [/INST]`;

    console.log('Calling Hugging Face API...');
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    const response = await fetch(`https://api-inference.huggingface.co/models/${HUGGINGFACE_MODEL}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${HUGGINGFACE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          max_new_tokens: 512,
          temperature: 0.7,
          top_p: 0.95,
          do_sample: true,
          return_full_text: false
        }
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Hugging Face API error:', errorText);
      return res.status(500).json({ 
        error: 'Failed to get AI response',
        details: errorText
      });
    }

    const result = await response.json();
    
    // Extract generated text from response
    let aiResponse = '';
    if (Array.isArray(result) && result[0]?.generated_text) {
      aiResponse = result[0].generated_text.trim();
    } else if (result.generated_text) {
      aiResponse = result.generated_text.trim();
    } else {
      aiResponse = 'I apologize, but I was unable to generate a helpful response. Please try rephrasing your question.';
    }

    console.log('AI response generated successfully');
    res.json({ response: aiResponse });

  } catch (error) {
    console.error('AI Help error:', error);
    
    if (error.name === 'AbortError') {
      return res.status(504).json({ 
        error: 'Request timeout',
        message: 'The AI service took too long to respond. Please try again.'
      });
    }
    
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Judge0 API URL: ${JUDGE0_API_URL}`);
  console.log(`Hugging Face Model: ${HUGGINGFACE_MODEL}`);
});
