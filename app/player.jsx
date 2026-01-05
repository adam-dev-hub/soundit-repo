// app/player.jsx - Collapsible Waveform for Ultra Smooth Scrubbing
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
  withSpring,
  runOnJS,
  interpolate,
  Extrapolate,
  useDerivedValue, // ADDED FOR OPTIMIZATION
  FadeIn,      // ADD THIS
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

const { width } = Dimensions.get('window');

// Waveform constants
const WAVEFORM_HEIGHT = 80;
const COLLAPSED_HEIGHT = 4; // Height when collapsed to a line
const BAR_WIDTH = 3;
const BAR_GAP = 0;
const BAR_FULL_WIDTH = BAR_WIDTH + BAR_GAP;
const WAVEFORM_PADDING = 20;
const AVAILABLE_WIDTH = width - (WAVEFORM_PADDING * 2);

// Generate waveform path
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

// OPTIMIZATION: Changed from passing progress.value to passing the SharedValue itself
const WaveformCanvas = React.memo(({ waveformData, progressSV, collapseSV }) => {
  const { path, totalWidth } = useMemo(
    () => generateWaveformPath(waveformData, AVAILABLE_WIDTH),
    [waveformData]
  );

  // OPTIMIZATION: Use useDerivedValue for UI thread calculations
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

  

 // FIXED: Add opacity clamping to prevent ghost flashes
const waveformOpacity = useDerivedValue(() => {
  return Math.max(0, Math.min(1, 1 - collapseSV.value));
});

const lineOpacity = useDerivedValue(() => {
  return Math.max(0, Math.min(1, collapseSV.value));
});

  // OPTIMIZATION: Calculate scrubbing circle on UI thread
  const scrubCirclePath = useDerivedValue(() => {
    const p = Skia.Path.Make();
    p.addCircle(playheadX.value, WAVEFORM_HEIGHT / 2, 8);
    return p;
  }, []);

  // When collapsed, show simple lines instead of waveform
  return (
    <Canvas style={{ width: totalWidth, height: WAVEFORM_HEIGHT }}>
      {/* WAVEFORM LAYER */}
      <Group opacity={waveformOpacity}>
        {/* Unplayed portion */}
        <Group clip={clipPathUnplayed}>
          <Path path={path} color="rgba(255,255,255,0.3)" style="fill" />
        </Group>
        
        {/* Played portion */}
        <Group clip={clipPathPlayed}>
          <Path path={path} color="#FF5500" style="fill" />
        </Group>
        
        {/* Progress indicator line */}
        <Line
          p1={useDerivedValue(() => ({ x: playheadX.value, y: 0 }))}
          p2={useDerivedValue(() => ({ x: playheadX.value, y: WAVEFORM_HEIGHT }))}
          color="#FFFFFF"
          style="stroke"
          strokeWidth={2.5}
        />
      </Group>

      {/* COLLAPSED LINE LAYER */}
      <Group opacity={lineOpacity}>
        {/* Background line (unplayed) */}
        <Line
          p1={{ x: 0, y: WAVEFORM_HEIGHT / 2 }}
          p2={{ x: totalWidth, y: WAVEFORM_HEIGHT / 2 }}
          color="rgba(255,255,255,0.3)"
          style="stroke"
          strokeWidth={COLLAPSED_HEIGHT}
        />
        
        {/* Progress line (played) */}
        <Line
          p1={{ x: 0, y: WAVEFORM_HEIGHT / 2 }}
          p2={useDerivedValue(() => ({ x: playheadX.value, y: WAVEFORM_HEIGHT / 2 }))}
          color="#FF5500"
          style="stroke"
          strokeWidth={COLLAPSED_HEIGHT}
        />
        
        {/* Indicator - larger circle when dragging */}
        <Path
          path={scrubCirclePath}
          color="#FFFFFF"
          style="fill"
        />
      </Group>
    </Canvas>
  );
});

WaveformCanvas.displayName = 'WaveformCanvas';

export default function PlayerScreen() {
  const {
    currentSong,
    isPlaying,
    position,
    duration,
    repeatMode,
    togglePlayPause,
    playNext,
    playPrevious,
    seekTo,
    toggleRepeat,
    isShuffled,          
    toggleShuffle,
  } = useAudio();

  const router = useRouter();
  const [imageError, setImageError] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [showOptionsModal, setShowOptionsModal] = useState(false);
const [scrubbingTime, setScrubbingTime] = useState(null);


  // Shared values for animations
  const progress = useSharedValue(0);
  const isDragging = useSharedValue(false);
  const dragStartProgress = useSharedValue(0);
  const collapseProgress = useSharedValue(0); // 0 = expanded, 1 = collapsed
  const scrubbingProgress = useSharedValue(-1); 
  useEffect(() => {
  if (currentSong?.id) {
    // Reset UI for the new song
    progress.value = 0; 
    setImageError(false);
    setIsLiked(currentSong.isLiked || false);
  }
}, [currentSong?.id]);

  useEffect(() => {
  if (scrubbingProgress.value >= 0 && scrubbingProgress.value <= 1) {
    setScrubbingTime(scrubbingProgress.value * duration);
  } else {
    setScrubbingTime(null);
  }
}, [scrubbingProgress.value, duration]);

 const getSequenceIcon = () => {
    if (isShuffled) {
      return <Shuffle size={24} color="#FF5500" strokeWidth={2} />;
    }
    return <ListMusic size={24} color="#fff" strokeWidth={2} />;
  };


 
// Real-time scrubbing time display
useAnimatedReaction(
  () => scrubbingProgress.value,
  (currentValue, previousValue) => {
    if (currentValue >= 0 && currentValue <= 1) {
      const timeMs = currentValue * duration;
      runOnJS(setScrubbingTime)(timeMs);
    } else if (currentValue === -1) {
      runOnJS(setScrubbingTime)(null);
    }
  },
  [duration]
);

  // Generate waveform data
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

  // Smooth progress updates
  useEffect(() => {
    if (!duration || isDragging.value) return;
    
    const newProgress = duration > 0 ? position / duration : 0;
    
    if (newProgress >= 0.99) {
      progress.value = 1;
    } else if (newProgress < 0.01 && position < 100) {
      progress.value = 0;
    } else {
      progress.value = withTiming(newProgress, { duration: 50 });
    }
  }, [position, duration]);

  // Handle seek
  const handleSeek = useCallback((progressValue) => {
    const clampedProgress = Math.max(0, Math.min(1, progressValue));
    const newPosition = clampedProgress * duration;
    seekTo(newPosition);
  }, [duration, seekTo]);

  // Pan Gesture with collapse animation
const panGesture = useMemo(() =>
  Gesture.Pan()
.onBegin(() => {
  'worklet';
  isDragging.value = true;
  dragStartProgress.value = progress.value;
  scrubbingProgress.value = progress.value; // Show immediately
  collapseProgress.value = withTiming(1, { duration: 50 });
})
   .onUpdate((event) => {
  'worklet';
  const delta = event.translationX / waveformWidth;
  const newProgress = dragStartProgress.value + delta;
  const clampedProgress = Math.max(0, Math.min(1, newProgress));
  progress.value = clampedProgress;
  scrubbingProgress.value = clampedProgress; // Update scrubbing display
})
   .onEnd(() => {
  'worklet';
  const finalProgress = progress.value;
  scrubbingProgress.value = -1; // Hide scrubbing time
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


  // Tap Gesture with quick collapse/expand
  const tapGesture = useMemo(() =>
    Gesture.Tap()
      .maxDuration(250)
  .onStart(() => {
  'worklet';
  collapseProgress.value = withTiming(1, { duration: 100 });
})
.onEnd((event) => {
  'worklet';
  const newProgress = event.x / waveformWidth;
  progress.value = newProgress;
  scrubbingProgress.value = newProgress; // Show briefly
  runOnJS(handleSeek)(newProgress);
  collapseProgress.value = withTiming(0, { duration: 150 });
  
  // Hide after a short delay for tap
  setTimeout(() => {
    'worklet';
    scrubbingProgress.value = -1;
  }, 500); // Show for 500ms on tap
}),
    [waveformWidth, handleSeek]
  );

  const composedGesture = useMemo(() => 
    Gesture.Race(panGesture, tapGesture),
    [panGesture, tapGesture]
  );

  // Animated container style
  const waveformContainerStyle = useAnimatedStyle(() => ({
    height: WAVEFORM_HEIGHT,
    opacity: 1,
  }));

  // Like toggle
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

  // Delete song
  const handleDelete = useCallback(async () => {
    if (!currentSong) return;
    
    try {
      await storageService.deleteSong(currentSong.id);
      setShowOptionsModal(false);
      router.back();
    } catch (error) {
      console.error('Failed to delete song:', error);
    }
  }, [currentSong, router]);

  // Format time
  const formatTime = useCallback((ms) => {
    if (!ms || isNaN(ms)) return '0:00';
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }, []);
 

  // Get repeat icon
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

  const displayTitle = currentSong.name?.replace(/\.[^/.]+$/, '') || 'Unknown Title';
  const displayArtist = currentSong.artist || 'Unknown Artist';

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />
        
        {/* Background with blur */}
        <View style={styles.backgroundLayer}>
          {currentSong.artwork && !imageError ? (
            <Image
              source={{ uri: currentSong.artwork }}
              style={styles.backgroundImage}
              blurRadius={50}
            />
          ) : (
            <View style={[styles.backgroundImage, { backgroundColor: '#111' }]} />
          )}
          <LinearGradient
            colors={['rgba(0,0,0,0.3)', 'rgba(0,0,0,0.7)', '#000000']}
            style={StyleSheet.absoluteFill}
          />
        </View>

        <SafeAreaView style={styles.safeArea}>
          {/* Header */}
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
            {/* Artwork Section */}
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

            {/* Bottom Section */}
            <View style={styles.bottomSection}>
              {/* Track Metadata */}
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

              {/* Waveform Section - OPTIMIZATION: Pass SharedValues instead of .value */}
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
                {/* Scrubbing Time Indicator */}
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

                {/* Time indicators */}
                <View style={styles.timeRow}>
                  <Text style={styles.timeText}>{formatTime(position)}</Text>
                  <Text style={styles.timeText}>{formatTime(duration)}</Text>
                </View>
              </View>

              {/* Main Controls */}
              <View style={styles.controlsGroup}>
                <View style={styles.mainControls}>
                  <TouchableOpacity 
                    onPress={playPrevious} 
                    style={styles.skipButton}
                    activeOpacity={0.7}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <SkipBack size={36} color="#fff" fill="#fff" />
                  </TouchableOpacity>

                  <TouchableOpacity 
                    onPress={togglePlayPause}
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
                    onPress={playNext} 
                    style={styles.skipButton}
                    activeOpacity={0.7}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <SkipForward size={36} color="#fff" fill="#fff" />
                  </TouchableOpacity>
                </View>

                {/* Bottom Bar */}
                                <View style={styles.bottomBar}>
                  <TouchableOpacity 
                    onPress={toggleRepeat} 
                    style={styles.repeatButton}
                    activeOpacity={0.7}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    {getRepeatIcon()}
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={toggleShuffle}
                    style={styles.sequenceButton}
                    activeOpacity={0.7}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    {getSequenceIcon()}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        </SafeAreaView>

        {/* Options Modal */}
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
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  backgroundLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  backgroundImage: {
    width: '100%',
    height: '100%',
    opacity: 0.4,
  },
  safeArea: {
    flex: 1,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: '#888',
    fontSize: 18,
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 60,
    marginTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  headerTextContainer: {
    alignItems: 'center',
    flex: 1,
  },
  headerTitle: {
    color: '#999',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  headerSubtitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 2,
  },
  headerButton: {
    padding: 8,
  },
  content: {
    flex: 1,
    flexDirection: 'column',
  },
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
  placeholderText: {
    fontSize: 100,
    color: '#444',
    fontWeight: '700',
  },
  bottomSection: {
    paddingBottom: 30,
  },
  trackMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    marginBottom: 24,
  },
  trackTexts: {
    flex: 1,
    marginRight: 12,
  },
  songTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 6,
  },
  artistName: {
    color: '#bbb',
    fontSize: 16,
    fontWeight: '500',
  },
  likeButton: {
    padding: 8,
  },
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
    height: 180,
  },
  mainControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
    gap: 20,
    height: 96,
  },
  skipButton: {
    padding: 12,
  },
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
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  repeatButton: {
    padding: 12,
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
  optionsTextContainer: {
    flex: 1,
  },
  optionsTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  optionsArtist: {
    color: '#999',
    fontSize: 14,
  },
  optionsCloseButton: {
    padding: 8,
  },
  optionsList: {
    paddingVertical: 8,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    gap: 16,
  },
  optionItemDanger: {
    // No special background needed
  },
  optionText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
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

  optionTextDanger: {
    color: '#FF4444',
  },
   sequenceButton: {
    padding: 12,
  }
});