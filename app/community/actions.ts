"use server";

import { revalidatePath } from "next/cache";

import { communityPath, validateCommunityPost } from "@/lib/community";
import { prisma } from "@/lib/prisma";
import { ensureUserProfile } from "@/lib/profile-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  CommunityJoinActionState,
  CommunityPostActionState,
  CommunityPostFormValues,
} from "@/types/community";

const failure = (
  message: string,
  fieldErrors?: CommunityPostActionState["fieldErrors"],
): CommunityPostActionState => ({ success: false, message, fieldErrors });

async function authenticatedPostContext() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (error || !claims?.sub) return null;

  const metadata = claims.user_metadata;
  const user = await ensureUserProfile({
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    name:
      metadata && typeof metadata.full_name === "string"
        ? metadata.full_name
        : null,
  });

  return { supabase, claims, user };
}

async function validateCommunity(communityId: string) {
  return prisma.community.findFirst({
    where: { id: communityId, isActive: true },
    select: {
      id: true,
      locality: {
        select: {
          slug: true,
          city: { select: { slug: true } },
        },
      },
    },
  });
}

async function ensureCommunityMembership(
  context: NonNullable<Awaited<ReturnType<typeof authenticatedPostContext>>>,
  communityId: string,
) {
  const now = new Date().toISOString();
  const { error } = await context.supabase.from("CommunityMember").upsert(
    {
      userId: context.user.id,
      communityId,
      role: "MEMBER",
      joinedAt: now,
      lastChatReadAt: now,
    },
    { onConflict: "userId,communityId", ignoreDuplicates: true },
  );

  if (error) {
    console.error("Community membership creation failed", error.message);
    return false;
  }

  return true;
}

export async function joinCommunityAction(
  communityId: string,
): Promise<CommunityJoinActionState> {
  if (!communityId || communityId.length > 128) {
    return { success: false, message: "Choose a valid locality community." };
  }

  const context = await authenticatedPostContext();
  if (!context) {
    return { success: false, message: "Please log in to join this community." };
  }

  const community = await validateCommunity(communityId);
  if (!community) {
    return { success: false, message: "That locality community is not available." };
  }

  const joined = await ensureCommunityMembership(context, community.id);
  if (!joined) {
    return { success: false, message: "We could not join the community. Please try again." };
  }

  const path = communityPath({
    citySlug: community.locality.city.slug,
    localitySlug: community.locality.slug,
  });
  revalidatePath("/community");
  revalidatePath(path);

  return { success: true, message: "You joined this locality community." };
}

export async function saveCommunityPostAction(
  postId: string | null,
  _previousState: CommunityPostActionState,
  input: CommunityPostFormValues,
): Promise<CommunityPostActionState> {
  const parsed = validateCommunityPost(input);

  if (!parsed.success) {
    return failure("Please review the highlighted fields.", parsed.errors);
  }

  const context = await authenticatedPostContext();
  if (!context) {
    return failure("Your session has expired. Please log in again.");
  }

  const community = await validateCommunity(input.communityId);
  if (!community) {
    return failure("That locality community is not available.", {
      communityId: "Choose an available locality.",
    });
  }

  const joined = await ensureCommunityMembership(context, community.id);
  if (!joined) {
    return failure("We could not join this locality community. Please try again.");
  }

  const roomPath = communityPath({
    citySlug: community.locality.city.slug,
    localitySlug: community.locality.slug,
  });

  const now = new Date().toISOString();
  const postValues = {
    ...parsed.data,
    communityId: community.id,
    updatedAt: now,
  };

  if (postId) {
    const ownedPost = await prisma.post.findFirst({
      where: {
        id: postId,
        status: "ACTIVE",
        author: { authUserId: context.claims.sub },
      },
      select: {
        id: true,
        community: {
          select: {
            locality: {
              select: {
                slug: true,
                city: { select: { slug: true } },
              },
            },
          },
        },
      },
    });

    if (!ownedPost) {
      return failure("This post was not found or you do not own it.");
    }

    const { data, error } = await context.supabase
      .from("Post")
      .update(postValues)
      .eq("id", postId)
      .eq("authorId", context.user.id)
      .select("id")
      .maybeSingle();

    if (error || !data) {
      console.error("Community post update failed", error?.message);
      return failure("We could not update your post. Please try again.");
    }

    revalidatePath("/community");
    revalidatePath(roomPath);
    revalidatePath(
      communityPath({
        citySlug: ownedPost.community.locality.city.slug,
        localitySlug: ownedPost.community.locality.slug,
      }),
    );
    revalidatePath(`/community/post/${postId}/edit`);
    return {
      success: true,
      message: "Your post was updated.",
      postId,
      communityPath: roomPath,
    };
  }

  const id = crypto.randomUUID();
  const { data, error } = await context.supabase
    .from("Post")
    .insert({
      id,
      ...postValues,
      authorId: context.user.id,
      createdAt: now,
      publishedAt: now,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("Community post creation failed", error?.message);
    return failure("We could not publish your post. Please try again.");
  }

  revalidatePath("/community");
  revalidatePath(roomPath);
  return {
    success: true,
    message: "Your post is live in the community.",
    postId: data.id,
    communityPath: roomPath,
  };
}

export async function deleteCommunityPostAction(
  postId: string,
): Promise<CommunityPostActionState> {
  if (!postId || postId.length > 128) {
    return failure("Choose a valid post to delete.");
  }

  const context = await authenticatedPostContext();
  if (!context) {
    return failure("Your session has expired. Please log in again.");
  }

  const ownedPost = await prisma.post.findFirst({
    where: { id: postId, author: { authUserId: context.claims.sub } },
    select: {
      id: true,
      community: {
        select: {
          locality: {
            select: {
              slug: true,
              city: { select: { slug: true } },
            },
          },
        },
      },
    },
  });

  if (!ownedPost) {
    return failure("This post was not found or you do not own it.");
  }

  const { error, count } = await context.supabase
    .from("Post")
    .delete({ count: "exact" })
    .eq("id", postId)
    .eq("authorId", context.user.id);

  if (error || count !== 1) {
    console.error("Community post deletion failed", error?.message);
    return failure("We could not delete your post. Please try again.");
  }

  revalidatePath("/community");
  revalidatePath(
    communityPath({
      citySlug: ownedPost.community.locality.city.slug,
      localitySlug: ownedPost.community.locality.slug,
    }),
  );
  return { success: true, message: "Your post was deleted." };
}
