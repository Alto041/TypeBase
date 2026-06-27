import {NativeModules, Platform} from 'react-native';

export type PlayLicenseStatus = 'licensed' | 'unlicensed' | 'needs_network';

type PlayLicenseModuleType = {
  isLicensedCached: () => Promise<boolean>;
  ensureLicensed: () => Promise<PlayLicenseStatus>;
  openPlayStoreListing: () => Promise<boolean>;
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
