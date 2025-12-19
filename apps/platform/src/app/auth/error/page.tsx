'use client'

import Link from 'next/link'

export default function AuthError() {
    return (
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-900 via-slate-900 to-black">
            <div className="text-center space-y-6 p-8 bg-white/10 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/20 max-w-md">
                <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto border border-red-500/30">
                    <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                </div>

                <h1 className="text-2xl font-bold text-white">Authentication Error</h1>
                <p className="text-gray-400">
                    There was a problem signing you in. This could be due to an invalid or expired link.
                </p>

                <Link
                    href="/"
                    className="inline-block bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white px-6 py-3 rounded-lg font-semibold transition-all duration-200 hover:scale-105 shadow-lg hover:shadow-cyan-500/50"
                >
                    Return to Home
                </Link>
            </div>
        </div>
    )
}
