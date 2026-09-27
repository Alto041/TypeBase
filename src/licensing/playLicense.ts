import {NativeModules, Platform, Linking} from 'react-native';

export type PlayLicenseStatus = 'licensed' | 'unlicensed' | 'needs_network';

type PlayLicenseModuleType = {
  isLicensedCached: () => Promise<boolean>;
  ensureLicensed: () => Promise<PlayLicenseStatus>;
  openPlayStoreListing: () => Promise<boolean>;
  openAppListing: () => Promise<boolean>;
};

const PlayLicense: PlayLicenseModuleType | undefined = NativeModules.PlayLicense;

export async function isPlayLicenseCached(): Promise<boolean> {
  if (Platform.OS !== 'android' || !PlayLicense?.isLicensedCached) {
    return true;
  }
  return PlayLicense.isLicensedCached();
}

export async function ensurePlayLicensed(): Promise<PlayLicenseStatus> {
  if (Platform.OS !== 'android' || !PlayLicense?.ensureLicensed) {
    return 'licensed';
  }
  return PlayLicense.ensureLicensed();
}

export async function openPlayStoreListing(): Promise<void> {
  if (Platform.OS !== 'android' || !PlayLicense?.openPlayStoreListing) {
    return;
  }
  await PlayLicense.openPlayStoreListing();
}

const PLAY_STORE_LISTING_URL =
  'https://play.google.com/store/apps/details?id=com.typebase.app';

/** Opens the app on Google Play so users can rate or review. */
export async function openAppStoreListing(): Promise<void> {
  if (Platform.OS === 'android' && PlayLicense?.openAppListing) {
    try {
      await PlayLicense.openAppListing();
      return;
    } catch {
      // Fall through to browser listing.
    }
  }
  await Linking.openURL(PLAY_STORE_LISTING_URL);
}
