// context/AudioContext.jsx

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { AudioPro, useAudioPro } from 'react-native-audio-pro';
import { storageService } from '../services/storageService';

const AudioContext = createContext();

export const useAudio = () => {
  const context = useContext(AudioContext);
  if (!context) {
    throw new Error('useAudio must be used within AudioProvider');
  }
  return context;
};

export const AudioProvider = ({ children }) => {
  // Get state from AudioPro hook
  const audioPro = useAudioPro();

  // Local state for queue management
  const [queue, setQueue] = useState([]);
  const [originalQueue, setOriginalQueue] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [repeatMode, setRepeatMode] = useState('off'); // 'off' | 'all' | 'one'
  const [isShuffled, setIsShuffled] = useState(false);
  const [currentWaveform, setCurrentWaveform] = useState([]);
  const [currentSong, setCurrentSong] = useState(null);
  
  // Track shuffle history and track end state
  const shuffleHistory = useRef([]);
  const isTrackEndRef = useRef(false);
  const isManualNavigationRef = useRef(false);

  // Configure AudioPro on mount
  useEffect(() => {
    AudioPro.configure({
      contentType: 'music',
    });

    return () => {
      AudioPro.clear();
    };
  }, []);

  // Listen for track end to handle queue
  useEffect(() => {
    if (audioPro.state === 'ENDED' && !isTrackEndRef.current) {
      isTrackEndRef.current = true;
      handleTrackEnd();
    } else if (audioPro.state === 'PLAYING') {
      isTrackEndRef.current = false;
    }
  }, [audioPro.state]);

  // Handle track end (automatic progression)
  const handleTrackEnd = async () => {
    if (repeatMode === 'one') {
      // Repeat current song
      try {
        await AudioPro.seekTo(0);
        await AudioPro.resume();
      } catch (error) {
        console.error('Error repeating song:', error);
      }
    } else {
      // Auto-advance to next
      const nextIndex = getNextIndex(false);
      if (nextIndex !== -1) {
        await playTrackAtIndex(nextIndex);
      }
    }
  };

  // Load waveform
  const loadWaveform = (song) => {
    if (!song) return;
    
    try {
      if (song.waveform && Array.isArray(song.waveform) && song.waveform.length > 0) {
        setCurrentWaveform(song.waveform);
        return;
      }

      // Generate fallback waveform
      const waveform = Array.from({ length: 200 }, (_, i) => {
        const progress = i / 200;
        const wave1 = Math.sin(progress * Math.PI * 4) * 20;
        const wave2 = Math.sin(progress * Math.PI * 8) * 10;
        const noise = (Math.random() - 0.5) * 12;
        const envelope = Math.sin(progress * Math.PI) * 25;
        return Math.max(25, Math.min(75, 50 + wave1 + wave2 + noise + envelope));
      });
      setCurrentWaveform(waveform);
    } catch (e) {
      console.error("Waveform error:", e);
      setCurrentWaveform(Array.from({ length: 200 }, () => 50));
    }
  };

  // Play a specific track from the queue
  const playTrackAtIndex = async (index) => {
    if (index < 0 || index >= queue.length || !queue[index]) {
      console.warn('Invalid track index:', index);
      return;
    }
    
    const song = queue[index];

    try {
      // Update state
      setCurrentIndex(index);
      setCurrentSong(song);
      loadWaveform(song);

      // Prepare track
      const track = {
        id: song.id,
        url: song.localUri || song.uri,
        title: song.name?.replace(/\.[^/.]+$/, '') || 'Unknown Title',
        artist: song.artist || 'Unknown Artist',
        artwork: song.artwork || undefined,
      };

      // Play
      await AudioPro.play(track);
    } catch (error) {
      console.error('Error playing track at index:', index, error);
    }
  };

  // Main play song function
  const playSong = async (song, playlist = null) => {
    try {
      if (playlist && playlist.length > 0) {
        // Playing from a playlist
        setOriginalQueue(playlist);
        setQueue(playlist);
        setIsShuffled(false);
        shuffleHistory.current = [];
        
        const index = playlist.findIndex(s => s.id === song.id);
        await playTrackAtIndex(index >= 0 ? index : 0);
      } else {
        // Playing single song
        const singleSongArray = [song];
        setOriginalQueue(singleSongArray);
        setQueue(singleSongArray);
        setCurrentIndex(0);
        setIsShuffled(false);
        shuffleHistory.current = [];
        
        setCurrentSong(song);
        loadWaveform(song);

        const track = {
          id: song.id,
          url: song.localUri || song.uri,
          title: song.name?.replace(/\.[^/.]+$/, '') || 'Unknown Title',
          artist: song.artist || 'Unknown Artist',
          artwork: song.artwork || undefined,
        };

        await AudioPro.play(track);
      }
    } catch (error) {
      console.error('Error playing song:', error);
    }
  };

  // Toggle play/pause
  const togglePlayPause = async () => {
    try {
      if (audioPro.state === 'PLAYING') {
        await AudioPro.pause();
      } else {
        await AudioPro.resume();
      }
    } catch (error) {
      console.error('Error toggling play/pause:', error);
    }
  };

  // Seek to position
  const seekTo = async (ms) => {
    try {
      await AudioPro.seekTo(ms);
    } catch (error) {
      console.error('Error seeking:', error);
    }
  };

  // Get next index - FIXED with proper wrap-around
  const getNextIndex = (isManualNext) => {
    if (queue.length === 0) return -1;
    if (queue.length === 1) return 0; // Single song loops on itself

    if (isShuffled) {
      // Smart shuffle logic
      const availableIndices = queue
        .map((_, idx) => idx)
        .filter(idx => idx !== currentIndex && !shuffleHistory.current.includes(idx));

      if (availableIndices.length === 0) {
        // All songs played in shuffle, reset history
        shuffleHistory.current = [currentIndex];
        const resetIndices = queue.map((_, idx) => idx).filter(idx => idx !== currentIndex);
        
        if (resetIndices.length === 0) return 0;
        
        const nextIdx = resetIndices[Math.floor(Math.random() * resetIndices.length)];
        shuffleHistory.current.push(nextIdx);
        return nextIdx;
      }

      const nextIdx = availableIndices[Math.floor(Math.random() * availableIndices.length)];
      shuffleHistory.current.push(nextIdx);
      
      if (shuffleHistory.current.length > Math.min(10, queue.length)) {
        shuffleHistory.current.shift();
      }
      
      return nextIdx;
    } else {
      // Sequential playback
      let nextIdx = currentIndex + 1;
      
      // WRAP-AROUND LOGIC
      if (nextIdx >= queue.length) {
        if (isManualNext) {
          // Manual next: ALWAYS wrap to start
          return 0;
        } else {
          // Auto-advance: check repeat mode
          if (repeatMode === 'all') {
            return 0; // Wrap to start
          } else {
            return -1; // Stop (repeat off)
          }
        }
      }
      
      return nextIdx;
    }
  };

  // Get previous index - FIXED with proper wrap-around
  const getPreviousIndex = () => {
    if (queue.length === 0) return -1;
    if (queue.length === 1) return 0;

    if (isShuffled && shuffleHistory.current.length > 1) {
      // Go back in shuffle history
      shuffleHistory.current.pop(); // Remove current
      return shuffleHistory.current[shuffleHistory.current.length - 1];
    } else {
      // Sequential previous
      let prevIdx = currentIndex - 1;
      
      // WRAP-AROUND: Always wrap to last song
      if (prevIdx < 0) {
        return queue.length - 1;
      }
      
      return prevIdx;
    }
  };

  // Skip to next song
  const skipToNext = async () => {
    if (queue.length === 0) return;

    const nextIndex = getNextIndex(true); // true = manual navigation
    
    if (nextIndex === -1) {
      console.log('End of queue reached');
      return;
    }

    await playTrackAtIndex(nextIndex);
  };

  // Skip to previous song
  const skipToPrevious = async () => {
    // If more than 3 seconds into song, restart current song
    if (audioPro.position > 3000) {
      await seekTo(0);
      return;
    }

    if (queue.length === 0) return;

    const prevIndex = getPreviousIndex();
    
    if (prevIndex === -1) {
      console.log('Start of queue reached');
      return;
    }

    await playTrackAtIndex(prevIndex);
  };

  // Toggle repeat mode: off -> all -> one -> off
  const toggleRepeat = () => {
    const modes = ['off', 'all', 'one'];
    const currentModeIndex = modes.indexOf(repeatMode);
    const nextMode = modes[(currentModeIndex + 1) % modes.length];
    setRepeatMode(nextMode);
  };

  // Toggle shuffle mode
  const toggleShuffle = () => {
    const newShuffleState = !isShuffled;
    setIsShuffled(newShuffleState);
    
    if (newShuffleState) {
      // Enable shuffle
      shuffleHistory.current = [currentIndex];
    } else {
      // Disable shuffle: restore original order
      shuffleHistory.current = [];
      
      if (currentSong && originalQueue.length > 0) {
        const newIndex = originalQueue.findIndex(s => s.id === currentSong.id);
        if (newIndex >= 0) {
          setQueue(originalQueue);
          setCurrentIndex(newIndex);
        }
      }
    }
  };

  // Toggle like status
  const toggleLike = async (songId) => {
    if (!currentSong) return;
    
    try {
      const newStatus = !currentSong.isLiked;
      const updatedSong = await storageService.toggleSongLikeStatus(currentSong, newStatus);
      setCurrentSong(updatedSong);
      
      // Update both queues
      setQueue(prev => prev.map(s => s.id === songId ? updatedSong : s));
      setOriginalQueue(prev => prev.map(s => s.id === songId ? updatedSong : s));
    } catch (error) {
      console.error('Error toggling like:', error);
    }
  };

  // Set play queue
  const setPlayQueue = (playlist, startIndex = 0) => {
    if (!playlist || playlist.length === 0) return;
    
    setOriginalQueue(playlist);
    setQueue(playlist);
    setCurrentIndex(startIndex);
    setIsShuffled(false);
    shuffleHistory.current = [];
  };

  const value = {
    // Song info
    currentSong,
    
    // Playback state
    isPlaying: audioPro.state === 'PLAYING',
    isBuffering: audioPro.state === 'LOADING' || audioPro.state === 'BUFFERING',
    position: audioPro.position || 0,
    duration: audioPro.duration || 0,
    
    // Queue management
    queue,
    currentIndex,
    repeatMode,
    isShuffled,
    currentWaveform,
    
    // Playback controls
    playSong,
    togglePlayPause,
    seekTo,
    skipToNext,
    skipToPrevious,
    toggleRepeat,
    toggleShuffle,
    toggleLike,
    setPlayQueue,
    
    // Aliases
    playNext: skipToNext,
    playPrevious: skipToPrevious,
  };

  return (
    <AudioContext.Provider value={value}>
      {children}
    </AudioContext.Provider>
  );
};
