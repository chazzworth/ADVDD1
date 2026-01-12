import React from 'react';
import { X, Image as ImageIcon, Loader2 } from 'lucide-react';

export default function ImageModalNew({ isOpen, onClose, imageUrl, prompt, loading }) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-2xl w-full relative shadow-2xl overflow-hidden">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 bg-zinc-950/50 hover:bg-zinc-800 p-2 rounded-full text-zinc-400 transition-colors z-10"
                >
                    <X className="w-5 h-5" />
                </button>

                <div className="p-6">
                    <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-zinc-100">
                        <ImageIcon className="w-5 h-5 text-purple-500" />
                        Scene Visualization
                    </h2>

                    <div className="aspect-square bg-zinc-950 rounded-lg flex items-center justify-center overflow-hidden border border-zinc-800">
                        {loading ? (
                            <div className="text-center text-zinc-500 flex flex-col items-center gap-3">
                                <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
                                <p>Conjuring vision...</p>
                            </div>
                        ) : imageUrl ? (
                            <img src={imageUrl} alt={prompt} className="w-full h-full object-cover animate-in fade-in duration-700" />
                        ) : (
                            <div className="text-zinc-600 italic">No image generated yet.</div>
                        )}
                    </div>

                    {prompt && !loading && (
                        <p className="mt-4 text-xs text-zinc-500 italic border-l-2 border-zinc-800 pl-3">
                            "{prompt}"
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
