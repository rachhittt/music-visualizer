'use client';

import { useRef, useState, useEffect } from 'react';

export default function MusicVisualizer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioElementRef = useRef<HTMLAudioElement>(null);
  const animationIdRef = useRef<number | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const fileSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [fileName, setFileName] = useState<string>('');
  const [isMicActive, setIsMicActive] = useState(false);
  const [micPermission, setMicPermission] = useState<'granted' | 'denied' | 'pending'>('pending');
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [visualMode, setVisualMode] = useState<'bars' | 'circle'>('bars');
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Safe cleanup function for audio sources
  const cleanupAudioSources = () => {
    // Disconnect and cleanup microphone source
    if (micSourceRef.current) {
      try {
        micSourceRef.current.disconnect();
      } catch (e) {
        console.warn('Error disconnecting mic source:', e);
      }
      micSourceRef.current = null;
    }

    // Disconnect analyser from destination
    if (analyserRef.current) {
      try {
        analyserRef.current.disconnect();
      } catch (e) {
        console.warn('Error disconnecting analyser:', e);
      }
    }

    // Reset gain node connections
    if (gainNodeRef.current) {
      try {
        gainNodeRef.current.disconnect();
      } catch (e) {
        console.warn('Error disconnecting gain node:', e);
      }
    }
  };

  // Initialize Web Audio API for file playback
  const initializeAudioContext = (audio: HTMLAudioElement) => {
    if (!audioContextRef.current) {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;
    }

    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }

    const audioContext = audioContextRef.current;
    
    console.log('Initializing file audio context...');

    // Disconnect gain node if it exists (from mic mode)
    if (gainNodeRef.current) {
      try {
        gainNodeRef.current.disconnect();
        console.log('Disconnected gain node');
      } catch (e) {
        console.warn('Error disconnecting gain node:', e);
      }
    }

    // Disconnect previous analyser but REUSE FILE SOURCE
    if (analyserRef.current) {
      try {
        analyserRef.current.disconnect();
        console.log('Disconnected previous analyser');
      } catch (e) {
        console.warn('Error disconnecting previous analyser:', e);
      }
    }

    // Create media element source ONLY ONCE - it cannot be recreated
    let source = fileSourceRef.current;
    if (!source) {
      source = audioContext.createMediaElementSource(audio);
      fileSourceRef.current = source;
      console.log('Created new file source');
    }

    // Create fresh analyser
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    
    // Connect the chain: source → analyser → destination
    source.connect(analyser);
    analyser.connect(audioContext.destination);

    analyserRef.current = analyser;
    console.log('File audio context initialized successfully');
  };

  // Handle file upload
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Stop microphone if active and disconnect its source
    if (isMicActive) {
      stopMicrophone();
      setIsMicActive(false);
    }

    setFileName(file.name);
    const url = URL.createObjectURL(file);

    if (audioElementRef.current) {
      audioElementRef.current.src = url;
      audioElementRef.current.load();
      
      // Initialize audio context for file playback
      initializeAudioContext(audioElementRef.current);
      
      // Wait a moment for audio to be loaded, then play
      setTimeout(() => {
        if (audioElementRef.current) {
          audioElementRef.current.play().catch((error) => {
            console.error('Error playing audio:', error);
          });
        }
      }, 100);
      
      setIsPlaying(true);
    }
  };

  // Initialize Web Audio API for Microphone
  const initializeMicAudioContext = async () => {
    try {
      // Clear file state before activating microphone
      stopAudioFile();

      if (!audioContextRef.current) {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioContextRef.current = audioContext;
      }

      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      // Disconnect previous analyser
      if (analyserRef.current) {
        try {
          analyserRef.current.disconnect();
        } catch (e) {
          console.warn('Error disconnecting previous analyser:', e);
        }
      }

      // Create fresh analyser and gain node for microphone
      const analyser = audioContextRef.current.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      if (!gainNodeRef.current) {
        gainNodeRef.current = audioContextRef.current.createGain();
      }

      if (!micStreamRef.current) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        micStreamRef.current = stream;
        setMicPermission('granted');

        const source = audioContextRef.current.createMediaStreamSource(stream);
        source.connect(analyserRef.current);
        // DO NOT connect to destination - we only visualize, don't playback mic audio

        micSourceRef.current = source;
      }

      setIsMicActive(true);
      setIsPlaying(true);
      draw();
    } catch (error) {
      console.error('Error accessing microphone:', error);
      setMicPermission('denied');
    }
  };

  // Stop microphone
  const stopMicrophone = () => {
    // Stop and disconnect microphone stream
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }

    // Cleanup mic source
    if (micSourceRef.current) {
      try {
        micSourceRef.current.disconnect();
      } catch (e) {
        console.warn('Error disconnecting mic source:', e);
      }
      micSourceRef.current = null;
    }

    setIsMicActive(false);
    setIsPlaying(false);
    if (animationIdRef.current) {
      cancelAnimationFrame(animationIdRef.current);
    }
  };

  // Stop and clear audio file
  const stopAudioFile = () => {
    // Stop audio playback
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current.currentTime = 0;
      audioElementRef.current.src = '';
    }

    // Disconnect analyser (but NOT file source - it will be reused)
    if (analyserRef.current) {
      try {
        analyserRef.current.disconnect();
      } catch (e) {
        console.warn('Error disconnecting analyser:', e);
      }
    }

    // Disconnect gain node
    if (gainNodeRef.current) {
      try {
        gainNodeRef.current.disconnect();
      } catch (e) {
        console.warn('Error disconnecting gain node:', e);
      }
    }

    setFileName('');
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    if (animationIdRef.current) {
      cancelAnimationFrame(animationIdRef.current);
    }
  };

  // Handle seek
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    if (audioElementRef.current) {
      audioElementRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  // Format time display
  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // Draw bars visualization
  const drawBars = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, dataArray: Uint8Array) => {
    // Clear canvas
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw bars
    const barWidth = (canvas.width / dataArray.length) * 2.5;
    let x = 0;

    for (let i = 0; i < dataArray.length; i++) {
      const barHeight = (dataArray[i] / 255) * (canvas.height * 0.8);

      // Gradient color effect
      const hue = (i / dataArray.length) * 360;
      ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;
      ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);

      // Add reflection effect
      ctx.fillStyle = `hsl(${hue}, 100%, 30%)`;
      ctx.fillRect(x, canvas.height - barHeight - 2, barWidth, 2);

      x += barWidth + 1;
    }
  };

  // Draw circular radial visualization
  const drawCircle = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, dataArray: Uint8Array) => {
    // Clear canvas
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(centerX, centerY) * 0.4;
    const spikes = dataArray.length;
    const maxSpikeLength = Math.min(centerX, centerY) * 0.6;

    // Draw outer circle background
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.stroke();

    // Draw radial spikes
    for (let i = 0; i < spikes; i++) {
      const angle = (i / spikes) * Math.PI * 2;
      const frequency = dataArray[i] / 255;
      const spikeLength = radius + frequency * maxSpikeLength;

      // Calculate start and end points
      const startX = centerX + Math.cos(angle) * radius;
      const startY = centerY + Math.sin(angle) * radius;
      const endX = centerX + Math.cos(angle) * spikeLength;
      const endY = centerY + Math.sin(angle) * spikeLength;

      // Gradient color effect
      const hue = (i / spikes) * 360;
      const lineWidth = 2 + frequency * 3;

      ctx.strokeStyle = `hsl(${hue}, 100%, ${50 + frequency * 20}%)`;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();
    }

    // Draw center circle with glow
    const avgFrequency = dataArray.reduce((a, b) => a + b) / dataArray.length / 255;
    const glowSize = 15 + avgFrequency * 10;

    // Glow effect
    ctx.fillStyle = `rgba(0, 255, 255, ${0.3 * avgFrequency})`;
    ctx.beginPath();
    ctx.arc(centerX, centerY, glowSize + 10, 0, Math.PI * 2);
    ctx.fill();

    // Center circle
    ctx.fillStyle = '#00ffff';
    ctx.beginPath();
    ctx.arc(centerX, centerY, glowSize, 0, Math.PI * 2);
    ctx.fill();

    // Inner circle
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(centerX, centerY, glowSize * 0.5, 0, Math.PI * 2);
    ctx.fill();
  };

  // Draw the visualization
  const draw = () => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;

    if (!canvas || !analyser) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArray);

    if (visualMode === 'bars') {
      drawBars(ctx, canvas, dataArray);
    } else if (visualMode === 'circle') {
      drawCircle(ctx, canvas, dataArray);
    }

    animationIdRef.current = requestAnimationFrame(draw);
  };

  // Start/stop animation loop based on playing state
  useEffect(() => {
    if (isPlaying && (fileName || isMicActive)) {
      draw();
    } else {
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
        animationIdRef.current = null;
      }
    }

    return () => {
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
    };
  }, [isPlaying, fileName, isMicActive, visualMode]);

  // Audio event listeners for file playback
  useEffect(() => {
    const audio = audioElementRef.current;
    if (!audio) return;

    const handlePlay = () => {
      if (!audioContextRef.current) {
        initializeAudioContext(audio);
      }
      if (audioContextRef.current?.state === 'suspended') {
        audioContextRef.current.resume();
      }
      setIsPlaying(true);
    };

    const handlePause = () => {
      setIsPlaying(false);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
    };

    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);

    return () => {
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, []);

  // Resize canvas on window resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleResize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const togglePlayPause = () => {
    if (audioElementRef.current) {
      if (isPlaying) {
        audioElementRef.current.pause();
      } else {
        audioElementRef.current.play();
      }
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      canvasRef.current?.requestFullscreen().catch(() => {
        console.error('Could not enter fullscreen');
      });
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {
        console.error('Could not exit fullscreen');
      });
      setIsFullscreen(false);
    }
  };

  // Listen for fullscreen changes and keyboard shortcuts
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isFullscreen) {
        if (e.key === 'c' || e.key === 'C') {
          setVisualMode(visualMode === 'bars' ? 'circle' : 'bars');
        }
      }
    };

    const handleCanvasClick = (e: MouseEvent) => {
      if (isFullscreen && canvasRef.current) {
        // Only toggle if clicking on the canvas itself
        if (e.target === canvasRef.current) {
          setVisualMode(visualMode === 'bars' ? 'circle' : 'bars');
        }
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('keydown', handleKeyDown);
    canvasRef.current?.addEventListener('click', handleCanvasClick);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('keydown', handleKeyDown);
      canvasRef.current?.removeEventListener('click', handleCanvasClick);
    };
  }, [isFullscreen, visualMode]);

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
      {/* Header */}
      <div className="w-full max-w-2xl text-center mb-8">
        <h1 className="text-4xl md:text-5xl font-bold text-white mb-2">
          Music Visualizer
        </h1>
        <p className="text-gray-400 text-sm md:text-base">
          Upload an audio file or use your microphone to see the spectrum visualization
        </p>
      </div>

      {/* Canvas Container */}
      <div className="w-full max-w-2xl mb-6 transition-all duration-500 relative">
        <canvas
          ref={canvasRef}
          className="w-full h-96 bg-black rounded-lg border-2 shadow-2xl transition-all duration-500 cursor-pointer"
          style={{
            borderColor: isMicActive ? '#10b981' : fileName ? '#a855f7' : '#1f2937',
            boxShadow: isMicActive 
              ? '0 0 30px rgba(16, 185, 129, 0.3)' 
              : fileName 
              ? '0 0 30px rgba(168, 85, 247, 0.3)' 
              : '0 0 20px rgba(0, 0, 0, 0.5)'
          }}
        />
        
        {/* Fullscreen Button */}
        {!isFullscreen && (
          <button
            onClick={toggleFullscreen}
            className="absolute top-4 right-4 p-2 bg-black/50 hover:bg-black/75 text-white rounded-lg transition-all duration-200 backdrop-blur-sm"
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
          >
            <span className="text-lg">
              {isFullscreen ? '⛶' : '⛶'}
            </span>
          </button>
        )}
      </div>

      {/* Fullscreen Floating Controls */}
      {isFullscreen && (
        <>
          {/* Top-right: Exit button */}
          <div className="fullscreen-exit-btn">
            <button
              onClick={toggleFullscreen}
              className="text-white text-xl hover:opacity-75 transition-opacity"
              title="Press ESC to exit"
            >
              ✕
            </button>
          </div>

          {/* Bottom-center: Mode hint */}
          <div className="fullscreen-controls">
            <div className="text-center">
              <div className="text-white font-semibold mb-2">
                {visualMode === 'bars' ? '📊 Bars Mode' : '🎯 Circle Mode'}
              </div>
              <div className="text-xs text-gray-400">
                Click canvas to toggle
              </div>
            </div>
          </div>
        </>
      )}

      {/* Visualization Mode Selector */}
      <div className="w-full max-w-2xl mb-8 flex gap-3 justify-center">
        <button
          onClick={() => setVisualMode('bars')}
          className={`px-6 py-2 font-semibold rounded-lg transition-all duration-200 ${
            visualMode === 'bars'
              ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-lg shadow-cyan-500/50'
              : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
          }`}
        >
          📊 Bars
        </button>
        <button
          onClick={() => setVisualMode('circle')}
          className={`px-6 py-2 font-semibold rounded-lg transition-all duration-200 ${
            visualMode === 'circle'
              ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-lg shadow-cyan-500/50'
              : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
          }`}
        >
          🎯 Circle
        </button>
      </div>

      {/* Controls */}
      <div className="w-full max-w-2xl">
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-center flex-wrap">
          {/* File Upload */}
          <label className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold rounded-lg cursor-pointer hover:shadow-lg hover:shadow-purple-500/50 transition-all duration-300 flex items-center gap-2 transform hover:scale-105">
            <span>📁 Choose Audio File</span>
            <input
              type="file"
              accept="audio/*"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>

          {/* Microphone Button */}
          <button
            onClick={isMicActive ? stopMicrophone : initializeMicAudioContext}
            className={`px-6 py-3 font-semibold rounded-lg transition-all duration-300 flex items-center gap-2 transform hover:scale-105 ${
              isMicActive
                ? 'bg-gradient-to-r from-red-600 to-red-500 text-white hover:shadow-lg hover:shadow-red-500/50 animate-pulse'
                : 'bg-gradient-to-r from-green-600 to-emerald-600 text-white hover:shadow-lg hover:shadow-green-500/50'
            }`}
          >
            <span>{isMicActive ? '🛑 Stop Mic' : '🎤 Use Microphone'}</span>
          </button>

          {/* Play/Pause Button */}
          {fileName && (
            <button
              onClick={togglePlayPause}
              className="px-6 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-semibold rounded-lg hover:shadow-lg hover:shadow-cyan-500/50 transition-all duration-300 transform hover:scale-105 animate-in fade-in"
            >
              {isPlaying ? '⏸ Pause' : '▶ Play'}
            </button>
          )}
        </div>

        {/* File Name Display and Seek Bar */}
        {fileName && (
          <div className="mt-4 p-4 bg-gradient-to-r from-purple-900/40 to-pink-900/40 rounded-lg border border-purple-700 animate-in fade-in duration-500">
            <div className="text-center mb-4">
              <div className="inline-block px-3 py-1 bg-purple-600/50 rounded-full mb-2">
                <p className="text-purple-300 text-xs font-semibold">📁 FILE MODE</p>
              </div>
              <p className="text-white font-semibold text-lg truncate">Playing: {fileName}</p>
            </div>

            {/* Seek Bar */}
            <div className="space-y-2">
              <input
                type="range"
                min="0"
                max={duration || 0}
                value={currentTime}
                onChange={handleSeek}
                className="w-full h-2 bg-purple-700/50 rounded-lg appearance-none cursor-pointer accent-purple-500"
              />
              <div className="flex justify-between text-xs text-gray-400">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Microphone Status Display */}
        {isMicActive && (
          <div className="mt-4 p-4 bg-gradient-to-r from-green-900/40 to-emerald-900/40 rounded-lg border border-green-700 animate-in fade-in duration-500">
            <div className="flex items-center justify-center gap-2">
              <span className="inline-flex h-3 w-3 animate-pulse rounded-full bg-green-400"></span>
              <div className="text-center">
                <div className="inline-block px-3 py-1 bg-green-600/50 rounded-full mb-2">
                  <p className="text-green-300 text-xs font-semibold">🎤 MIC MODE</p>
                </div>
                <p className="text-green-300 font-semibold text-lg">Microphone Active</p>
              </div>
              <span className="inline-flex h-3 w-3 animate-pulse rounded-full bg-green-400"></span>
            </div>
          </div>
        )}

        {/* Permission Error */}
        {micPermission === 'denied' && (
          <div className="mt-4 p-4 bg-red-900/30 rounded-lg border border-red-700 text-center">
            <p className="text-red-400 text-sm">Microphone access was denied</p>
            <p className="text-red-300 text-xs mt-1">Please allow microphone access in your browser settings</p>
          </div>
        )}
      </div>

      {/* Hidden Audio Element */}
      <audio ref={audioElementRef} crossOrigin="anonymous" />
    </div>
  );
}
