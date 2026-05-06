'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Problem {
  id: string
  title: string
  difficulty: string
}

const API_URL = 'http://localhost:5000'

export default function Home() {
  const [problems, setProblems] = useState<Problem[]>([])
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<{ id: string, username: string } | null>(null)
  const [progress, setProgress] = useState<{ solvedProblems: string[], totalSolved: number, streak: number } | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const problemRes = await fetch(`${API_URL}/api/problems`)
        if (problemRes.ok) {
          const problemData = await problemRes.json()
          setProblems(problemData)
        }

        try {
          const userRes = await fetch(`${API_URL}/api/me`, { credentials: 'include' })
          if (userRes.ok) {
            const userData = await userRes.json()
            setUser(userData)

            const progRes = await fetch(`${API_URL}/api/progress/${userData.id}`)
            if (progRes.ok) {
              const progData = await progRes.json()
              setProgress(progData)
            }
          }
        } catch (e) {
          console.error('Auth error', e)
        }
      } catch (e) {
        console.error('Error fetching data', e)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'Easy': return 'text-green-400'
      case 'Medium': return 'text-yellow-400'
      case 'Hard': return 'text-red-400'
      default: return 'text-gray-400'
    }
  }

  return (
    <main className="min-h-screen bg-[#0d1117]">
      <nav className="border-b border-[#30363d] px-6 py-4 flex justify-between items-center">
        <h1 className="text-xl font-bold text-white">Coding Platform</h1>
      </nav>

      <div className="max-w-4xl mx-auto p-6">
        <div className="flex justify-between items-end mb-6">
          <h2 className="text-2xl font-semibold text-white">Problems</h2>
          {progress && (
            <div className="text-sm bg-[#161b22] border border-[#30363d] px-4 py-2 rounded-lg text-[#c9d1d9]">
              <span className="font-medium text-white">{progress.totalSolved}</span> problems solved <span className="mx-2 text-[#30363d]">|</span> <span className="font-medium text-white">{progress.streak}</span> day streak 🔥
            </div>
          )}
        </div>
        
        {loading ? (
          <p className="text-[#8b949e]">Loading...</p>
        ) : (
          <div className="space-y-2">
            {problems.map((problem) => (
              <Link
                key={problem.id}
                href={`/problem/${problem.id}`}
                className="block p-4 bg-[#161b22] border border-[#30363d] rounded-lg hover:border-[#58a6ff] transition-colors"
              >
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <span className="text-white font-medium">{problem.id}. {problem.title}</span>
                    {progress?.solvedProblems.includes(problem.id) && (
                      <span className="text-green-500 flex items-center justify-center bg-green-500/10 rounded-full w-5 h-5 text-xs" title="Solved">✓</span>
                    )}
                  </div>
                  <span className={`${getDifficultyColor(problem.difficulty)} text-sm`}>
                    {problem.difficulty}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
