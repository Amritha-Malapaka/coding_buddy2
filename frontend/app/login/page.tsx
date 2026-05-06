'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function Login() {
  const router = useRouter()

  useEffect(() => {
    // Auth disabled - redirect to home
    router.push('/')
  }, [router])

  return (
    <main className="min-h-screen bg-[#0d1117] flex items-center justify-center">
      <p className="text-[#8b949e]">Redirecting...</p>
    </main>
  )
}
