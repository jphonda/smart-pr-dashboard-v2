import React, { useEffect, useRef } from 'react';
import { Attendee } from '../types';

interface FloatingFieldProps {
  attendees: Attendee[];
  containerRef: React.RefObject<HTMLDivElement>;
}

export const FloatingField: React.FC<FloatingFieldProps> = ({ attendees, containerRef }) => {
  const requestRef = useRef<number>(0);
  const startTimeRef = useRef<number>(Date.now());
  
  // Store refs to DOM elements to manipulate directly
  const elementsRef = useRef<Map<string, HTMLDivElement>>(new Map());

  // Store mutable physics state to avoid React re-renders
  // This separates the "source data" (from props) from the "animation state" (local)
  const physicsState = useRef<Map<string, Attendee>>(new Map());

  // Sync props to local physics state
  useEffect(() => {
    // Add new attendees
    attendees.forEach(att => {
        if (!physicsState.current.has(att.id)) {
            // Clone the object so we can mutate x/y locally without affecting props
            physicsState.current.set(att.id, { ...att });
        }
    });

    // Clean up removed attendees
    const currentIds = new Set(attendees.map(a => a.id));
    for (const id of physicsState.current.keys()) {
        if (!currentIds.has(id)) {
            physicsState.current.delete(id);
            elementsRef.current.delete(id);
        }
    }
  }, [attendees]);

  const updatePhysics = () => {
    if (!containerRef.current) return;

    const { height } = containerRef.current.getBoundingClientRect();
    const time = (Date.now() - startTimeRef.current) / 1000; // time in seconds

    physicsState.current.forEach((p, id) => {
        const el = elementsRef.current.get(id);
        if (!el) return;

        // --- Physics Logic ---
        
        // Move Upwards
        p.y -= p.speed;

        // Reset if it goes off top (Recycle)
        if (p.y < -200) {
           p.y = height + 100;
           // Optional: Randomize x slightly on recycle for variety?
           // p.baseX = Math.random() * (width - 100); 
        }

        // Horizontal Wobble (Sine wave)
        const wobbleAmplitude = 15;
        const wobbleFrequency = 1.5;
        const currentX = p.baseX + Math.sin(time * wobbleFrequency + p.wobbleOffset) * wobbleAmplitude;
        
        // Update local state (not React state)
        p.x = currentX;

        // --- Direct DOM Update ---
        el.style.transform = `translate3d(${currentX.toFixed(2)}px, ${p.y.toFixed(2)}px, 0)`;
    });

    requestRef.current = requestAnimationFrame(updatePhysics);
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(updatePhysics);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, []);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {attendees.map((attendee) => (
        <div
          key={attendee.id}
          ref={(el) => {
              if (el) elementsRef.current.set(attendee.id, el);
          }}
          className="absolute flex flex-col items-center justify-center will-change-transform"
          style={{
            // Initial render position (subsequent updates happen via ref)
            transform: `translate3d(${attendee.x}px, ${attendee.y}px, 0)`,
            width: `${attendee.radius * 2}px`,
          }}
        >
          {/* Avatar Bubble - Balloon Style */}
          <div 
            className={`relative p-1 rounded-full ${attendee.color} shadow-lg`}
          >
            {/* Balloon String (Visual Decor) */}
            <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-[1px] h-8 bg-white/30" />

            <div className="w-full h-full aspect-square rounded-full overflow-hidden border-4 border-white/30 bg-black/20">
              <img 
                src={attendee.avatarUrl} 
                alt={attendee.name} 
                className="w-full h-full object-cover"
                onError={(e) => {
                    (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(attendee.name)}&background=random`;
                }}
              />
            </div>
          </div>
          
          {/* Name Tag */}
          <div className="mt-1 bg-black/40 backdrop-blur-md px-3 py-1 rounded-xl border border-white/10 shadow-sm text-center min-w-[120px]">
            <p className="text-white text-sm font-bold truncate leading-tight drop-shadow-md">
              {attendee.name}
            </p>
            {attendee.role && (
              <p className="text-gray-200 text-[10px] truncate opacity-80">
                {attendee.role}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};