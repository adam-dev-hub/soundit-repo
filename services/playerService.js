// services/playerService.js
import TrackPlayer, { Event } from 'react-native-track-player';

module.exports = async function () {
  // Remote control events
  TrackPlayer.addEventListener(Event.RemotePlay, async () => {
    await TrackPlayer.play();
  });

  TrackPlayer.addEventListener(Event.RemotePause, async () => {
    await TrackPlayer.pause();
  });

  TrackPlayer.addEventListener(Event.RemoteNext, async () => {
    await TrackPlayer.skipToNext();
  });

  TrackPlayer.addEventListener(Event.RemotePrevious, async () => {
    await TrackPlayer.skipToPrevious();
  });

  TrackPlayer.addEventListener(Event.RemoteStop, async () => {
    await TrackPlayer.destroy();
  });

  // Optional: Handle seek from notification
  TrackPlayer.addEventListener(Event.RemoteSeek, async ({ position }) => {
    await TrackPlayer.seekTo(position);
  });
};