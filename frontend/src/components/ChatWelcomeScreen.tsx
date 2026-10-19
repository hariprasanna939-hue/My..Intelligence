import React from 'react';
import { HealthResponse } from '../types';

interface ChatWelcomeScreenProps {
  onSelectPrompt?: (prompt: string) => void;
  health?: HealthResponse | null;
}

export const ChatWelcomeScreen: React.FC<ChatWelcomeScreenProps> = () => {
  return (
    <div className="flex-1 flex flex-col items-center justify-center w-full px-4 py-6 max-w-xl mx-auto selection:bg-[#7066e0]/20 select-none">
      
      {/* 1. Header Greetings matching reference typography:
          "Hello!"
          "My Intelligence" */}
      <div className="text-center mb-8 space-y-1">
        <h2 className="text-xl sm:text-2xl font-normal text-[#29265e] tracking-tight">
          Hello!
        </h2>
        <h1 className="text-2xl sm:text-3xl font-medium text-[#25225c] tracking-tight">
          My Intelligence
        </h1>
      </div>

      {/* 2. Central Luminous Sphere Orb directly matching reference design:
          Glowing periwinkle-magenta spherical gradient with white vertical capsule eyes */}
      <div className="relative flex flex-col items-center justify-center group cursor-pointer">
        {/* Outer ambient glow halo */}
        <div className="absolute w-44 h-44 rounded-full bg-gradient-to-tr from-[#9d8df8] via-[#e5a0fc] to-[#7066e0] blur-2xl opacity-40 animate-pulse pointer-events-none" />

        {/* Outer specular soft translucent rim */}
        <div className="relative w-36 h-36 sm:w-40 sm:h-40 rounded-full p-[3px] bg-gradient-to-b from-white/90 via-white/40 to-transparent shadow-[0_20px_50px_rgba(112,102,224,0.35)] flex items-center justify-center">
          {/* Inner 3D Gradient Sphere */}
          <div className="w-full h-full rounded-full bg-[radial-gradient(circle_at_35%_30%,#f072ca_0%,#a87df9_40%,#695fdf_75%,#473dc9_100%)] flex items-center justify-center relative overflow-hidden shadow-[inset_0_4px_12px_rgba(255,255,255,0.45),inset_0_-8px_16px_rgba(30,27,75,0.4)]">
            
            {/* Top-left glossy highlight */}
            <div className="absolute top-3 left-6 w-14 h-8 bg-white/30 rounded-full blur-[3px] -rotate-45 pointer-events-none" />

            {/* Glowing vertical pill eyes from reference UI */}
            <div className="flex items-center space-x-3.5 z-10 drop-shadow-[0_2px_4px_rgba(0,0,0,0.15)]">
              <span className="w-2.5 h-6 rounded-full bg-white shadow-sm" />
              <span className="w-2.5 h-6 rounded-full bg-white shadow-sm" />
            </div>
          </div>
        </div>

        {/* Ambient bottom shadow beneath the floating orb */}
        <div className="w-24 h-4 bg-[#7066e0]/20 rounded-full blur-md mt-4" />
      </div>

    </div>
  );
};