// app/_layout.jsx
import { Tabs } from 'expo-router';
import { AudioProvider } from '../context/AudioContext';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { authService } from '../services/authService';
import { Home, Music, Download, Cloud } from 'lucide-react-native';
import {
  configureReanimatedLogger,
  ReanimatedLogLevel,
} from 'react-native-reanimated';
import TrackPlayer from 'react-native-track-player';

export default function RootLayout() {
  configureReanimatedLogger({
  level: ReanimatedLogLevel.warn,
  strict: false, // Reanimated runs in strict mode by default
});
TrackPlayer.registerPlaybackService(() => require('../services/playerService'));
  useEffect(() => {
    authService.configure();
  }, []);

  return (
    <AudioProvider>
      <StatusBar style="light" />
      <Tabs
        screenOptions={{
          tabBarStyle: {
            backgroundColor: '#1a1a1a',
            borderTopColor: '#2a2a2a',
            borderTopWidth: 1,
            height: 80,
            paddingBottom: 30,
            paddingTop: 8,
          },
          tabBarActiveTintColor: '#FF5500',
          tabBarInactiveTintColor: '#666',
          headerStyle: { backgroundColor: '#1a1a1a' },
          headerTintColor: '#FF5500',
          headerTitleStyle: { fontWeight: 'bold' },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            headerShown: false,
            tabBarIcon: ({ color, size }) => <Home size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="mymusic"
          options={{
            title: 'My Music',
            headerShown: false,
            tabBarIcon: ({ color, size }) => <Music size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="downloads"
          options={{
            title: 'Downloads',
            headerShown: false,
            tabBarIcon: ({ color, size }) => <Download size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="drive"
          options={{
            title: 'Drive',
            headerShown: false,
            tabBarIcon: ({ color, size }) => <Cloud size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="player"
          options={{
            href: null,
            title: 'Now Playing',
            presentation: 'modal',
            headerShown: false,
            tabBarStyle: { display: 'none' },
          }}
        />
        <Tabs.Screen
          name="library"
          options={{ href: null }}
        />
      </Tabs>
    </AudioProvider>
  );
}