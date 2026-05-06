'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import Editor from '@monaco-editor/react'

interface Example {
  input: string
  output: string
  explanation?: string
}

interface Problem {
  id: string
  title: string
  difficulty: string
  description: string
  examples: Example[]
  constraints: string[]
}

interface RunCodeResult {
  input: string
  expected: string
  actual: string
  passed: boolean
}

type Language = 'python' | 'c' | 'cpp' | 'java' | 'javascript'
type TabType = 'code' | 'output'

const API_URL = 'http://localhost:5000'

const defaultCode: Record<Language, string> = {
  python: `# Read input from stdin
data = input().strip().split()
n = int(data[0])
nums = list(map(int, data[1:n+1]))
target = int(data[n+1])

# Write your solution here
def twoSum(nums, target):
    # Your code
    pass

result = twoSum(nums, target)
print(result)`,
  c: `#include <stdio.h>

int main() {
    int n;
    scanf("%d", &n);
    
    int nums[10000];
    for (int i = 0; i < n; i++) {
        scanf("%d", &nums[i]);
    }
    
    int target;
    scanf("%d", &target);
    
    // Write your solution here
    printf("0 1\\n");
    
    return 0;
}`,
  cpp: `#include <iostream>
#include <vector>
using namespace std;

int main() {
    int n;
    cin >> n;
    
    vector<int> nums(n);
    for (int i = 0; i < n; i++) {
        cin >> nums[i];
    }
    
    int target;
    cin >> target;
    
    // Write your solution here
    cout << "0 1" << endl;
    
    return 0;
}`,
  java: `import java.util.Scanner;

public class Solution {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        
        int n = sc.nextInt();
        int[] nums = new int[n];
        for (int i = 0; i < n; i++) {
            nums[i] = sc.nextInt();
        }
        int target = sc.nextInt();
        
        // Write your solution here
        System.out.println("0 1");
    }
}`,
  javascript: `const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

let input = [];
rl.on('line', (line) => {
    input.push(...line.trim().split(/\\s+/));
});

rl.on('close', () => {
    const n = parseInt(input[0]);
    const nums = input.slice(1, n + 1).map(Number);
    const target = parseInt(input[n + 1]);
    
    // Write your solution here
    console.log("0 1");
});`
}

export default function ProblemPage() {
  const params = useParams()
  const [problem, setProblem] = useState<Problem | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [language, setLanguage] = useState<Language>('python')
  const [code, setCode] = useState(defaultCode.python)
  const [testInput, setTestInput] = useState('')
  const [useCustomInput, setUseCustomInput] = useState(false)
  const [output, setOutput] = useState('')
  const [isRunning, setIsRunning] = useState(false)
  const [activeTab, setActiveTab] = useState<TabType>('code')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showAiMentor, setShowAiMentor] = useState(false)
  const [aiMessages, setAiMessages] = useState<{role: 'user' | 'ai', content: string}[]>([
    { role: 'ai', content: 'Hi! I\'m your AI mentor. I can help you understand the problem, provide hints, or review your code. What would you like help with?' }
  ])
  const [aiInput, setAiInput] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [runResults, setRunResults] = useState<RunCodeResult[]>([])
  const [runSummary, setRunSummary] = useState<{ passed: number; total: number } | null>(null)
  const [runError, setRunError] = useState<string | null>(null)

  // Keyboard shortcut for exiting fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isFullscreen])

  useEffect(() => {
    fetch(`${API_URL}/api/problems/${params.id}`)
      .then(res => {
        if (!res.ok) throw new Error('Problem not found')
        return res.json()
      })
      .then(data => {
        setProblem(data)
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [params.id])

  useEffect(() => {
    setCode(defaultCode[language])
  }, [language])

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'Easy': return 'text-green-400'
      case 'Medium': return 'text-yellow-400'
      case 'Hard': return 'text-red-400'
      default: return 'text-gray-400'
    }
  }

  const getDifficultyBg = (difficulty: string) => {
    switch (difficulty) {
      case 'Easy': return 'bg-green-400/10'
      case 'Medium': return 'bg-yellow-400/10'
      case 'Hard': return 'bg-red-400/10'
      default: return 'bg-gray-400/10'
    }
  }

  // Language ID mapping for Judge0
  const languageIds: Record<Language, number> = {
    'python': 71,
    'c': 50,
    'cpp': 54,
    'java': 62,
    'javascript': 63
  }

  const handleAiHelp = async () => {
    if (!aiInput.trim()) return

    const userMessage = aiInput.trim()
    setAiMessages(prev => [...prev, { role: 'user', content: userMessage }])
    setAiInput('')
    setAiLoading(true)

    try {
      const response = await fetch('http://localhost:5000/ai-help', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          code: code,
          problem_description: problem?.description,
          user_question: userMessage
        })
      })

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to get AI response');
      }

      const result = await response.json()
      setAiMessages(prev => [...prev, { role: 'ai', content: result.response }])
    } catch (error) {
      setAiMessages(prev => [...prev, { 
        role: 'ai', 
        content: `Sorry, I couldn't process your request. ${error instanceof Error ? error.message : 'Please try again.'}`
      }])
    } finally {
      setAiLoading(false)
    }
  }

  const handleRunCode = async () => {
    if (!problem) return

    setIsRunning(true)
    setRunResults([])
    setRunSummary(null)
    setRunError(null)

    try {
      const response = await fetch('http://localhost:5000/api/run-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          code,
          language,
          problemId: problem.id
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to execute code')
      }

      const result = await response.json()
      setRunResults(result.results || [])
      setRunSummary({ passed: result.passed || 0, total: result.total || 0 })
      if (result.error) {
        setRunError(result.error)
      }
    } catch (error) {
      setRunError(error instanceof Error ? error.message : 'Failed to run code')
    } finally {
      setIsRunning(false)
    }
  }

  const handleSubmit = async () => {
    if (!problem) return;

    setIsRunning(true)
    setActiveTab('output')
    setOutput('Submitting... Running test cases...\n\n')

    try {
      const response = await fetch('http://localhost:5000/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          problem_id: problem.id,
          source_code: code,
          language_id: languageIds[language]
        })
      })

      if (!response.ok) {
        throw new Error('Failed to submit solution')
      }

      const result = await response.json()

      // Format test case results
      let outputText = ''

      // Overall status
      const isAccepted = result.overallStatus === 'Accepted'
      outputText += `${isAccepted ? '✅' : '❌'} ${result.overallStatus}\n\n`
      outputText += `Test Cases: ${result.passedTestCases}/${result.totalTestCases} passed\n\n`
      outputText += '─'.repeat(50) + '\n\n'

      // Individual test case results
      result.testResults.forEach((test: any, index: number) => {
        outputText += `Test Case ${test.testCase}: ${test.passed ? '✅ PASSED' : '❌ FAILED'}\n`

        if (!test.passed) {
          if (test.error) {
            outputText += `  Error: ${test.error}\n`
            if (test.stderr) {
              outputText += `  stderr: ${test.stderr}\n`
            }
            if (test.compile_output) {
              outputText += `  Compile: ${test.compile_output}\n`
            }
          }
          outputText += `  Input: ${test.input || '(empty)'}\n`
          outputText += `  Expected: ${test.expectedOutput}\n`
          outputText += `  Actual: ${test.actualOutput || '(empty)'}\n`
        } else {
          if (test.time) {
            outputText += `  Time: ${test.time}s\n`
          }
          if (test.memory) {
            outputText += `  Memory: ${test.memory} KB\n`
          }
        }

        outputText += '\n'
      })

      setOutput(outputText.trim())
    } catch (error) {
      setOutput(`Error: ${error instanceof Error ? error.message : 'Failed to submit'}\n\nPlease make sure the backend server is running on http://localhost:5000`)
    } finally {
      setIsRunning(false)
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#0d1117] flex items-center justify-center">
        <p className="text-[#8b949e]">Loading...</p>
      </main>
    )
  }

  if (error || !problem) {
    return (
      <main className="min-h-screen bg-[#0d1117] flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error || 'Problem not found'}</p>
          <Link href="/" className="text-[#58a6ff] hover:underline">
            Back to problems
          </Link>
        </div>
      </main>
    )
  }

  return (
    <div className="h-screen bg-[#0d1117] flex flex-col">
      {/* Navigation Bar */}
      <nav className="border-b border-[#30363d] px-4 py-3 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Link 
            href="/" 
            className="text-[#8b949e] hover:text-white transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6"/>
            </svg>
          </Link>
          <div className="h-4 w-px bg-[#30363d]"></div>
          <h1 className="text-lg font-semibold text-white">{problem.id}. {problem.title}</h1>
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${getDifficultyColor(problem.difficulty)} ${getDifficultyBg(problem.difficulty)}`}>
            {problem.difficulty}
          </span>
          <div className="flex-1"></div>
          <button
            onClick={() => setShowAiMentor(!showAiMentor)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              showAiMentor
                ? 'bg-[#8b5cf6] text-white'
                : 'bg-[#1f2937] text-[#c9d1d9] hover:bg-[#374151]'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a3 3 0 0 0-3 3v14a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
              <path d="M19 10a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0v-7a3 3 0 0 0-3-3Z"/>
              <path d="M5 10a3 3 0 0 0-3 3v4a3 3 0 0 0 6 0v-4a3 3 0 0 0-3-3Z"/>
            </svg>
            Get AI Help
          </button>
        </div>
      </nav>

      {/* Main Content - Split Screen */}
      <div className={`flex-1 flex overflow-hidden ${isFullscreen ? 'fixed inset-0 z-50 bg-[#0d1117]' : ''}`}>
        {/* Left Panel - Problem Description (hidden in fullscreen) */}
        <div className={`${isFullscreen ? 'hidden' : 'w-1/2'} border-r border-[#30363d] overflow-y-auto bg-[#0d1117]`}>
          <div className="max-w-2xl mx-auto px-6 py-5">
            {/* Title */}
            <h1 className="text-xl font-bold text-white mb-4">{problem.title}</h1>

            {/* Description */}
            {(() => {
              const parts = problem.description.split('Input Format:')
              const mainDesc = parts[0].trim()
              const inputFormat = parts[1]?.trim()

              return (
                <>
                  {/* Main Description */}
                  <section className="mb-5">
                    <p className="text-[#c9d1d9] text-[15px] leading-7">{mainDesc}</p>
                  </section>

                  {/* Input Format Box */}
                  {inputFormat && (
                    <section className="mb-5">
                      <h3 className="text-white font-semibold text-sm mb-2">Input Format</h3>
                      <div className="bg-[#1f2937] border-l-4 border-[#58a6ff] rounded-r-md p-4">
                        <div className="space-y-1">
                          {inputFormat.split('\n').map((line, idx) => (
                            <p key={idx} className="text-[#c9d1d9] text-[14px] leading-6">
                              {line.trim()}
                            </p>
                          ))}
                        </div>
                      </div>
                    </section>
                  )}
                </>
              )
            })()}

            {/* Examples */}
            {problem.examples.map((example, idx) => (
              <section key={idx} className="mb-5">
                <h3 className="text-white font-semibold text-sm mb-2">Example {idx + 1}:</h3>
                <div className="bg-[#0d1117] border border-[#30363d] rounded-md overflow-hidden">
                  {/* Input Block */}
                  <div className="border-b border-[#30363d]">
                    <div className="bg-[#161b22] px-3 py-1.5 text-[12px] font-medium text-[#8b949e]">Input</div>
                    <pre className="px-3 py-2 text-[#c9d1d9] font-mono text-[13px] leading-5 whitespace-pre-wrap">{example.input}</pre>
                  </div>
                  {/* Output Block */}
                  <div>
                    <div className="bg-[#161b22] px-3 py-1.5 text-[12px] font-medium text-[#8b949e]">Output</div>
                    <pre className="px-3 py-2 text-[#c9d1d9] font-mono text-[13px] leading-5 whitespace-pre-wrap">{example.output}</pre>
                  </div>
                </div>
                {example.explanation && (
                  <p className="mt-2 text-[#8b949e] text-[13px] leading-5">{example.explanation}</p>
                )}
              </section>
            ))}

            {/* Constraints */}
            <section className="mb-4">
              <h3 className="text-white font-semibold text-sm mb-2">Constraints:</h3>
              <div className="bg-[#161b22] border border-[#30363d]/50 rounded-md p-3">
                <ul className="space-y-1.5">
                  {problem.constraints.map((constraint, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-[#8b949e] mt-1.5">•</span>
                      <code className="text-[#c9d1d9] font-mono text-[12px] leading-5">{constraint}</code>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          </div>
        </div>

        {/* Right Panel - Code Editor */}
        <div className={`${isFullscreen ? 'w-full' : 'w-1/2'} flex flex-col bg-[#0d1117] overflow-hidden`}>
          {/* Tabs */}
          <div className="flex items-center justify-between border-b border-[#30363d] bg-[#161b22] flex-shrink-0">
            <div className="flex">
              <button
                onClick={() => setActiveTab('code')}
                className={`px-4 py-2.5 text-sm font-medium transition-colors ${
                  activeTab === 'code'
                    ? 'text-white border-b-2 border-[#58a6ff]'
                    : 'text-[#8b949e] hover:text-white'
                }`}
              >
                Code
              </button>
              <button
                onClick={() => setActiveTab('output')}
                className={`px-4 py-2.5 text-sm font-medium transition-colors ${
                  activeTab === 'output'
                    ? 'text-white border-b-2 border-[#58a6ff]'
                    : 'text-[#8b949e] hover:text-white'
                }`}
              >
                Output
              </button>
            </div>
            {/* Fullscreen Toggle Button */}
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="px-3 py-2 mr-2 text-[#8b949e] hover:text-white transition-colors"
              title={isFullscreen ? 'Exit Fullscreen (Esc)' : 'Enter Fullscreen'}
            >
              {isFullscreen ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/>
                  <path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/>
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/>
                  <path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>
                </svg>
              )}
            </button>
          </div>

          {/* Editor or Output Area - Scrollable */}
          <div className="flex-1 min-h-0 relative">
            {activeTab === 'code' ? (
              <Editor
                height="100%"
                language={language}
                value={code}
                onChange={(value) => setCode(value || '')}
                theme="vs-dark"
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                  lineNumbers: 'on',
                  roundedSelection: false,
                  scrollBeyondLastLine: false,
                  readOnly: false,
                  automaticLayout: true,
                  padding: { top: 16 },
                  fontFamily: 'JetBrains Mono, Consolas, monospace',
                }}
              />
            ) : (
              <div className="h-full p-4 overflow-y-auto bg-[#0d1117]">
                <pre className="text-[#c9d1d9] text-sm font-mono whitespace-pre-wrap leading-relaxed">
                  {output || 'Click "Run" to see output or "Submit" to test your solution...'}
                </pre>
              </div>
            )}
          </div>

          {/* Bottom Controls Bar - Always Visible */}
          <div className="border-t border-[#30363d] bg-[#161b22] flex-shrink-0">
            <div className="p-3 space-y-2 max-h-[200px] overflow-y-auto">
              {/* Custom Input Toggle */}
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useCustomInput}
                    onChange={(e) => setUseCustomInput(e.target.checked)}
                    className="w-4 h-4 rounded border-[#30363d] bg-[#0d1117] text-[#58a6ff] focus:ring-[#58a6ff] focus:ring-offset-0"
                  />
                  <span className="text-[#c9d1d9] text-sm">Use custom input</span>
                </label>
              </div>

              {/* Custom Input Textarea */}
              {useCustomInput && (
                <div className="animate-in slide-in-from-top-2 duration-200">
                  <textarea
                    value={testInput}
                    onChange={(e) => setTestInput(e.target.value)}
                    placeholder="Enter custom input here..."
                    className="w-full h-16 bg-[#0d1117] text-[#c9d1d9] text-sm p-2.5 rounded border border-[#30363d] focus:border-[#58a6ff] focus:outline-none resize-none font-mono leading-relaxed"
                  />
                </div>
              )}

              {/* Language Selector & Action Buttons */}
              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-2">
                  <span className="text-[#8b949e] text-sm">Language:</span>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value as Language)}
                    className="bg-[#0d1117] text-white text-sm px-3 py-1.5 rounded border border-[#30363d] focus:border-[#58a6ff] focus:outline-none cursor-pointer"
                  >
                    <option value="python">Python</option>
                    <option value="c">C</option>
                    <option value="cpp">C++</option>
                    <option value="java">Java</option>
                    <option value="javascript">JavaScript</option>
                  </select>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handleRunCode}
                    disabled={isRunning}
                    className="px-5 py-1.5 text-sm text-white bg-[#1f6feb] rounded hover:bg-[#388bfd] disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors flex items-center gap-2"
                  >
                    {isRunning ? (
                      <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    ) : null}
                    {isRunning ? 'Running...' : 'Run Code'}
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={isRunning}
                    className="px-5 py-1.5 text-sm text-white bg-[#238636] rounded hover:bg-[#2ea043] disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
                  >
                    Submit
                  </button>
                </div>
              </div>

              {(runError || runSummary || runResults.length > 0) && (
                <div className="mt-3 space-y-3">
                  {runError && (
                    <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-md p-3 text-sm whitespace-pre-wrap">
                      {runError}
                    </div>
                  )}

                  {runSummary && (
                    <div className="text-sm text-[#c9d1d9]">
                      Passed {runSummary.passed} / {runSummary.total} test cases
                    </div>
                  )}

                  {runResults.length > 0 && (
                    <div className="space-y-2">
                      {runResults.map((result, index) => (
                        <div
                          key={`${index}-${result.input}`}
                          className="border border-[#30363d] rounded-md p-3 bg-[#0d1117]"
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <span className={result.passed ? 'text-green-400' : 'text-red-400'}>
                              {result.passed ? '✅' : '❌'}
                            </span>
                            <span className="text-sm font-medium text-white">Test Case {index + 1}</span>
                          </div>
                          <div className="space-y-1 text-xs">
                            <p className="text-[#8b949e]">Input:</p>
                            <pre className="text-[#c9d1d9] font-mono whitespace-pre-wrap">{result.input || '(empty)'}</pre>
                            <p className="text-[#8b949e]">Expected Output:</p>
                            <pre className="text-[#c9d1d9] font-mono whitespace-pre-wrap">{result.expected || '(empty)'}</pre>
                            <p className="text-[#8b949e]">Actual Output:</p>
                            <pre className="text-[#c9d1d9] font-mono whitespace-pre-wrap">{result.actual || '(empty)'}</pre>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* AI Mentor Panel */}
        {showAiMentor && (
          <div className="w-80 border-l border-[#30363d] bg-[#0d1117] flex flex-col animate-in slide-in-from-right-4 duration-200">
            {/* Header */}
            <div className="border-b border-[#30363d] px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#10b981]"></div>
                <h3 className="text-white font-semibold text-sm">AI Mentor</h3>
              </div>
              <button
                onClick={() => setShowAiMentor(false)}
                className="text-[#8b949e] hover:text-white transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18"/>
                  <path d="m6 6 12 12"/>
                </svg>
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {aiMessages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[90%] rounded-lg px-3 py-2 text-[13px] leading-5 ${
                    msg.role === 'user'
                      ? 'bg-[#1f6feb] text-white'
                      : 'bg-[#1f2937] text-[#c9d1d9] border border-[#30363d]'
                  }`}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {aiLoading && (
                <div className="flex justify-start">
                  <div className="bg-[#1f2937] border border-[#30363d] rounded-lg px-3 py-2 flex items-center gap-2">
                    <div className="flex gap-1">
                      <span className="w-1.5 h-1.5 bg-[#8b949e] rounded-full animate-bounce"></span>
                      <span className="w-1.5 h-1.5 bg-[#8b949e] rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></span>
                      <span className="w-1.5 h-1.5 bg-[#8b949e] rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></span>
                    </div>
                    <span className="text-[#8b949e] text-xs">Thinking...</span>
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="border-t border-[#30363d] p-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={aiInput}
                  onChange={(e) => setAiInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAiHelp()}
                  placeholder="Ask for help..."
                  className="flex-1 bg-[#161b22] text-white text-sm px-3 py-2 rounded border border-[#30363d] focus:border-[#8b5cf6] focus:outline-none"
                />
                <button
                  onClick={handleAiHelp}
                  disabled={aiLoading || !aiInput.trim()}
                  className="px-3 py-2 bg-[#8b5cf6] text-white rounded hover:bg-[#7c3aed] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m22 2-7 20-4-9-9-4 20-7z"/>
                  </svg>
                </button>
              </div>
              <p className="mt-2 text-[#6e7681] text-[11px]">
                Tips: Ask for hints, explanations, or code review
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
