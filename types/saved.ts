export type SavedSearchKind = "COMMUNITY_POSTS" | "PEOPLE";

export type SavedActionState = {
  success: boolean;
  message: string;
  saved?: boolean;
};

export type SavedSearchInput = {
  name: string;
  kind: SavedSearchKind;
  href: string;
};

export type SavedPostView = {
  id: string;
  title: string;
  category: string;
  locality: string;
  city: string;
  priceLabel: string;
  moveInLabel: string;
  authorName: string;
  communityHref: string;
  savedAt: string;
};

export type SavedSearchView = {
  id: string;
  name: string;
  kind: SavedSearchKind;
  kindLabel: string;
  href: string;
  filterLabels: string[];
  savedAt: string;
};
