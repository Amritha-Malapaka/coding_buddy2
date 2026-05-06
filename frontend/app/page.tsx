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

  useEffect(() => {
    fetch(`${API_URL}/api/problems`)
      .then(res => res.json())
      .then(data => {
        setProblems(data)
        setLoading(false)
      })
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
        <h2 className="text-2xl font-semibold text-white mb-6">Problems</h2>
        
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
                  <span className="text-white font-medium">{problem.id}. {problem.title}</span>
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
