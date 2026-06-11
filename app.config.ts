import type {ExpoConfig} from 'expo/config';

const config: ExpoConfig = {
  name: 'TypeBase',
  slug: 'typebase',
  version: '1.0.0',
  scheme: ['typebase', 'exp+typebase'],
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  android: {
    package: 'com.typebase',
  },
  plugins: [
    [
      'expo-dev-client',
      {
        // Skip the Expo project picker when Metro is already running.
        launchMode: 'most-recent',
        showMenuAtLaunch: false,
        skipOnboarding: true,
      },
    ],
    'expo-font',
  ],
};

export default config;
