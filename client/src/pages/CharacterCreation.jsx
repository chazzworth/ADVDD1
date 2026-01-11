import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { Dice5, Shield, Sword, Scroll, User, ArrowRight, ArrowLeft } from 'lucide-react';

const RACES = [
    { id: 'human', name: 'Human', bonus: 'None' },
    { id: 'elf', name: 'Elf', bonus: '+1 DEX, -1 CON' },
    { id: 'dwarf', name: 'Dwarf', bonus: '+1 CON, -1 CHA' },
    { id: 'halfling', name: 'Halfling', bonus: '+1 DEX, -1 STR' },
    { id: 'half-elf', name: 'Half-Elf', bonus: 'None' },
];

const CLASSES = [
    { id: 'fighter', name: 'Fighter', icon: Sword, desc: 'A master of martial combat.' },
    { id: 'magic-user', name: 'Magic-User', icon: Scroll, desc: 'A wielder of arcane magic.' },
    { id: 'cleric', name: 'Cleric', icon: Shield, desc: 'A divine servant of the gods.' },
    { id: 'thief', name: 'Thief', icon: User, desc: 'A skilled expert in stealth.' },
    { id: 'paladin', name: 'Paladin', icon: Shield, desc: 'A holy knight.' },
    { id: 'ranger', name: 'Ranger', icon: Sword, desc: 'A warrior of the wilderness.' },
];

export default function CharacterCreation() {
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const [charData, setCharData] = useState({
        name: '',
        race: 'human',
        class: 'fighter',
        alignment: 'Neutral Good',
        stats: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
        hp: 10,
        maxHp: 10,
        ac: 10
    });

    const rollStats = () => {
        // 3d6 roll for each stat
        const roll = () => Math.floor(Math.random() * 6) + 1 + Math.floor(Math.random() * 6) + 1 + Math.floor(Math.random() * 6) + 1;
        const newStats = {
            strength: roll(),
            dexterity: roll(),
            constitution: roll(),
            intelligence: roll(),
            wisdom: roll(),
            charisma: roll(),
        };

        // Auto-calculate HP based on CON/Class (simplified)
        const classHp = { fighter: 10, paladin: 10, ranger: 8, cleric: 8, thief: 6, 'magic-user': 4 };
        const conMod = Math.floor((newStats.constitution - 10) / 2);
        const hp = Math.max(1, (classHp[charData.class] || 8) + conMod);

        setCharData({ ...charData, stats: newStats, hp, maxHp: hp });
    };

    const handleCreate = async () => {
        setLoading(true);
        try {
            const res = await api.post('/characters', charData);
            navigate('/dashboard', { state: { newCharacterId: res.data.id } });
        } catch (error) {
            console.error(error);
            alert('Failed to create character');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-4">
            <div className="max-w-2xl w-full bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl p-8">

                {/* Header */}
                <div className="mb-8 text-center">
                    <h1 className="text-3xl font-serif text-red-500 mb-2">Create Your Legend</h1>
                    <div className="flex justify-center gap-2">
                        {[1, 2, 3].map(i => (
                            <div key={i} className={`h-1 w-12 rounded ${step >= i ? 'bg-red-600' : 'bg-zinc-700'}`} />
                        ))}
                    </div>
                </div>

                {/* Step 1: Basics */}
                {step === 1 && (
                    <div className="space-y-6">
                        <div>
                            <label className="block text-xs uppercase text-zinc-500 mb-1">Character Name</label>
                            <input
                                value={charData.name}
                                onChange={e => setCharData({ ...charData, name: e.target.value })}
                                className="w-full bg-zinc-950 border border-zinc-700 rounded p-3 text-lg focus:border-red-500 outline-none"
                                placeholder="Enter name..."
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs uppercase text-zinc-500 mb-1">Race</label>
                                <select
                                    value={charData.race}
                                    onChange={e => setCharData({ ...charData, race: e.target.value })}
                                    className="w-full bg-zinc-950 border border-zinc-700 rounded p-3 text-zinc-300"
                                >
                                    {RACES.map(r => <option key={r.id} value={r.id}>{r.name} ({r.bonus})</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs uppercase text-zinc-500 mb-1">Alignment</label>
                                <select
                                    value={charData.alignment}
                                    onChange={e => setCharData({ ...charData, alignment: e.target.value })}
                                    className="w-full bg-zinc-950 border border-zinc-700 rounded p-3 text-zinc-300"
                                >
                                    {['Lawful Good', 'Neutral Good', 'Chaotic Good', 'Lawful Neutral', 'True Neutral', 'Chaotic Neutral', 'Lawful Evil', 'Neutral Evil', 'Chaotic Evil'].map(a => <option key={a} value={a}>{a}</option>)}
                                </select>
                            </div>
                        </div>

                        <div className="flex justify-end">
                            <button
                                disabled={!charData.name}
                                onClick={() => { rollStats(); setStep(2); }}
                                className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Next: Roll Stats <ArrowRight size={16} />
                            </button>
                        </div>
                    </div>
                )}

                {/* Step 2: Stats */}
                {step === 2 && (
                    <div className="space-y-6">
                        <div className="grid grid-cols-3 gap-4">
                            {Object.entries(charData.stats).map(([key, val]) => (
                                <div key={key} className="bg-zinc-950 p-4 rounded border border-zinc-800 text-center">
                                    <div className="text-2xl font-bold text-white mb-1">{val}</div>
                                    <div className="text-[10px] uppercase tracking-wider text-zinc-500">{key}</div>
                                </div>
                            ))}
                        </div>

                        <div className="text-center">
                            <button
                                onClick={rollStats}
                                className="text-zinc-400 hover:text-red-400 flex items-center gap-2 mx-auto text-sm transition-colors"
                            >
                                <Dice5 size={18} /> Reroll Attributes
                            </button>
                        </div>

                        <div className="flex justify-between pt-4">
                            <button onClick={() => setStep(1)} className="text-zinc-500 hover:text-zinc-300 flex items-center gap-2">
                                <ArrowLeft size={16} /> Back
                            </button>
                            <button onClick={() => setStep(3)} className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded flex items-center gap-2">
                                Next: Choose Class <ArrowRight size={16} />
                            </button>
                        </div>
                    </div>
                )}

                {/* Step 3: Class */}
                {step === 3 && (
                    <div className="space-y-6">
                        <div className="grid grid-cols-2 gap-3">
                            {CLASSES.map(c => {
                                const Icon = c.icon;
                                const isSelected = charData.class === c.id;
                                return (
                                    <div
                                        key={c.id}
                                        onClick={() => setCharData({ ...charData, class: c.id })}
                                        className={`p-4 rounded border cursor-pointer transition-all ${isSelected ? 'bg-red-900/20 border-red-500' : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700'}`}
                                    >
                                        <div className="flex items-center gap-3 mb-2">
                                            <Icon size={20} className={isSelected ? 'text-red-500' : 'text-zinc-600'} />
                                            <span className={`font-semibold ${isSelected ? 'text-red-400' : 'text-zinc-400'}`}>{c.name}</span>
                                        </div>
                                        <p className="text-xs text-zinc-500">{c.desc}</p>
                                    </div>
                                )
                            })}
                        </div>

                        <div className="bg-zinc-800/50 p-4 rounded border border-zinc-700/50 text-sm text-zinc-400">
                            <p>Starting HP: <span className="text-white font-bold">{charData.hp}</span> (Based on {charData.class} + CON)</p>
                        </div>

                        <div className="flex justify-between pt-4">
                            <button onClick={() => setStep(2)} className="text-zinc-500 hover:text-zinc-300 flex items-center gap-2">
                                <ArrowLeft size={16} /> Back
                            </button>
                            <button
                                onClick={handleCreate}
                                disabled={loading}
                                className="bg-red-600 hover:bg-red-700 text-white px-8 py-2 rounded font-semibold disabled:opacity-50"
                            >
                                {loading ? 'Creating...' : 'Finalize Character'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
