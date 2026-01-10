// components/MiniPlayer.jsx
import React, { useEffect, useState } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  StyleSheet, 
  Pressable, 
  Image, 
  Dimensions 
} from 'react-native';
import { Play, Pause, SkipForward, X, RotateCcw } from 'lucide-react-native';
import { useAudio } from '../context/AudioContext';
import { useRouter } from 'expo-router';
import { useProgress } from 'react-native-track-player';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withTiming, 
  Easing 
} from 'react-native-reanimated';

const ProgressBar = React.memo(() => {
  const { position, duration } = useProgress(250);
  const progress = useSharedValue(0);
  const screenWidth = Dimensions.get('window').width;

  useEffect(() => {
    if (duration > 0) {
      const currentProgress = position / duration;
      progress.value = withTiming(currentProgress, {
        duration: 250,
        easing: Easing.linear,
      });
    } else {
      progress.value = 0;
    }
  }, [position, duration]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: (progress.value - 1) * (screenWidth - 20) }
      ],
    };
  });

  return (
    <View style={styles.progressTrack}>
      <Animated.View style={[styles.progressFill, animatedStyle]} />
    </View>
  );
});

export default function MiniPlayer() {
  const { currentSong, isPlaying, togglePlayPause, playNext, closePlayer } = useAudio();
  const router = useRouter();
  const [showDismiss, setShowDismiss] = useState(false);
  const [wasPlayingBeforePause, setWasPlayingBeforePause] = useState(false);

  useEffect(() => {
    // Reset dismiss view when currentSong changes
    setShowDismiss(false);
    setWasPlayingBeforePause(false);
  }, [currentSong?.id]);

  if (!currentSong) return null;

  const handleLongPress = async () => {
    setWasPlayingBeforePause(isPlaying);
    
    if (isPlaying) {
      await togglePlayPause();
    }
    
    setShowDismiss(true);
  };

  const handleCancel = async () => {
    setShowDismiss(false);
    
    if (wasPlayingBeforePause) {
      await togglePlayPause();
    }
    setWasPlayingBeforePause(false);
  };

  const handleDismiss = async () => {
    setShowDismiss(false);
    setWasPlayingBeforePause(false);
    await closePlayer();
  };

  return (
    <View style={styles.outerContainer}>
      <Pressable 
        style={styles.container} 
        onPress={() => !showDismiss && router.push('/player')}
        onLongPress={handleLongPress}
        delayLongPress={500}
      >
        <ProgressBar />

        {!showDismiss ? (
          <View style={styles.content}>
            <View style={styles.songInfo}>
              <View style={styles.artworkContainer}>
                {currentSong.artwork ? (
                  <Image 
                    source={{ uri: currentSong.artwork }} 
                    style={styles.artworkImage}
                  />
                ) : (
                  <View style={styles.artworkPlaceholder}>
                    <Text style={styles.artworkText}>
                      {currentSong.name?.charAt(0)?.toUpperCase() || '?'}
                    </Text>
                  </View>
                )}
              </View>

              <View style={styles.textContainer}>
               <Text style={styles.title} numberOfLines={1}>
                  {currentSong.title || currentSong.name?.replace(/\.[^/.]+$/, '')}
                </Text>
                <Text style={styles.artist} numberOfLines={1}>
                  {currentSong.artist || 'Unknown Artist'}
                </Text>
              </View>
            </View>

            <View style={styles.controls}>
              <TouchableOpacity 
                onPress={togglePlayPause} 
                style={styles.playButton}
                activeOpacity={0.7}
              >
                {isPlaying ? (
                  <Pause size={24} color="#fff" fill="#fff" />
                ) : (
                  <Play size={24} color="#fff" fill="#fff" />
                )}
              </TouchableOpacity>

              <TouchableOpacity onPress={playNext} style={styles.controlButton}>
                <SkipForward size={22} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.content}>
            <TouchableOpacity 
              style={styles.dismissButtonLarge}
              onPress={handleCancel}
              activeOpacity={0.8}
            >
              <RotateCcw size={24} color="#FF5500" />
              <Text style={styles.dismissButtonText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.dismissButtonLarge, styles.closeButtonLarge]}
              onPress={handleDismiss}
              activeOpacity={0.8}
            >
              <X size={24} color="#FF5500" />
              <Text style={styles.dismissButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingBottom: 12,
    paddingHorizontal: 10,
  },
  container: {
    width: '100%',
    backgroundColor: 'rgba(28, 28, 28, 0.98)',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  progressTrack: {
    height: 3,
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    width: '100%',
    backgroundColor: '#FF5500',
    position: 'absolute',
    left: 0,
    top: 0,
  },
  content: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  songInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  artworkContainer: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#333',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  artworkImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  artworkPlaceholder: {
    flex: 1,
    backgroundColor: '#FF5500',
    justifyContent: 'center',
    alignItems: 'center',
  },
  artworkText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  textContainer: {
    marginLeft: 14,
    flex: 1,
  },
  title: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  artist: {
    color: '#999',
    fontSize: 13,
    marginTop: 1,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 10,
  },
  controlButton: {
    padding: 8,
    marginLeft: 4,
  },
  playButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dismissButtonLarge: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2A2A2A',
    height: 48,
    borderRadius: 12,
    gap: 10,
  },
  closeButtonLarge: {
    backgroundColor: '#fff',
    marginLeft: 12,
  },
  dismissButtonText: {
    color: '#FF5500',
    fontSize: 16,
    fontWeight: '600',
  },
});