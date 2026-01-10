// components/SongItem.jsx - Optimized with animated wave indicator

import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, ActivityIndicator } from 'react-native';
import { Play, MoreVertical, Music, Heart } from 'lucide-react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';

// Animated Wave Bar Component
const AnimatedWaveBar = ({ delay = 0 }) => {
  const height = useSharedValue(8);

  useEffect(() => {
    height.value = withRepeat(
      withSequence(
        withTiming(18, { duration: 300 + delay, easing: Easing.inOut(Easing.ease) }),
        withTiming(8, { duration: 300 + delay, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    height: height.value,
  }));

  return <Animated.View style={[styles.waveBar, animatedStyle]} />;
};

export default function SongItem({ song, onPress, onOptions, isPlaying }) {
  const [imageLoading, setImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);

  const formatDuration = (ms) => {
    if (!ms) return null;
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Extract display info
  let displayTitle = song.title || song.name || 'Unknown Title';
  let displayArtist = song.artist || null;

  if (!displayArtist) {
    const nameWithoutExt = displayTitle.replace(/\.[^.]+$/, '');
    const match = nameWithoutExt.match(/^(.+?)\s*[-–—]\s*(.+)$/);
    if (match) {
      displayArtist = match[1].trim();
      displayTitle = match[2].trim();
    } else {
      displayTitle = nameWithoutExt;
    }
  } else {
    displayTitle = displayTitle.replace(/\.[^.]+$/, '');
  }

  const displayAlbum = song.album;
  const duration = formatDuration(song.duration);

  // Build subtitle
  let subtitle = displayArtist || 'Unknown Artist';
  if (displayAlbum && displayAlbum !== displayArtist) {
    subtitle += ` • ${displayAlbum}`;
  }
  if (duration) {
    subtitle += ` • ${duration}`;
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.container, isPlaying && styles.playing]}
      activeOpacity={0.7}
    >
      <View style={[styles.artwork, isPlaying && styles.artworkPlaying]}>
        {song.artwork && !imageError ? (
          <>
            <Image
              source={{ uri: song.artwork }}
              style={styles.artworkImage}
              onLoadStart={() => setImageLoading(true)}
              onLoadEnd={() => setImageLoading(false)}
              onError={(e) => {
                setImageError(true);
                setImageLoading(false);
              }}
            />
            {imageLoading && (
              <View style={styles.imageLoadingOverlay}>
                <ActivityIndicator size="small" color="#FF5500" />
              </View>
            )}
          </>
        ) : isPlaying ? (
          // Animated Wave Indicator
          <View style={styles.waveIndicator}>
            <AnimatedWaveBar delay={0} />
            <AnimatedWaveBar delay={100} />
            <AnimatedWaveBar delay={200} />
            <AnimatedWaveBar delay={50} />
          </View>
        ) : (
          <Text style={styles.artworkText}>
            {(displayArtist || displayTitle).charAt(0).toUpperCase()}
          </Text>
        )}
      </View>

      <View style={styles.info}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>
            {displayTitle}
          </Text>
          {song.isLiked && (
            <Heart size={14} color="#FF5500" fill="#FF5500" style={styles.likeIcon} />
          )}
        </View>
        <Text style={styles.subtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>

      {onOptions && (
        <TouchableOpacity
          onPress={(e) => {
            e.stopPropagation();
            onOptions();
          }}
          style={styles.moreButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MoreVertical size={20} color="#888" />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#1a1a1a',
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  playing: {
    backgroundColor: '#252525',
  },
  artwork: {
    width: 50,
    height: 50,
    borderRadius: 6,
    backgroundColor: '#3a3a3a',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  artworkPlaying: {
    backgroundColor: '#FF5500',
  },
  artworkImage: {
    width: '100%',
    height: '100%',
    borderRadius: 6,
  },
  imageLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 6,
  },
  artworkText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  waveIndicator: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    height: 24,
  },
  waveBar: {
    width: 3,
    backgroundColor: '#fff',
    borderRadius: 2,
  },
  info: {
    flex: 1,
    marginLeft: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  likeIcon: {
    marginLeft: 6,
    marginTop: -2,
  },
  title: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    flexShrink: 1,
  },
  subtitle: {
    color: '#999',
    fontSize: 13,
    marginTop: 3,
  },
  moreButton: {
    padding: 8,
  },
});
