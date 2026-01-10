// app/player.jsx - FINAL REFACTOR: Zero flickering
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  Dimensions,
  SafeAreaView,
  Image,
  StatusBar,
  Modal,
  ScrollView,
  Platform,
  Alert,
} from 'react-native';
import { Canvas, Path, Skia, Group, Line } from '@shopify/react-native-skia';
import { 
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  runOnJS,
  useDerivedValue,
  FadeIn,
  FadeOut,
  useAnimatedReaction,
} from 'react-native-reanimated';
import { 
  SkipForward, 
  SkipBack, 
  Play,
  Pause,
  Repeat, 
  Repeat1,
  ChevronDown,
  MoreVertical,
  Heart,
  Info,
  Trash2,
  X,
  Shuffle,
  ListMusic 
} from 'lucide-react-native';
import { useAudio } from '../context/AudioContext';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { storageService } from '../services/storageService';
import { useProgress } from 'react-native-track-player';

const { width } = Dimensions.get('window');

const WAVEFORM_HEIGHT = 80;
const COLLAPSED_HEIGHT = 4;
const BAR_WIDTH = 3;
const BAR_GAP = 0;
const BAR_FULL_WIDTH = BAR_WIDTH + BAR_GAP;
const WAVEFORM_PADDING = 20;
const AVAILABLE_WIDTH = width - (WAVEFORM_PADDING * 2);

const generateWaveformPath = (waveformData, availableWidth) => {
  const path = Skia.Path.Make();
  const height = WAVEFORM_HEIGHT;
  const numBars = waveformData.length;
  const totalWidth = numBars * BAR_FULL_WIDTH;
  
  const scale = totalWidth > availableWidth ? availableWidth / totalWidth : 1;
  const scaledBarWidth = BAR_WIDTH * scale;
  const scaledGap = BAR_GAP * scale;
  const scaledFullWidth = scaledBarWidth + scaledGap;
  
  waveformData.forEach((amplitude, index) => {
    const x = index * scaledFullWidth;
    const normalizedAmp = Math.max(10, Math.min(95, amplitude));
    const barHeight = (normalizedAmp / 100) * height;
    const y = (height - barHeight) / 2;
    
    path.addRRect({
      rect: { x, y, width: scaledBarWidth, height: barHeight },
      rx: scaledBarWidth / 2,
      ry: scaledBarWidth / 2,
    });
  });
  
  return { path, totalWidth: numBars * scaledFullWidth };
};

// 🔥 WAVEFORM: Isolated from parent re-renders
const WaveformCanvas = React.memo(({ waveformData, progressSV, collapseSV }) => {
  const { path, totalWidth } = useMemo(
    () => generateWaveformPath(waveformData, AVAILABLE_WIDTH),
    [waveformData]
  );

  const playheadX = useDerivedValue(() => {
    const normalizedProgress = Math.max(0, Math.min(1, progressSV.value));
    return normalizedProgress * totalWidth;
  }, [totalWidth]);

  const clipPathPlayed = useDerivedValue(() => {
    const clipX = playheadX.value;
    const p = Skia.Path.Make();
    p.addRect({ x: 0, y: 0, width: clipX, height: WAVEFORM_HEIGHT });
    return p;
  }, []);

  const clipPathUnplayed = useDerivedValue(() => {
    const clipX = playheadX.value;
    const p = Skia.Path.Make();
    p.addRect({ x: clipX, y: 0, width: totalWidth - clipX, height: WAVEFORM_HEIGHT });
    return p;
  }, [totalWidth]);

  const waveformOpacity = useDerivedValue(() => {
    const value = collapseSV.value;
    if (value < 0.01) return 1;
    if (value > 0.99) return 0;
    return 1 - value;
  });

  const lineOpacity = useDerivedValue(() => {
    const value = collapseSV.value;
    if (value < 0.01) return 0;
    if (value > 0.99) return 1;
    return value;
  });

  const scrubCirclePath = useDerivedValue(() => {
    const p = Skia.Path.Make();
    p.addCircle(playheadX.value, WAVEFORM_HEIGHT / 2, 8);
    return p;
  }, []);

  return (
    <Canvas style={{ width: totalWidth, height: WAVEFORM_HEIGHT }}>
      <Group opacity={waveformOpacity}>
        <Group clip={clipPathUnplayed}>
          <Path path={path} color="rgba(255,255,255,0.3)" style="fill" />
        </Group>
        
        <Group clip={clipPathPlayed}>
          <Path path={path} color="#FF5500" style="fill" />
        </Group>
        
        <Line
          p1={useDerivedValue(() => ({ x: playheadX.value, y: 0 }))}
          p2={useDerivedValue(() => ({ x: playheadX.value, y: WAVEFORM_HEIGHT }))}
          color="#FFFFFF"
          style="stroke"
          strokeWidth={2.5}
        />
      </Group>

      <Group opacity={lineOpacity}>
        <Line
          p1={{ x: 0, y: WAVEFORM_HEIGHT / 2 }}
          p2={{ x: totalWidth, y: WAVEFORM_HEIGHT / 2 }}
          color="rgba(255,255,255,0.3)"
          style="stroke"
          strokeWidth={COLLAPSED_HEIGHT}
        />
        
        <Line
          p1={{ x: 0, y: WAVEFORM_HEIGHT / 2 }}
          p2={useDerivedValue(() => ({ x: playheadX.value, y: WAVEFORM_HEIGHT / 2 }))}
          color="#FF5500"
          style="stroke"
          strokeWidth={COLLAPSED_HEIGHT}
        />
        
        <Path
          path={scrubCirclePath}
          color="#FFFFFF"
          style="fill"
        />
      </Group>
    </Canvas>
  );
});

// 🔥 TIME DISPLAY: Isolated component that uses useProgress
const TimeDisplay = React.memo(({ scrubbingTime }) => {
  const { position, duration } = useProgress(250);

  const formatTime = (ms) => {
    if (!ms || isNaN(ms)) return '0:00';
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const displayPosition = scrubbingTime !== null ? scrubbingTime : position * 1000;

  return (
    <View style={styles.timeRow}>
      <Text style={styles.timeText}>{formatTime(displayPosition)}</Text>
      <Text style={styles.timeText}>{formatTime(duration * 1000)}</Text>
    </View>
  );
});

const PlayerBackground = React.memo(({ artwork }) => {
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    setImageError(false);
  }, [artwork]);

  return (
    <View style={styles.backgroundLayer}>
      {artwork && !imageError ? (
        <Image
          source={{ uri: artwork }}
          style={styles.backgroundImage}
          blurRadius={50}
          onError={() => setImageError(true)}
        />
      ) : (
        <View style={[styles.backgroundImage, { backgroundColor: '#111' }]} />
      )}
      <LinearGradient
        colors={['rgba(0,0,0,0.3)', 'rgba(0,0,0,0.7)', '#000000']}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}, (prevProps, nextProps) => prevProps.artwork === nextProps.artwork);

const SongArtwork = React.memo(({ artwork, title }) => {
  const [imageError, setImageError] = useState(false);

  useEffect(() => { setImageError(false); }, [artwork]);

  return (
    <View style={styles.artworkSection}>
      <View style={styles.artworkWrapper}>
        {artwork && !imageError ? (
          <Image 
            source={{ uri: artwork }} 
            style={styles.artwork}
            onError={() => setImageError(true)}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.artwork, styles.placeholderArtwork]}>
            <Text style={styles.placeholderText}>
              {title?.charAt(0).toUpperCase() || '?'}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}, (prev, next) => prev.artwork === next.artwork && prev.title === next.title);

const PlayerControls = React.memo(({ 
  isPlaying, 
  repeatMode, 
  isShuffled, 
  onTogglePlay, 
  onNext, 
  onPrev, 
  onToggleRepeat, 
  onToggleShuffle 
}) => {
  
  const getRepeatIcon = () => {
    if (repeatMode === 'one') return <Repeat1 size={24} color="#FF5500" strokeWidth={2} />;
    return <Repeat size={24} color={repeatMode === 'all' ? '#FF5500' : '#888'} strokeWidth={2} />;
  };

  const getSequenceIcon = () => {
    if (isShuffled) return <Shuffle size={24} color="#FF5500" strokeWidth={2} />;
    return <ListMusic size={24} color="#fff" strokeWidth={2} />;
  };

  return (
    <View style={styles.controlsGroup}>
      <View style={styles.mainControls}>
        <TouchableOpacity 
          onPress={onPrev} 
          style={styles.skipButton}
          activeOpacity={0.7}
        >
          <SkipBack size={36} color="#fff" fill="#fff" />
        </TouchableOpacity>

        <TouchableOpacity 
          onPress={onTogglePlay}
          style={styles.playButton}
          activeOpacity={0.8}
        >
          {isPlaying ? (
            <Pause size={32} color="#fff" fill="#fff" />
          ) : (
            <Play size={32} color="#fff" fill="#fff" />
          )}
        </TouchableOpacity>

        <TouchableOpacity 
          onPress={onNext} 
          style={styles.skipButton}
          activeOpacity={0.7}
        >
          <SkipForward size={36} color="#fff" fill="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.bottomBar}>
        <TouchableOpacity 
          onPress={onToggleRepeat} 
          style={styles.repeatButton}
          activeOpacity={0.7}
        >
          {getRepeatIcon()}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onToggleShuffle}
          style={styles.sequenceButton}
          activeOpacity={0.7}
        >
          {getSequenceIcon()}
        </TouchableOpacity>
      </View>
    </View>
  );
});

export default function PlayerScreen() {
  const {
    currentSong,
    isPlaying,
    repeatMode,
    togglePlayPause,
    playNext,
    playPrevious,
    seekTo,
    toggleRepeat,
    isShuffled,
    toggleShuffle,
    removeSongFromQueue,
  } = useAudio();

  // 🎯 LOCAL useProgress for waveform scrubbing
  const { position: positionSeconds, duration: durationSeconds } = useProgress(50);
  const position = positionSeconds * 1000;
  const duration = durationSeconds * 1000;

  const router = useRouter();
  const [imageError, setImageError] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [showOptionsModal, setShowOptionsModal] = useState(false);
  const [scrubbingTime, setScrubbingTime] = useState(null);

  const progress = useSharedValue(0);
  const isDragging = useSharedValue(false);
  const dragStartProgress = useSharedValue(0);
  const collapseProgress = useSharedValue(0);
  const scrubbingProgress = useSharedValue(-1);

  useEffect(() => {
    if (currentSong?.id) {
      progress.value = 0;
      setImageError(false);
      setIsLiked(currentSong.isLiked || false);
    }
  }, [currentSong?.id]);

  useAnimatedReaction(
    () => scrubbingProgress.value,
    (currentValue) => {
      if (currentValue >= 0 && currentValue <= 1) {
        const timeMs = currentValue * duration;
        runOnJS(setScrubbingTime)(timeMs);
      } else if (currentValue === -1) {
        runOnJS(setScrubbingTime)(null);
      }
    },
    [duration]
  );

  const waveformData = useMemo(() => {
    if (currentSong?.waveform && Array.isArray(currentSong.waveform) && currentSong.waveform.length > 0) {
      return currentSong.waveform;
    }
    return Array.from({ length: 200 }, (_, i) => {
      const prog = i / 200;
      const wave1 = Math.sin(prog * Math.PI * 4) * 20;
      const wave2 = Math.sin(prog * Math.PI * 8) * 10;
      const noise = (Math.random() - 0.5) * 12;
      const envelope = Math.sin(prog * Math.PI) * 25;
      return Math.max(25, Math.min(75, 50 + wave1 + wave2 + noise + envelope));
    });
  }, [currentSong?.id, currentSong?.waveform]);

  

  const waveformWidth = useMemo(() => {
    const numBars = waveformData.length;
    const totalWidth = numBars * BAR_FULL_WIDTH;
    return Math.min(totalWidth, AVAILABLE_WIDTH);
  }, [waveformData.length]);

  useEffect(() => {
  if (!duration || isDragging.value) return;
  
  const newProgress = duration > 0 ? position / duration : 0;
  const clampedProgress = Math.max(0, Math.min(1, newProgress));  // ADD THIS LINE
  
  if (clampedProgress < 0.01 && position < 100) {
    progress.value = 0;
  } else {
    progress.value = withTiming(clampedProgress, { duration: 50 });  // USE clampedProgress
  }
  // REMOVE the "if (newProgress >= 0.99)" condition entirely
}, [position, duration]);

  const handleSeek = useCallback((progressValue) => {
    const clampedProgress = Math.max(0, Math.min(1, progressValue));
    const newPosition = clampedProgress * duration;
    seekTo(newPosition);
  }, [duration, seekTo]);

  const panGesture = useMemo(() =>
    Gesture.Pan()
      .onBegin(() => {
        'worklet';
        isDragging.value = true;
        dragStartProgress.value = progress.value;
        scrubbingProgress.value = progress.value;
        collapseProgress.value = withTiming(1, { duration: 50 });
      })
      .onUpdate((event) => {
        'worklet';
        const delta = event.translationX / waveformWidth;
        const newProgress = dragStartProgress.value + delta;
        const clampedProgress = Math.max(0, Math.min(1, newProgress));
        progress.value = clampedProgress;
        scrubbingProgress.value = clampedProgress;
      })
      .onEnd(() => {
        'worklet';
        const finalProgress = progress.value;
        scrubbingProgress.value = -1;
        runOnJS(handleSeek)(finalProgress);
        
        collapseProgress.value = withTiming(0, { duration: 150 });
        
        setTimeout(() => {
          'worklet';
          isDragging.value = false;
        }, 100);
      })
      .minDistance(1),
    [waveformWidth, handleSeek]
  );

  const tapGesture = useMemo(() =>
  Gesture.Tap()
    .maxDuration(250)
    .onStart(() => {
      'worklet';
      isDragging.value = true;
      collapseProgress.value = withTiming(1, { duration: 100 });
    })
    .onEnd((event) => {
      'worklet';
      const newProgress = event.x / waveformWidth;
      progress.value = withTiming(newProgress, { duration: 150 });  // ANIMATE instead of direct assignment
      scrubbingProgress.value = newProgress;
      runOnJS(handleSeek)(newProgress);
      collapseProgress.value = withTiming(0, { duration: 150 });
      
      setTimeout(() => {
        'worklet';
        scrubbingProgress.value = -1;
        isDragging.value = false;
      }, 300);  // INCREASE to 300ms to let seek complete
    }),
  [waveformWidth, handleSeek]
);

  const composedGesture = useMemo(() => 
    Gesture.Race(panGesture, tapGesture),
    [panGesture, tapGesture]
  );

  const waveformContainerStyle = useAnimatedStyle(() => ({
    height: WAVEFORM_HEIGHT,
    opacity: 1,
  }));

  const handleLikeToggle = useCallback(async () => {
    if (!currentSong) return;
    try {
      const newLikeStatus = !isLiked;
      const updatedSong = await storageService.toggleSongLikeStatus(
        currentSong, 
        newLikeStatus
      );
      setIsLiked(newLikeStatus);
      if (currentSong) {
        currentSong.isLiked = updatedSong.isLiked;
      }
    } catch (error) {
      console.error("Failed to toggle like:", error);
    }
  }, [currentSong, isLiked]);

  const handleDelete = useCallback(async () => {
  if (!currentSong) return;
  
  try {
    // Remove from queue and stop playback
    await removeSongFromQueue(currentSong.id);
    
    // Delete from storage
    await storageService.deleteSong(currentSong.id);
    
    setShowOptionsModal(false);
    router.back();
  } catch (error) {
    console.error('Failed to delete song:', error);
  }
}, [currentSong, router, removeSongFromQueue]);

  const formatTime = useCallback((ms) => {
    if (!ms || isNaN(ms)) return '0:00';
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }, []);

  const getRepeatIcon = () => {
    if (repeatMode === 'one') {
      return <Repeat1 size={24} color="#FF5500" strokeWidth={2} />;
    }
    return <Repeat size={24} color={repeatMode === 'all' ? '#FF5500' : '#888'} strokeWidth={2} />;
  };

  if (!currentSong) {
    return (
      <View style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No song playing</Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  const displayTitle = currentSong.title || currentSong.name?.replace(/\.[^/.]+$/, '') || 'Unknown Title';
  const displayArtist = currentSong.artist || 'Unknown Artist';

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />
        
        <PlayerBackground artwork={currentSong.artwork} />

        <SafeAreaView style={styles.safeArea}>
          <View style={styles.header}>
            <TouchableOpacity 
              onPress={() => router.back()} 
              style={styles.headerButton}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <ChevronDown size={30} color="#fff" strokeWidth={2.5} />
            </TouchableOpacity>
            
            <View style={styles.headerTextContainer}>
              <Text style={styles.headerTitle}>NOW PLAYING</Text>
              <Text style={styles.headerSubtitle}>
                {isLiked ? 'Favorites' : 'Library'}
              </Text>
            </View>
            
            <TouchableOpacity 
              style={styles.headerButton} 
              activeOpacity={0.7}
              onPress={() => setShowOptionsModal(true)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <MoreVertical size={26} color="#fff" strokeWidth={2.5} />
            </TouchableOpacity>
          </View>

          <View style={styles.content}>
            <View style={styles.artworkSection}>
              <View style={styles.artworkWrapper}>
                {currentSong.artwork && !imageError ? (
                  <Image 
                    source={{ uri: currentSong.artwork }} 
                    style={styles.artwork}
                    onError={() => setImageError(true)}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={[styles.artwork, styles.placeholderArtwork]}>
                    <Text style={styles.placeholderText}>
                      {displayTitle.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
              </View>
            </View>

            <View style={styles.bottomSection}>
              <View style={styles.trackMeta}>
                <View style={styles.trackTexts}>
                  <Text style={styles.songTitle} numberOfLines={1}>
                    {displayTitle}
                  </Text>
                  <Text style={styles.artistName} numberOfLines={1}>
                    {displayArtist}
                  </Text>
                </View>
                <TouchableOpacity 
                  onPress={handleLikeToggle} 
                  style={styles.likeButton}
                  activeOpacity={0.7}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Heart 
                    size={26} 
                    color={isLiked ? '#FF5500' : '#fff'} 
                    fill={isLiked ? '#FF5500' : 'transparent'}
                    strokeWidth={2}
                  />
                </TouchableOpacity>
              </View>

              <View style={styles.waveformSection}>
                <GestureDetector gesture={composedGesture}>
                  <Animated.View style={[styles.waveformContainer, waveformContainerStyle]}>
                    <WaveformCanvas 
                      waveformData={waveformData}
                      progressSV={progress}
                      collapseSV={collapseProgress}
                    />
                  </Animated.View>
                </GestureDetector>

                {scrubbingTime !== null && (
                  <Animated.View 
                    style={styles.scrubbingTimeContainer}
                    entering={FadeIn.duration(100)}
                    exiting={FadeOut.duration(100)}
                  >
                    <View style={styles.scrubbingTimeBubble}>
                      <Text style={styles.scrubbingTimeText}>
                        {formatTime(scrubbingTime)}
                      </Text>
                    </View>
                  </Animated.View>
                )}

                {/* 🎯 Isolated Time Display */}
                <TimeDisplay scrubbingTime={scrubbingTime} />
              </View>

              <PlayerControls 
                isPlaying={isPlaying}
                repeatMode={repeatMode}
                isShuffled={isShuffled}
                onTogglePlay={togglePlayPause}
                onNext={playNext}
                onPrev={playPrevious}
                onToggleRepeat={toggleRepeat}
                onToggleShuffle={toggleShuffle}
              />
            </View>
          </View>
        </SafeAreaView>

        <Modal
          visible={showOptionsModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowOptionsModal(false)}
        >
          <TouchableOpacity 
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setShowOptionsModal(false)}
          >
            <View style={styles.optionsModal}>
              <View style={styles.optionsHeader}>
                <View style={styles.optionsSongInfo}>
                  {currentSong.artwork && !imageError ? (
                    <Image 
                      source={{ uri: currentSong.artwork }} 
                      style={styles.optionsArtwork}
                    />
                  ) : (
                    <View style={[styles.optionsArtwork, styles.optionsArtworkPlaceholder]}>
                      <Text style={styles.optionsArtworkText}>
                        {displayTitle.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View style={styles.optionsTextContainer}>
                    <Text style={styles.optionsTitle} numberOfLines={1}>
                      {displayTitle}
                    </Text>
                    <Text style={styles.optionsArtist} numberOfLines={1}>
                      {displayArtist}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity 
                  onPress={() => setShowOptionsModal(false)}
                  style={styles.optionsCloseButton}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <X size={24} color="#999" />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.optionsList}>
                <TouchableOpacity 
                  style={styles.optionItem}
                  onPress={() => {
                    setShowOptionsModal(false);
                    setTimeout(() => {
                      const info = `Title: ${displayTitle}\nArtist: ${displayArtist}\nAlbum: ${currentSong.album || 'Unknown'}\nDuration: ${formatTime(duration)}\nFormat: ${currentSong.name?.split('.').pop()?.toUpperCase() || 'Unknown'}`;
                      
                      if (Platform.OS === 'web') {
                        alert(info);
                      } else {
                        Alert.alert('Song Information', info);
                      }
                    }, 300);
                  }}
                >
                  <Info size={22} color="#fff" />
                  <Text style={styles.optionText}>Song Info</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[styles.optionItem, styles.optionItemDanger]}
                  onPress={() => {
                    setShowOptionsModal(false);
                    setTimeout(() => {
                      if (Platform.OS === 'web') {
                        if (confirm(`Are you sure you want to delete "${displayTitle}"?`)) {
                          handleDelete();
                        }
                      } else {
                        Alert.alert(
                          'Delete Song',
                          `Are you sure you want to delete "${displayTitle}"?`,
                          [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Delete', style: 'destructive', onPress: handleDelete },
                          ]
                        );
                      }
                    }, 300);
                  }}
                >
                  <Trash2 size={22} color="#FF4444" />
                  <Text style={[styles.optionText, styles.optionTextDanger]}>
                    Delete from Library
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </TouchableOpacity>
        </Modal>
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  backgroundLayer: { ...StyleSheet.absoluteFillObject },
  backgroundImage: { width: '100%', height: '100%', opacity: 0.4 },
  safeArea: { flex: 1 },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: '#888', fontSize: 18, fontWeight: '600' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 60,
    marginTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  headerTextContainer: { alignItems: 'center', flex: 1 },
  headerTitle: { color: '#999', fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
  headerSubtitle: { color: '#fff', fontSize: 14, fontWeight: '600', marginTop: 2 },
  headerButton: { padding: 8 },
  content: { flex: 1, flexDirection: 'column' },
  artworkSection: {
    height: width * 0.85,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingVertical: 20,
    marginBottom: 20,
  },
  artworkWrapper: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 12,
  },
  artwork: {
    width: width * 0.7,
    height: width * 0.7,
    maxWidth: 300,
    maxHeight: 300,
    borderRadius: 12,
    backgroundColor: '#222',
  },
  placeholderArtwork: {
    justifyContent: 'center',
    alignItems: 'center',
    borderColor: '#333',
    borderWidth: 1,
  },
  placeholderText: { fontSize: 100, color: '#444', fontWeight: '700' },
  bottomSection: { paddingBottom: 30 },
  trackMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    marginBottom: 24,
  },
  trackTexts: { flex: 1, marginRight: 12 },
  songTitle: { color: '#fff', fontSize: 22, fontWeight: '700', marginBottom: 6 },
  artistName: { color: '#bbb', fontSize: 16, fontWeight: '500' },
  likeButton: { padding: 8 },
  waveformSection: {
    paddingHorizontal: WAVEFORM_PADDING,
    marginBottom: 20,
    height: WAVEFORM_HEIGHT + 40,
  },
  waveformContainer: {
    width: '100%',
    height: WAVEFORM_HEIGHT,
    overflow: 'visible',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingHorizontal: 4,
  },
  timeText: {
    color: '#888',
    fontSize: 12,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  controlsGroup: {
    paddingHorizontal: 24,
    minHeight: 180,
    justifyContent: 'center',
    position: 'relative',
    marginBottom: 20,
  },
  mainControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 30,
    height: 96,
    marginBottom: 80,
  },
  skipButton: { padding: 12 },
  playButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FF5500',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#FF5500',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 24,
    right: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 10,
    marginBottom: 30,
  },
  repeatButton: { padding: 12 },
  sequenceButton: { padding: 12 },
  scrubbingTimeContainer: {
    position: 'absolute',
    top: -40,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  scrubbingTimeBubble: {
    backgroundColor: '#FF5500',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  scrubbingTimeText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'flex-end',
  },
  optionsModal: {
    backgroundColor: '#1E1E1E',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '50%',
    minHeight: 200,
    paddingBottom: Platform.OS === 'android' ? 10 : 20,
  
  },
  optionsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  optionsSongInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  optionsArtwork: {
    width: 50,
    height: 50,
    borderRadius: 8,
    backgroundColor: '#333',
    marginRight: 12,
  },
  optionsArtworkPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionsArtworkText: {
    fontSize: 20,
    color: '#666',
    fontWeight: '700',
  },
  optionsTextContainer: { flex: 1 },
  optionsTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  optionsArtist: { color: '#999', fontSize: 14 },
  optionsCloseButton: { padding: 8 },
  optionsList: { paddingVertical: 8 },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    gap: 16,
  },
  optionItemDanger: {},
  optionText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  optionTextDanger: { color: '#FF4444' },
});