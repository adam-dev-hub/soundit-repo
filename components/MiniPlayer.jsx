// components/MiniPlayer.jsx
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Pressable, Image, Dimensions } from 'react-native';
import { Play, Pause, SkipForward } from 'lucide-react-native';
import { useAudio } from '../context/AudioContext';
import { useRouter } from 'expo-router';

const { width } = Dimensions.get('window');

export default function MiniPlayer() {
  const { currentSong, isPlaying, togglePlayPause, playNext, position, duration } = useAudio();
  const router = useRouter();

  if (!currentSong) return null;

  // Calculate progress percentage for the slim top bar
  const progress = duration > 0 ? (position / duration) : 0;

  return (
    <View style={styles.outerContainer}>
      <Pressable 
        style={styles.container} 
        onPress={() => router.push('/player')}
      >
        {/* Slim SoundCloud Progress Bar */}
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>

        <View style={styles.content}>
          <View style={styles.songInfo}>
            {/* Fancy Artwork with Border */}
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
                {currentSong.name.replace(/\.[^/.]+$/, '')}
              </Text>
              <Text style={styles.artist} numberOfLines={1}>
                {currentSong.artist || 'Unknown Artist'}
              </Text>
            </View>
          </View>

          {/* Simple, Clean Controls */}
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
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    position: 'absolute',
    bottom: 0, // Sits right at the bottom, or add 10 for "floating"
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingBottom: 12, // Keeps it off the very edge of the screen
    paddingHorizontal: 10,
  },
  container: {
    width: '100%',
    backgroundColor: 'rgba(28, 28, 28, 0.98)', // Deep "Glass" background
    borderRadius: 16,
    overflow: 'hidden', // Clips the progress bar to the radius
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    // Shadow for "Fancy" look
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
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#FF5500', // SoundCloud Orange
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
});