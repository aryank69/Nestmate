export type LifestylePreferences = {
  diet: string;
  smoking: string;
  drinking: string;
  sleepSchedule: string;
  cleanliness: string;
  pets: string;
  status: string;
};

export type UserProfile = {
  name: string;
  age: number;
  profession: string;
  organization: string;
  preferredLocalities: string[];
  budget: string;
  moveInDate: string;
  bio: string;
  preferences: LifestylePreferences;
};

export type ProfileUpdateResult = {
  success: boolean;
  message: string;
  profile?: UserProfile;
};
