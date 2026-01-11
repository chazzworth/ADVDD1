import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { Send, ArrowLeft, Dices, User, Bot, Backpack, Heart, Shield, Zap, Activity } from 'lucide-react';

export default function GameSession() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [campaign, setCampaign] = useState(null);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const messagesEndRef = useRef(null);
    const [apiKey, setApiKey] = useState('');
    const [showSettings, setShowSettings] = useState(false);

    useEffect(() => {
        fetchCampaign();
    }, [id]);

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    const fetchCampaign = async () => {
        try {
            const res = await api.get(`/game/campaigns/${id}`);
            setCampaign(res.data);
            setMessages(res.data.messages);
        } catch (error) {
            console.error("Failed to load campaign", error);
        } finally {
            setLoading(false);
        }
    };

    const handleSend = async (e) => {
        e.preventDefault();
        if (!input.trim() || sending) return;

        // Optimistic Update
        const userMsg = { role: 'user', content: input, createdAt: new Date().toISOString() };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setSending(true);

        try {
            const res = await api.post(`/game/campaigns/${id}/message`, {
                content: userMsg.content,
                apiKey: apiKey
            });
            // Handle new response format { message, character? }
            const { message, character } = res.data;

            // Fallback if old API format (just message)
            const incomingMsg = message || res.data;

            setMessages(prev => [...prev, incomingMsg]);

            if (character) {
                setCampaign(prev => ({ ...prev, character }));
            }

        } catch (error) {
            console.error("Failed to send message", error);
            setMessages(prev => [...prev, { role: 'system', content: "Error: The Dungeon Master is silent (Failed to connect). Check API Key." }]);
        } finally {
            setSending(false);
        }
    };

    const handleRoll = async (diceType) => {
        if (sending) return;

        const sides = parseInt(diceType.substring(1));
        const result = Math.floor(Math.random() * sides) + 1;
        const rollMessage = `*Rolls ${diceType}... Result: ${result}*`;

        // Optimistic Update
        const userMsg = { role: 'user', content: rollMessage, createdAt: new Date().toISOString() };
        setMessages(prev => [...prev, userMsg]);
        setSending(true);

        try {
            const res = await api.post(`/game/campaigns/${id}/message`, {
                content: rollMessage,
                apiKey: apiKey
            });
            // Handle new response format { message, character? }
            const { message, character } = res.data;
            const incomingMsg = message || res.data;

            setMessages(prev => [...prev, incomingMsg]);

            if (character) {
                setCampaign(prev => ({ ...prev, character }));
            }
        } catch (error) {
            console.error("Failed to send roll", error);
            setMessages(prev => [...prev, { role: 'system', content: "Error: Failed to send roll to DM." }]);
        } finally {
            setSending(false);
        }
    };

    if (loading) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-500">Summoning the DM...</div>;

    return (
        <div className="flex h-screen bg-zinc-950 text-zinc-100 overflow-hidden font-sans">
            {/* Sidebar / Context Panel */}
            <aside className="w-80 bg-zinc-900 border-r border-zinc-800 flex-col hidden md:flex">
                <div className="p-4 border-b border-zinc-800 flex items-center gap-2">
                    <button onClick={() => navigate('/')} className="hover:bg-zinc-800 p-2 rounded-full transition-colors">
                        <ArrowLeft className="w-5 h-5 text-zinc-400" />
                    </button>
                    <h2 className="font-bold truncate">{campaign?.name}</h2>
                </div>

                <div className="flex-1 p-4 overflow-y-auto">
                    {campaign?.character && (
                        <div className="space-y-4 mb-4">
                            {/* Vitals */}
                            <div className="bg-zinc-950/50 p-4 rounded-lg border border-zinc-800">
                                <h3 className="text-xs uppercase tracking-wider text-zinc-500 font-bold mb-3 flex items-center gap-2">
                                    <Activity className="w-4 h-4" /> Vitals
                                </h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-zinc-900 p-2 rounded border border-zinc-800 flex items-center gap-3">
                                        <Heart className="w-5 h-5 text-red-500" />
                                        <div>
                                            <div className="text-xs text-zinc-500">HP</div>
                                            <div className="font-bold text-lg">{campaign.character.hp} <span className="text-zinc-600 text-xs">/ {campaign.character.maxHp}</span></div>
                                        </div>
                                    </div>
                                    <div className="bg-zinc-900 p-2 rounded border border-zinc-800 flex items-center gap-3">
                                        <Shield className="w-5 h-5 text-blue-500" />
                                        <div>
                                            <div className="text-xs text-zinc-500">AC</div>
                                            <div className="font-bold text-lg">{campaign.character.ac}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Stats */}
                            <div className="bg-zinc-950/50 p-4 rounded-lg border border-zinc-800">
                                <h3 className="text-xs uppercase tracking-wider text-zinc-500 font-bold mb-3 flex items-center gap-2">
                                    <Zap className="w-4 h-4" /> Attributes
                                </h3>
                                <div className="grid grid-cols-3 gap-2 text-center">
                                    {Object.entries({
                                        STR: campaign.character.strength,
                                        DEX: campaign.character.dexterity,
                                        CON: campaign.character.constitution,
                                        INT: campaign.character.intelligence,
                                        WIS: campaign.character.wisdom,
                                        CHA: campaign.character.charisma
                                    }).map(([stat, val]) => (
                                        <div key={stat} className="bg-zinc-900 p-1.5 rounded border border-zinc-800">
                                            <div className="text-[10px] text-zinc-500 font-bold">{stat}</div>
                                            <div className="text-sm font-mono text-zinc-300">{val}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Inventory */}
                            <div className="bg-zinc-950/50 p-4 rounded-lg border border-zinc-800">
                                <h3 className="text-xs uppercase tracking-wider text-zinc-500 font-bold mb-3 flex items-center gap-2">
                                    <Backpack className="w-4 h-4" /> Inventory
                                </h3>
                                <div className="text-sm text-zinc-400 leading-relaxed max-h-40 overflow-y-auto pr-2 space-y-1">
                                    {campaign.character.inventory ? (
                                        <div className="whitespace-pre-wrap">{campaign.character.inventory}</div>
                                    ) : (
                                        <ul className="list-disc list-inside space-y-1">
                                            <li>Basic Clothing</li>
                                            <li>Rations (1 week)</li>
                                            <li>Waterskin</li>
                                            <li>Flint & Steel</li>
                                            <li>50ft Hempen Rope</li>
                                            <li>Torches (x3)</li>
                                            <li className="italic text-zinc-600">...and class starter kit.</li>
                                        </ul>
                                    )}
                                </div>
                            </div>

                            {/* Coin Pouch */}
                            <div className="bg-zinc-950/50 p-4 rounded-lg border border-zinc-800">
                                <h3 className="text-xs uppercase tracking-wider text-zinc-500 font-bold mb-3 flex items-center gap-2">
                                    Coin Pouch
                                </h3>
                                <div className="grid grid-cols-5 gap-1 bg-zinc-900 p-2 rounded border border-zinc-800">
                                    <div className="text-center">
                                        <div className="text-[10px] text-zinc-500 uppercase">PP</div>
                                        <div className="text-sm font-bold text-zinc-300">{campaign.character.pp || 0}</div>
                                    </div>
                                    <div className="text-center">
                                        <div className="text-[10px] text-yellow-600 uppercase">GP</div>
                                        <div className="text-sm font-bold text-yellow-500">{campaign.character.gp || 0}</div>
                                    </div>
                                    <div className="text-center">
                                        <div className="text-[10px] text-zinc-500 uppercase">EP</div>
                                        <div className="text-sm font-bold text-zinc-300">{campaign.character.ep || 0}</div>
                                    </div>
                                    <div className="text-center">
                                        <div className="text-[10px] text-zinc-400 uppercase">SP</div>
                                        <div className="text-sm font-bold text-zinc-300">{campaign.character.sp || 0}</div>
                                    </div>
                                    <div className="text-center">
                                        <div className="text-[10px] text-orange-700 uppercase">CP</div>
                                        <div className="text-sm font-bold text-orange-600">{campaign.character.cp || 0}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {!campaign?.character && (
                        <div className="bg-zinc-950/50 p-4 rounded-lg border border-zinc-800 mb-4">
                            <h3 className="text-xs uppercase tracking-wider text-zinc-500 font-bold mb-2">Character Info</h3>
                            <div className="text-sm text-zinc-400 italic">Freeform Mode (No Sheet)</div>
                        </div>
                    )}

                    <div className="bg-zinc-950/50 p-4 rounded-lg border border-zinc-800">
                        <h3 className="text-xs uppercase tracking-wider text-zinc-500 font-bold mb-2 flex items-center gap-2">
                            <Dices className="w-4 h-4" /> Dice Roller
                        </h3>
                        <div className="grid grid-cols-3 gap-2">
                            {['d4', 'd6', 'd8', 'd10', 'd12', 'd20'].map(d => (
                                <button
                                    key={d}
                                    onClick={() => handleRoll(d)}
                                    disabled={sending}
                                    className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 py-1 rounded text-xs font-mono transition-colors"
                                >
                                    {d}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="p-4 border-t border-zinc-800">
                    <div className="flex justify-between items-center text-xs text-zinc-600">
                        <span>v1.3.0</span>
                        <span>Powered by Claude 4.5</span>
                    </div>
                </div>
            </aside>

            {/* Main Chat Area */}
            <main className="flex-1 flex flex-col min-w-0 relative">
                <div className="absolute top-4 right-4 text-xs text-zinc-600 font-mono z-20 select-none pointer-events-none">
                    v1.3.0
                </div>
                <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6">
                    {messages.length === 0 && (
                        <div className="text-center text-zinc-500 my-20">
                            <p>The tale begins...</p>
                            <p className="text-sm mt-2">Say hello to your Dungeon Master.</p>
                        </div>
                    )}

                    {messages.map((msg, idx) => (
                        <div key={idx} className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            {msg.role !== 'user' && (
                                <div className="w-8 h-8 rounded-full bg-red-900/30 flex items-center justify-center shrink-0">
                                    <Bot className="w-5 h-5 text-red-500" />
                                </div>
                            )}
                            <div className={`max-w-[80%] rounded-2xl px-5 py-3 text-sm leading-relaxed ${msg.role === 'user'
                                ? 'bg-zinc-800 text-zinc-100 rounded-tr-none'
                                : 'bg-zinc-900 border border-zinc-800 text-zinc-300 rounded-tl-none prose prose-invert max-w-none whitespace-pre-wrap'
                                }`}>
                                {msg.content} {/* In real app, markdown render here */}
                            </div>
                            {msg.role === 'user' && (
                                <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center shrink-0">
                                    <User className="w-5 h-5 text-zinc-400" />
                                </div>
                            )}
                        </div>
                    ))}
                    {sending && (
                        <div className="flex gap-4 justify-start">
                            <div className="w-8 h-8 rounded-full bg-red-900/30 flex items-center justify-center shrink-0">
                                <Bot className="w-5 h-5 text-red-500" />
                            </div>
                            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl rounded-tl-none px-5 py-3">
                                <span className="flex gap-1">
                                    <span className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce"></span>
                                    <span className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce delay-100"></span>
                                    <span className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce delay-200"></span>
                                </span>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                <div className="p-4 border-t border-zinc-800 bg-zinc-900/50 backdrop-blur-sm">
                    <form onSubmit={handleSend} className="max-w-4xl mx-auto flex gap-3">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="What do you do?"
                            className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 focus:outline-none focus:border-red-500 transition-colors shadow-inner"
                        />
                        <button
                            type="submit"
                            disabled={!input.trim() || sending}
                            className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white p-3 rounded-xl transition-colors shadow-lg shadow-red-900/20"
                        >
                            <Send className="w-5 h-5" />
                        </button>
                    </form>
                </div>
            </main>
        </div>
    );
}
