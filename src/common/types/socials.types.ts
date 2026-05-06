export type SocialProvider = 'google' | 'facebook';

export type SocialProfile = {
  provider: SocialProvider;
  providerId: string;
  email: string;
  fullLegalName: string;
  firstName?: string;
  lastName?: string;
  pictureUrl?: string | null;
};
