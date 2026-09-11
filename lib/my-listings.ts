import type { MyListingLifecycleStatus } from "@/types/my-listings";

export type ManageableListingInput = {
  status: string;
  availabilityStatus: "AVAILABLE" | "RESERVED" | "CLOSED";
  moderationStatus: string;
};

export function myListingKind(input: {
  type: string;
  roomType: "PRIVATE_ROOM" | "SHARED_ROOM" | "ENTIRE_PLACE" | null;
}) {
  if (input.type === "PG_AVAILABLE") return "PG" as const;
  return input.roomType === "SHARED_ROOM" || input.roomType === "ENTIRE_PLACE"
    ? ("Flat / Shared Flat" as const)
    : ("Room" as const);
}

export function myListingLifecycleStatus(
  input: ManageableListingInput,
): MyListingLifecycleStatus {
  if (input.moderationStatus !== "VISIBLE") return "UNAVAILABLE";
  if (input.status === "ARCHIVED") return "PAUSED";
  if (input.status !== "ACTIVE" || input.availabilityStatus === "CLOSED") {
    return "CLOSED";
  }
  return input.availabilityStatus;
}

export function myListingLifecycleLabel(status: MyListingLifecycleStatus) {
  if (status === "AVAILABLE") return "Available";
  if (status === "RESERVED") return "Reserved";
  if (status === "PAUSED") return "Paused";
  if (status === "CLOSED") return "Closed";
  return "Unavailable";
}

export function myListingActions(input: ManageableListingInput) {
  const manageable = input.moderationStatus === "VISIBLE";
  const isActive = input.status === "ACTIVE";
  const isPaused = input.status === "ARCHIVED";
  const isClosed = input.availabilityStatus === "CLOSED";

  return {
    canPause: isActive && !isClosed && manageable,
    canReopen: (isPaused || (isActive && isClosed)) && manageable,
    canClose: isActive && !isClosed && manageable,
    canDelete: (isActive || isPaused) && manageable,
    detailAvailable: isActive && manageable,
  };
}
