import React, { useEffect, useRef } from 'react';
import { TrackDef } from '../tracks';
import { drawTrack } from '../renderer';

export function TrackPreview({ track }: { track: TrackDef }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (track.nodes.length > 0) {
      const spline = track.nodes;
      const pitSpline = track.pitNodes ? track.pitNodes : null;

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      spline.forEach(n => {
        if (n.x < minX) minX = n.x;
        if (n.x > maxX) maxX = n.x;
        if (n.y < minY) minY = n.y;
        if (n.y > maxY) maxY = n.y;
      });
      const pad = 500;
      minX -= pad; maxX += pad; minY -= pad; maxY += pad;
      const tWidth = maxX - minX;
      const tHeight = maxY - minY;
      
      const scale = Math.min(canvas.width / tWidth, canvas.height / tHeight);
      
      ctx.save();
      ctx.translate(canvas.width/2, canvas.height/2);
      ctx.scale(scale, scale);
      ctx.translate(-(minX + maxX)/2, -(minY + maxY)/2);
      
      drawTrack(ctx, spline, pitSpline, true);
      ctx.restore();
    }
  }, [track]);

  return (
    <div className="relative overflow-hidden bg-[#15151e] shrink-0 w-full h-full min-h-[160px] flex items-center justify-center">
      <canvas 
        ref={canvasRef} 
        width={600} 
        height={337}
        className="block opacity-90 object-contain w-full h-full max-h-[200px]"
      />
    </div>
  );
}
