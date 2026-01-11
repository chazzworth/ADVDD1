import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { Ghost } from 'lucide-react';

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const { login } = useAuth();
    const navigate = useNavigate();
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            await login(email, password);
            navigate('/');
        } catch (err) {
            setError('Failed to login. Check credentials.');
        }
    };

    return (
        <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl p-8">
                <div className="flex flex-col items-center mb-6">
                    <div className="bg-red-900/20 p-3 rounded-full mb-4">
                        <Ghost className="w-8 h-8 text-red-500" />
                    </div>
                    <h1 className="text-2xl font-bold text-zinc-100">AI Dungeon Master</h1>
                    <p className="text-zinc-400 text-sm">Welcome back, adventurer.</p>
                </div>

                {error && <div className="bg-red-900/20 text-red-400 p-3 rounded mb-4 text-sm text-center">{error}</div>}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-zinc-400 mb-1">Email</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-zinc-100 focus:outline-none focus:border-red-500 transition-colors"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-zinc-400 mb-1">Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-zinc-100 focus:outline-none focus:border-red-500 transition-colors"
                            required
                        />
                    </div>
                    <button
                        type="submit"
                        className="w-full bg-red-600 hover:bg-red-700 text-white font-medium py-2 rounded transition-colors"
                    >
                        Login
                    </button>
                </form>
                <div className="mt-4 text-center text-sm text-zinc-500">
                    Need an account? <Link to="/register" className="text-red-400 hover:text-red-300">Register</Link>
                </div>
            </div>
        </div>
    );
}
