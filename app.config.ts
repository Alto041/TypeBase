import type {ExpoConfig} from 'expo/config';

const config: ExpoConfig = {
  name: 'TypeBase',
  slug: 'typebase',
  version: '1.0.0',
  scheme: 'typebase',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  android: {
    package: 'com.typebase',
  },
  plugins: ['expo-dev-client', 'expo-font'],
};

export default config;
