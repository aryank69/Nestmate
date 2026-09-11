import type { CommunityPost } from "@/types/community";
import type {
  PeopleDiscoveryProfile,
  PeopleFilters,
  RoomDiscoveryFilters,
} from "@/types/discovery";

export type MatchablePostType =
  | "NEED_ROOM"
  | "NEED_FLATMATE"
  | "ROOM_AVAILABLE"
  | "PG_AVAILABLE";

export type PostMatchSource = {
  id: string;
  type: MatchablePostType;
  title: string;
  communityId: string;
  localityId: string;
  locality: string;
  localitySlug: string;
  city: string;
  citySlug: string;
  monthlyAmountMin: number | null;
  monthlyAmountMax: number | null;
  moveInDate: string;
  furnishingStatus:
    | "FURNISHED"
    | "SEMI_FURNISHED"
    | "UNFURNISHED"
    | null;
  propertyType:
    | "APARTMENT"
    | "INDEPENDENT_HOUSE"
    | "PG"
    | "HOSTEL"
    | "OTHER"
    | null;
  roomType: "PRIVATE_ROOM" | "SHARED_ROOM" | "ENTIRE_PLACE" | null;
  tags: string[];
};

export type PostMatchFilters = {
  room: RoomDiscoveryFilters | null;
  people: PeopleFilters;
  seekerTypes: Array<"NEED_ROOM" | "NEED_FLATMATE">;
};

export type PostMatchData = {
  source: PostMatchSource;
  listings: CommunityPost[];
  people: PeopleDiscoveryProfile[];
  matchCounts: {
    listings: number;
    people: number;
    total: number;
  };
  roomFilters: RoomDiscoveryFilters | null;
  peopleFilters: PeopleFilters;
  roomsHref: string | null;
  peopleHref: string;
};
