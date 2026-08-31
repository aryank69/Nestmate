import type { UserProfile } from "@/types/profile";

export const mockUserProfile: UserProfile = {
  name: "Ananya Iyer",
  age: 26,
  profession: "Product designer",
  organization: "FinNova",
  preferredLocalities: ["Indiranagar", "Koramangala", "HSR Layout"],
  budget: "₹18,000–₹25,000",
  moveInDate: "2026-09-15",
  bio: "I’m a product designer moving closer to central Bengaluru. I enjoy calm, welcoming homes, cook often, and value clear communication and shared responsibility.",
  preferences: {
    diet: "Vegetarian",
    smoking: "Non-smoker",
    drinking: "Occasionally",
    sleepSchedule: "Early bird",
    cleanliness: "Very tidy",
    pets: "Pet friendly",
    status: "Working professional",
  },
};
