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
    { id: 'gnome', name: 'Gnome', bonus: 'None (INT bonus often house-ruled in 1e)' },
    { id: 'half-orc', name: 'Half-Orc', bonus: '+1 STR, +1 CON, -2 CHA' }
];

const CLASSES = [
    { id: 'fighter', name: 'Fighter', icon: Sword, desc: 'A master of martial combat (d10 HD).' },
    { id: 'magic-user', name: 'Magic-User', icon: Scroll, desc: 'A wielder of arcane magic (d4 HD).' },
    { id: 'cleric', name: 'Cleric', icon: Shield, desc: 'A divine servant of the gods (d8 HD).' },
    { id: 'thief', name: 'Thief', icon: User, desc: 'A skilled expert in stealth (d6 HD).' },
    { id: 'paladin', name: 'Paladin', icon: Shield, desc: 'A holy knight (d10 HD). Requires LG, 17 CHA.' },
    { id: 'ranger', name: 'Ranger', icon: Sword, desc: 'A warrior of the wilderness (2d8 HD at Lvl 1).' },
    { id: 'druid', name: 'Druid', icon: Scroll, desc: 'A protector of nature (d8 HD). Requires N.' },
    { id: 'monk', name: 'Monk', icon: User, desc: 'A martial artist (d4 HD). Logic/Dex based.' },
    { id: 'assassin', name: 'Assassin', icon: Sword, desc: 'A specialist killer (d6 HD). Evil alignment.' },
    { id: 'illusionist', name: 'Illusionist', icon: Scroll, desc: 'A master of deception (d4 HD). High DEX/INT.' }
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

    const checkRequirements = (newStats, cls, race, align) => {
        // Simple simplified 1e checks
        if (cls === 'paladin') {
            if (align !== 'Lawful Good') return 'Paladins must be Lawful Good.';
            if (newStats.charisma < 17) return 'Paladins require 17+ CHA.';
        }
        if (cls === 'druid' && align !== 'True Neutral') return 'Druids must be True Neutral.';
        if (cls === 'ranger' && (align.includes('Evil') || align.includes('Chaotic'))) return 'Rangers must be Good.';
        if (cls === 'assassin' && !align.includes('Evil')) return 'Assassins must be Evil.';
        if (cls === 'monk' && !align.includes('Lawful')) return 'Monks must be Lawful.';

        // Race restrictions (simplified common 1e)
        if (race === 'dwarf' && ['magic-user', 'druid', 'paladin', 'ranger', 'monk', 'illusionist'].includes(cls)) return 'Dwarves cannot be this class.';
        if (race === 'halfling' && ['magic-user', 'cleric', 'paladin', 'ranger', 'monk', 'assassin', 'illusionist'].includes(cls)) return 'Halflings cannot be this class.';
        if (race === 'gnome' && ['paladin', 'monk', 'druid', 'ranger'].includes(cls)) return 'Gnomes cannot be this class.';

        return null; // OK
    };

    const rollStats = () => {
        // 3d6 roll for each stat (Strict Method)
        const roll = () => Math.floor(Math.random() * 6) + 1 + Math.floor(Math.random() * 6) + 1 + Math.floor(Math.random() * 6) + 1;
        const newStats = {
            strength: roll(),
            dexterity: roll(),
            constitution: roll(),
            intelligence: roll(),
            wisdom: roll(),
            charisma: roll(),
        };

        // Don't auto-calculate HP here, we do it after class selection now
        setCharData({ ...charData, stats: newStats });
    };

    // Recalculate HP when class/stats change
    const calculateHp = (cls, con) => {
        let hd = 8;
        if (['fighter', 'paladin'].includes(cls)) hd = 10;
        if (['magic-user', 'illusionist'].includes(cls)) hd = 4;
        if (['thief', 'assassin'].includes(cls)) hd = 6;
        if (['cleric', 'druid'].includes(cls)) hd = 8;
        if (cls === 'monk') hd = 4;
        if (cls === 'ranger') return Math.floor(Math.random() * 8) + 1 + Math.floor(Math.random() * 8) + 1; // 2d8 at lvl 1

        const conMod = con > 14 ? (con - 14) : 0; // Simplified 1e: Only Fighters get > +2, but for MVP basic mod
        // Actually 1e CON mods are: 15(+1), 16(+2), 17(+3 War/Pal/Ran), 18(+4 War/Pal/Ran)
        // Let's use a standard d20 mod for everything now to allow playability, or stick to rigid 1e table?
        // Sticking to "simple" CON mod for MVP to avoid massive lookup tables.

        return Math.floor(Math.random() * hd) + 1 + Math.floor((con - 10) / 2);
    };

    const handleCreate = async () => {
        setLoading(true);
        try {
            const res = await api.post('/characters', charData);
            navigate('/', { state: { newCharacterId: res.data.id } });
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
                                const error = checkRequirements(charData.stats, c.id, charData.race, charData.alignment);

                                return (
                                    <div
                                        key={c.id}
                                        onClick={() => {
                                            if (!error) {
                                                const hp = Math.max(1, calculateHp(c.id, charData.stats.constitution));
                                                setCharData({ ...charData, class: c.id, hp, maxHp: hp });
                                            }
                                        }}
                                        className={`p-4 rounded border transition-all ${error ? 'opacity-50 cursor-not-allowed bg-zinc-900 border-zinc-800' : 'cursor-pointer'} ${isSelected ? 'bg-red-900/20 border-red-500' : (!error && 'bg-zinc-950 border-zinc-800 hover:border-zinc-700')}`}
                                    >
                                        <div className="flex items-center gap-3 mb-2">
                                            <Icon size={20} className={isSelected ? 'text-red-500' : 'text-zinc-600'} />
                                            <span className={`font-semibold ${isSelected ? 'text-red-400' : 'text-zinc-400'}`}>{c.name}</span>
                                        </div>
                                        <p className="text-xs text-zinc-500">{c.desc}</p>
                                        {error && <p className="text-[10px] text-red-500 mt-1">{error}</p>}
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
