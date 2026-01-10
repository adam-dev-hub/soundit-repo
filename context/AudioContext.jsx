// context/AudioContext.jsx
import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import TrackPlayer, {
  Event,
  State,
  RepeatMode,
  Capability,
  usePlaybackState,
  useActiveTrack,
} from 'react-native-track-player';

const AudioContext = createContext();
export const useAudio = () => useContext(AudioContext);

export const AudioProvider = ({ children }) => {
  const playbackState = usePlaybackState();
  const activeTrack = useActiveTrack();
  const setupComplete = useRef(false);
  const switchingTrackId = useRef(null);

  const [queue, setQueue] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [repeatMode, setRepeatMode] = useState('off');
  const [isShuffled, setIsShuffled] = useState(false);
  const [currentSong, setCurrentSong] = useState(null);
  const [shuffledIndices, setShuffledIndices] = useState([]);

  // ---------- SETUP ----------
  useEffect(() => {
    if (setupComplete.current) return;

    const setup = async () => {
      try {
        try {
          const state = await TrackPlayer.getPlaybackState();
          if (state !== undefined) {
            console.log('[TrackPlayer] Already initialized');
            setupComplete.current = true;
            return;
          }
        } catch (e) {
          // Not initialized, continue
        }

        await TrackPlayer.setupPlayer({
          autoHandleInterruptions: true,
        });

        await TrackPlayer.updateOptions({
          stopWithApp: false,
          capabilities: [
            Capability.Play,
            Capability.Pause,
            Capability.SkipToNext,
            Capability.SkipToPrevious,
            Capability.SeekTo,
          ],
          compactCapabilities: [
            Capability.Play,
            Capability.Pause,
            Capability.SkipToNext,
          ],
          notificationCapabilities: [
            Capability.Play,
            Capability.Pause,
            Capability.SkipToNext,
            Capability.SkipToPrevious,
          ],
        });

        setupComplete.current = true;
        console.log('[TrackPlayer] Setup complete');
      } catch (error) {
        console.error('[TrackPlayer] Setup failed:', error);
      }
    };

    setup();
  }, []);

  // ---------- TRACK CURRENT TRACK ----------
  useEffect(() => {
  // If we're switching to a specific track, ignore updates until we see that track
  if (switchingTrackId.current && activeTrack?.id !== switchingTrackId.current) {
    return; // Ignore this update - we're waiting for our target track
  }
  
  // Clear the lock once we see our target track
  if (switchingTrackId.current && activeTrack?.id === switchingTrackId.current) {
    switchingTrackId.current = null;
  }

  if (activeTrack) {
    const songIndex = queue.findIndex(s => s.id === activeTrack.id);
    if (songIndex >= 0) {
      setCurrentIndex(songIndex);
      setCurrentSong(queue[songIndex]);
    }
  }
}, [activeTrack, queue]);

  // ---------- QUEUE ENDED ----------
  useEffect(() => {
    const sub = TrackPlayer.addEventListener(
      Event.PlaybackQueueEnded,
      async () => {
        console.log('[TrackPlayer] Queue ended');
        if (repeatMode === 'all') {
          await TrackPlayer.seekTo(0);
          await TrackPlayer.play();
        }
      }
    );
    return () => sub.remove();
  }, [repeatMode]);

  // ---------- PLAY SONG ----------
  const playSong = async (song, playlist = []) => {
  try {
    // 1. Lock to this specific track ID
    switchingTrackId.current = song.id;

    const tracks = playlist.length ? playlist : [song];
    const index = tracks.findIndex((s) => s.id === song.id);
    const targetIndex = index >= 0 ? index : 0;

    // 2. Optimistic Update: Update UI immediately for instant feedback
    setQueue(tracks);
    setCurrentIndex(targetIndex);
    setCurrentSong(song);
    setIsShuffled(false);
    setShuffledIndices([]);

    const formatted = tracks.map((s) => ({
      id: s.id,
      url: s.localUri || s.uri,
      title: s.title || s.name?.replace(/\.[^/.]+$/, ''),
      artist: s.artist,
      artwork: s.artwork,
    }));

    // 3. Perform Native Player Operations
    await TrackPlayer.reset();
    await TrackPlayer.add(formatted);
    await TrackPlayer.skip(targetIndex);
    await TrackPlayer.play();

    // 4. Safety fallback: clear lock after 2 seconds if player doesn't report the track
    setTimeout(() => {
      if (switchingTrackId.current === song.id) {
        switchingTrackId.current = null;
      }
    }, 2000);

  } catch (error) {
    console.error('Error in playSong:', error);
    switchingTrackId.current = null; // Clear lock on error
  }
};

  // ---------- CONTROLS ----------
  const togglePlayPause = async () => {
    if (playbackState.state === State.Playing) {
      await TrackPlayer.pause();
    } else {
      await TrackPlayer.play();
    }
  };

 const playNext = async () => {
    try {
      const currentTrackIndex = await TrackPlayer.getActiveTrackIndex();
      const queueLength = await TrackPlayer.getQueue();
      
      // If we're at the last track, skip to the first track
      if (currentTrackIndex !== null && currentTrackIndex >= queueLength.length - 1) {
        await TrackPlayer.skip(0);
        await TrackPlayer.play();
      } else {
        await TrackPlayer.skipToNext();
      }
    } catch (e) {
      console.log('Error in playNext:', e);
    }
  };

  const playPrevious = async () => {
  try {
    const currentTrackIndex = await TrackPlayer.getActiveTrackIndex();
    const queueLength = await TrackPlayer.getQueue();
    
    // If we're at the first track, skip to the last track
    if (currentTrackIndex !== null && currentTrackIndex === 0) {
      await TrackPlayer.skip(queueLength.length - 1);
      await TrackPlayer.play();
    } else {
      await TrackPlayer.skipToPrevious();
    }
  } catch (e) {
    console.log('Error in playPrevious:', e);
  }
};

  const seekTo = async (ms) => {
    await TrackPlayer.seekTo(ms / 1000);
  };

  const closePlayer = useCallback(async () => {
    await TrackPlayer.reset();
    setCurrentSong(null);
    setQueue([]);
    setCurrentIndex(0);
    setIsShuffled(false);
    setShuffledIndices([]);
  }, []);

  // ---------- MODES ----------
  const toggleRepeat = async () => {
    const next =
      repeatMode === 'off' ? 'all' :
      repeatMode === 'all' ? 'one' : 'off';

    setRepeatMode(next);

    await TrackPlayer.setRepeatMode(
      next === 'one' ? RepeatMode.Track :
      next === 'all' ? RepeatMode.Queue :
      RepeatMode.Off
    );

    if (next === 'one') {
      setIsShuffled(false);
      setShuffledIndices([]);
    }
  };

  const removeSongFromQueue = useCallback(async (songId) => {
  // If deleted song is currently playing
  if (currentSong?.id === songId) {
    // Close player
    await closePlayer();
  } else {
    // Just remove from queue
    const newQueue = queue.filter(s => s.id !== songId);
    setQueue(newQueue);
    
    // Update current index if needed
    const currentSongStillExists = newQueue.find(s => s.id === currentSong?.id);
    if (currentSongStillExists) {
      const newIndex = newQueue.findIndex(s => s.id === currentSong.id);
      setCurrentIndex(newIndex);
    }
  }
}, [currentSong, queue, closePlayer]);

const updateSongInQueue = useCallback((songId, updates) => {
  const newQueue = queue.map(s => 
    s.id === songId ? { ...s, ...updates } : s
  );
  setQueue(newQueue);
  
  if (currentSong?.id === songId) {
    setCurrentSong({ ...currentSong, ...updates });
  }
}, [queue, currentSong]);


  const shuffleArray = (array) => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  const toggleShuffle = async () => {
    const next = !isShuffled;
    setIsShuffled(next);

    if (next) {
      const indices = queue.map((_, i) => i);
      const currentIdx = currentIndex;
      
      const toShuffle = indices.filter(i => i !== currentIdx);
      const shuffled = shuffleArray(toShuffle);
      
      const newOrder = [currentIdx, ...shuffled];
      setShuffledIndices(newOrder);

      const shuffledTracks = newOrder.map(i => queue[i]);
      const formatted = shuffledTracks.map((s) => ({
        id: s.id,
        url: s.localUri || s.uri,
        title: s.title || s.name?.replace(/\.[^/.]+$/, ''),
        artist: s.artist,
        artwork: s.artwork,
      }));

      await TrackPlayer.reset();
      await TrackPlayer.add(formatted);
      await TrackPlayer.skip(0);
      
      if (playbackState.state === State.Playing) {
        await TrackPlayer.play();
      }

      if (repeatMode === 'one') {
        setRepeatMode('all');
        await TrackPlayer.setRepeatMode(RepeatMode.Queue);
      }
    } else {
      const formatted = queue.map((s) => ({
        id: s.id,
        url: s.localUri || s.uri,
        title: s.title || s.name?.replace(/\.[^/.]+$/, ''),
        artist: s.artist,
        artwork: s.artwork,
      }));

      await TrackPlayer.reset();
      await TrackPlayer.add(formatted);
      await TrackPlayer.skip(currentIndex);
      
      if (playbackState.state === State.Playing) {
        await TrackPlayer.play();
      }

      setShuffledIndices([]);
    }
  };

  return (
    <AudioContext.Provider
      value={{
        currentSong,
        isPlaying: playbackState.state === State.Playing,
        repeatMode,
        isShuffled,
        playSong,
        togglePlayPause,
        playNext,
        playPrevious,
        seekTo,
        toggleRepeat,
        toggleShuffle,
        closePlayer,
        removeSongFromQueue,  // ADD THIS
        updateSongInQueue, 
      }}
    >
      {children}
    </AudioContext.Provider>
  );
}