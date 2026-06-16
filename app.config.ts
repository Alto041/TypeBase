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
        launchMode: 'most-recent',
        defaultLaunchURL: 'http://127.0.0.1:8081',
        android: {
          defaultLaunchURL: 'http://127.0.0.1:8081',
        },
        showMenuAtLaunch: false,
        skipOnboarding: true,
      },
    ],
    'expo-font',
  ],
};

export default config;
