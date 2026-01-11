import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { Link, useLocation } from 'react-router-dom';
import { Plus, Scroll, LogOut, Loader, Gamepad2, Trash2 } from 'lucide-react';

export default function Dashboard() {
    // ... (existing state)
    const [deleting, setDeleting] = useState(null);

    // ... (existing useEffect/fetchData)

    const handleDelete = async (e, id) => {
        e.preventDefault(); // Prevent Link navigation
        if (!window.confirm("Are you sure you want to delete this campaign? This cannot be undone.")) return;

        setDeleting(id);
        try {
            await api.delete(`/game/campaigns/${id}`);
            setCampaigns(campaigns.filter(c => c.id !== id));
        } catch (error) {
            console.error("Failed to delete campaign", error);
            alert("Failed to delete campaign");
        } finally {
            setDeleting(null);
        }
    };

    const { user, logout } = useAuth();
    const [campaigns, setCampaigns] = useState([]);
    const [characters, setCharacters] = useState([]);
    const [loading, setLoading] = useState(true);
    const [newCampaignName, setNewCampaignName] = useState('');
    const [selectedChar, setSelectedChar] = useState('');
    const [selectedModel, setSelectedModel] = useState('claude-haiku-4-5-20251001');
    const [customInstructions, setCustomInstructions] = useState('');
    const [creating, setCreating] = useState(false);
    const location = useLocation();

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const [campRes, charRes] = await Promise.all([
                api.get('/game/campaigns'),
                api.get('/characters')
            ]);
            setCampaigns(campRes.data);
            setCharacters(charRes.data);

            // Check for redirected character ID
            if (location.state?.newCharacterId) {
                setSelectedChar(location.state.newCharacterId);
                // Clearing state safely could be done here, but removing unsafe replaceState for stability
            } else if (charRes.data.length > 0) {
                // Default select most recent character if exists
                setSelectedChar(charRes.data[0].id);
            }
        } catch (error) {
            console.error("Failed to fetch data", error);
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        if (!newCampaignName.trim()) return;

        setCreating(true);
        try {
            const res = await api.post('/game/campaigns', {
                name: newCampaignName,
                aiModel: selectedModel,
                characterId: selectedChar || null,
                customInstructions: customInstructions
            });
            setCampaigns([res.data, ...campaigns]);
            setNewCampaignName('');
            setCustomInstructions('');
        } catch (error) {
            console.error("Failed to create campaign", error);
        } finally {
            setCreating(false);
        }
    };

    return (
        <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans">
            <nav className="border-b border-zinc-800 bg-zinc-900 px-6 py-4 flex justify-between items-center">
                <div className="flex items-center gap-2">
                    <Gamepad2 className="text-red-500" />
                    <h1 className="text-xl font-bold">Dungeon Master AI</h1>
                </div>
                <div className="flex items-center gap-4">
                    <span className="text-sm text-zinc-400">Logged in as {user.email}</span>
                    <button onClick={logout} className="p-2 hover:bg-zinc-800 rounded-full transition-colors" title="Logout">
                        <LogOut className="w-5 h-5 text-zinc-400" />
                    </button>
                </div>
            </nav>

            <main className="max-w-5xl mx-auto p-6 md:p-12">
                <div className="flex justify-between items-end mb-8">
                    <div>
                        <h2 className="text-3xl font-bold text-white mb-2">Your Adventures</h2>
                        <p className="text-zinc-400">Select a campaign to request the Dungeon Master's attention.</p>
                    </div>
                    <Link to="/create-character" className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded text-sm flex items-center gap-2 transition-colors border border-zinc-700">
                        <Plus className="w-4 h-4" /> Create Character
                    </Link>
                </div>

                {/* Create New Campaign Section */}
                <div className="mb-10 bg-zinc-900/50 p-6 rounded-xl border border-zinc-800">
                    <h3 className="text-sm uppercase tracking-wide text-zinc-500 mb-4 font-bold">Start New Campaign</h3>
                    <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                        <div className="md:col-span-2">
                            <label className="block text-xs text-zinc-400 mb-1">Campaign Name</label>
                            <input
                                type="text"
                                placeholder="The Dark Tower..."
                                className="w-full bg-zinc-950 border border-zinc-800 rounded px-4 py-2.5 focus:outline-none focus:border-red-500 transition-colors"
                                value={newCampaignName}
                                onChange={(e) => setNewCampaignName(e.target.value)}
                            />
                        </div>

                        <div>
                            <label className="block text-xs text-zinc-400 mb-1">Character</label>
                            <select
                                className="w-full bg-zinc-950 border border-zinc-800 rounded px-4 py-2.5 focus:outline-none focus:border-red-500 transition-colors text-zinc-300"
                                value={selectedChar}
                                onChange={(e) => setSelectedChar(e.target.value)}
                            >
                                <option value="">No Character (Freeform)</option>
                                {characters.map(c => (
                                    <option key={c.id} value={c.id}>{c.name} (Lvl {c.level} {c.class})</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs text-zinc-400 mb-1">DM Intelligence (Model)</label>
                            <select
                                className="w-full bg-zinc-950 border border-zinc-800 rounded px-4 py-2.5 focus:outline-none focus:border-red-500 transition-colors text-zinc-300"
                                value={selectedModel}
                                onChange={(e) => setSelectedModel(e.target.value)}
                            >
                                <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5 (Fast)</option>
                                <option value="claude-sonnet-4-5-20250929">Claude Sonnet 4.5 (Smart)</option>
                                <option value="claude-opus-4-5-20251101">Claude Opus 4.5 (Powerful)</option>
                            </select>
                        </div>

                        <div className="md:col-span-4 mt-2">
                            <label className="block text-xs text-zinc-400 mb-1">Custom Instructions (Optional)</label>
                            <textarea
                                className="w-full bg-zinc-950 border border-zinc-800 rounded px-4 py-2.5 focus:outline-none focus:border-red-500 transition-colors text-zinc-300 text-sm h-20 resize-none"
                                placeholder="E.g. It is a rainy night in Waterdeep. The mood is tense..."
                                value={customInstructions}
                                onChange={(e) => setCustomInstructions(e.target.value)}
                            />
                        </div>

                        <div className="md:col-span-4 flex justify-end mt-2">
                            <button
                                type="submit"
                                disabled={creating || !newCampaignName.trim()}
                                className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-medium px-6 py-2 rounded flex items-center gap-2 transition-colors"
                            >
                                {creating ? <Loader className="animate-spin w-5 h-5" /> : <Plus className="w-5 h-5" />}
                                Launch Campaign
                            </button>
                        </div>
                    </form>
                </div>

                {loading ? (
                    <div className="flex justify-center py-20"><Loader className="animate-spin text-red-500 w-8 h-8" /></div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {campaigns.map(campaign => (
                            <Link to={`/game/${campaign.id}`} key={campaign.id} className="group block h-full">
                                <div className="bg-zinc-900 border border-zinc-800 hover:border-red-500/50 hover:bg-zinc-800/80 rounded-xl p-6 transition-all h-full flex flex-col relative overflow-hidden">
                                    <div className="absolute top-0 right-0 p-4 opacity-50 flex gap-2">
                                        <button
                                            onClick={(e) => handleDelete(e, campaign.id)}
                                            disabled={deleting === campaign.id}
                                            className="hover:text-red-500 text-zinc-600 transition-colors z-20"
                                            title="Delete Campaign"
                                        >
                                            {deleting === campaign.id ? <Loader className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
                                        </button>
                                        <Scroll className="w-12 h-12 text-zinc-800 group-hover:text-red-900/30 transition-colors pointer-events-none" />
                                    </div>

                                    <h3 className="text-xl font-bold text-zinc-100 group-hover:text-red-400 transition-colors mb-1 z-10">{campaign.name}</h3>
                                    <p className="text-xs text-zinc-500 mb-4 font-mono z-10">{new Date(campaign.createdAt).toLocaleDateString()}</p>

                                    <div className="mt-auto space-y-2 z-10">
                                        {campaign.character ? (
                                            <div className="inline-block bg-zinc-800 px-3 py-1 rounded text-xs text-zinc-300 border border-zinc-700">
                                                Playing as <span className="text-red-400 font-semibold">{campaign.character.name}</span>
                                            </div>
                                        ) : (
                                            <div className="inline-block bg-zinc-800/50 px-3 py-1 rounded text-xs text-zinc-500 border border-zinc-800">
                                                Freeform Mode
                                            </div>
                                        )}

                                        <div className="flex items-center gap-2 text-[10px] text-zinc-600 uppercase tracking-wider">
                                            <div className={`w-2 h-2 rounded-full ${campaign.aiModel.includes('sonnet') ? 'bg-purple-500' : campaign.aiModel.includes('opus') ? 'bg-amber-500' : 'bg-blue-500'}`} />
                                            {campaign.aiModel.split('-')[2] || 'AI'}
                                        </div>
                                    </div>
                                </div>
                            </Link>
                        ))}

                        {campaigns.length === 0 && (
                            <div className="col-span-full py-20 text-center text-zinc-500 bg-zinc-900/20 rounded-xl border border-zinc-800/50 border-dashed">
                                No campaigns yet. Use the form above to start your journey.
                            </div>
                        )}
                    </div>
                )}
            </main>
        </div>
    );
}
