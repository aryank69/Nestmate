"use client";

import Link from "next/link";
import {
  startTransition,
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertCircle,
  Armchair,
  ArrowLeft,
  Bath,
  BedDouble,
  Building2,
  CalendarDays,
  Car,
  Check,
  CheckCircle2,
  ChevronDown,
  Home,
  IndianRupee,
  LoaderCircle,
  MapPin,
  MessageSquareText,
  NotebookTabs,
  Search,
  ShieldCheck,
  Sparkles,
  Tags,
  Type,
  UserRoundCheck,
  UsersRound,
  Wrench,
} from "lucide-react";

import {
  saveCommunityPostAction,
  updateCommunityPostImagesAction,
} from "@/app/community/actions";
import {
  initialListingImageDrafts,
  PostImageUploader,
  type ListingImageDraft,
} from "@/components/community/post-image-uploader";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  communityPath,
  ATTACHED_BATHROOM_OPTIONS,
  FURNISHING_OPTIONS,
  HOUSING_OPTIONS,
  PARKING_OPTIONS,
  PREFERRED_OCCUPANT_OPTIONS,
  validateCommunityPost,
} from "@/lib/community";
import {
  listingImagePath,
  LISTING_IMAGE_BUCKET,
  supportsListingImages,
  validateListingImageFile,
} from "@/lib/listing-images";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type {
  CommunityLocationOption,
  CommunityPostActionState,
  CommunityPostCategory,
  CommunityPostFormField,
  CommunityPostFormInitial,
  CommunityPostFormValues,
} from "@/types/community";

type PostTypeConfig = {
  value: CommunityPostCategory;
  label: string;
  description: string;
  icon: typeof Search;
  amountLabel: string;
  dateLabel: string;
  housingTypeLabel: string;
  housingFeatureLabel: string;
  descriptionPlaceholder: string;
};

const postTypeOptions: PostTypeConfig[] = [
  {
    value: "Need a Room",
    label: "Need a Room",
    description: "Tell the community what kind of room you are looking for.",
    icon: Search,
    amountLabel: "Monthly budget",
    dateLabel: "Move-in date",
    housingTypeLabel: "Preferred room type",
    housingFeatureLabel: "Furnishing preference",
    descriptionPlaceholder:
      "Share your preferred area, commute needs, lifestyle, and anything a potential flatmate should know...",
  },
  {
    value: "Room Available",
    label: "Room Available",
    description: "Share an available room with people searching nearby.",
    icon: BedDouble,
    amountLabel: "Monthly rent",
    dateLabel: "Available from",
    housingTypeLabel: "Property type",
    housingFeatureLabel: "Room type / occupancy",
    descriptionPlaceholder:
      "Describe the room, home, current flatmates, nearby landmarks, and what makes it a good fit...",
  },
  {
    value: "Need Flatmate",
    label: "Need a Flatmate",
    description: "Find someone compatible to share your current home.",
    icon: UsersRound,
    amountLabel: "Flatmate’s monthly share",
    dateLabel: "Move-in date",
    housingTypeLabel: "Home type",
    housingFeatureLabel: "Room offered",
    descriptionPlaceholder:
      "Introduce the home, current residents, daily routine, and the kind of flatmate who would feel comfortable...",
  },
  {
    value: "PG Available",
    label: "PG Available",
    description: "List a PG or co-living option for local members.",
    icon: Building2,
    amountLabel: "Monthly rent",
    dateLabel: "Available from",
    housingTypeLabel: "Occupancy type",
    housingFeatureLabel: "Meals",
    descriptionPlaceholder:
      "Describe the property, included services, house rules, nearby landmarks, and who the PG is best suited for...",
  },
];

const initialActionState: CommunityPostActionState = {
  success: false,
  message: "",
};
const listingDetailFields: CommunityPostFormField[] = [
  "furnishingStatus",
  "securityDeposit",
  "maintenanceAmount",
  "amenities",
  "preferredOccupant",
  "attachedBathroom",
  "parkingType",
];
const inputClassName =
  "h-12 w-full rounded-xl border border-input bg-background px-4 text-[0.9375rem] font-medium text-foreground shadow-xs outline-none transition-[border-color,box-shadow] placeholder:font-normal placeholder:text-muted-foreground/75 hover:border-border focus:border-primary focus:ring-3 focus:ring-ring/15 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/10";
const labelClassName = "text-sm font-semibold text-foreground";

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="flex items-center gap-1.5 text-xs font-medium text-destructive">
      <AlertCircle aria-hidden="true" className="size-3.5" />
      {message}
    </p>
  );
}

function emptyValues(communityId: string): CommunityPostFormValues {
  return {
    postType: "",
    communityId,
    title: "",
    amount: "",
    moveInDate: "",
    genderPreference: "",
    housingType: "",
    housingFeature: "",
    furnishingStatus: "",
    securityDeposit: "",
    maintenanceAmount: "",
    amenities: "",
    preferredOccupant: "",
    attachedBathroom: "",
    parkingType: "",
    description: "",
    tags: "",
  };
}

export function CreatePostFlow({
  locations,
  initialCity,
  initialLocality,
  initialPost,
  lockedCommunity,
  authUserId,
}: {
  locations: CommunityLocationOption[];
  initialCity: string;
  initialLocality: string;
  initialPost?: CommunityPostFormInitial;
  lockedCommunity?: CommunityLocationOption;
  authUserId: string;
}) {
  const requestedLocation =
    lockedCommunity ??
    locations.find((location) => location.id === initialPost?.communityId) ??
    locations.find(
      (location) =>
        location.city === initialCity &&
        (!initialLocality || location.locality === initialLocality),
    ) ??
    locations.find((location) => location.city === initialCity) ??
    locations[0];
  const [step, setStep] = useState<1 | 2>(initialPost ? 2 : 1);
  const [selectedCity, setSelectedCity] = useState(requestedLocation?.city ?? "");
  const [values, setValues] = useState<CommunityPostFormValues>(
    initialPost ?? emptyValues(requestedLocation?.id ?? ""),
  );
  const [clientErrors, setClientErrors] = useState<
    Partial<Record<CommunityPostFormField, string>>
  >({});
  const [ignoreServerErrors, setIgnoreServerErrors] = useState(false);
  const [images, setImages] = useState<ListingImageDraft[]>(() =>
    initialListingImageDrafts(initialPost?.images ?? []),
  );
  const [homeDetailsOpen, setHomeDetailsOpen] = useState(() =>
    Boolean(
      initialPost &&
        (initialPost.furnishingStatus ||
          initialPost.securityDeposit ||
          initialPost.maintenanceAmount ||
          initialPost.amenities ||
          initialPost.preferredOccupant ||
          initialPost.attachedBathroom ||
          initialPost.parkingType),
    ),
  );
  const originalImagePaths = useRef(
    (initialPost?.images ?? []).map((image) => image.path),
  );
  const latestImages = useRef(images);
  const syncingPostId = useRef<string | null>(null);
  const [imageSaveState, setImageSaveState] = useState<
    "idle" | "saving" | "complete" | "error"
  >("idle");
  const [imageSaveError, setImageSaveError] = useState("");
  const saveAction = useMemo(
    () => saveCommunityPostAction.bind(null, initialPost?.id ?? null),
    [initialPost?.id],
  );
  const [actionState, dispatch, isPending] = useActionState(
    saveAction,
    initialActionState,
  );
  const postType = values.postType as CommunityPostCategory;
  const config = postTypeOptions.find((option) => option.value === postType);
  const errors = Object.keys(clientErrors).length
    ? clientErrors
    : ignoreServerErrors
      ? {}
      : actionState.fieldErrors ?? {};
  const cityOptions = [...new Set(locations.map((location) => location.city))];
  const localityOptions = locations.filter(
    (location) => location.city === selectedCity,
  );
  const currentLocation =
    locations.find((location) => location.id === values.communityId) ??
    requestedLocation;
  const returnPath =
    actionState.communityPath ??
    (currentLocation ? communityPath(currentLocation) : "/community");

  useEffect(() => {
    latestImages.current = images;
  }, [images]);

  useEffect(
    () => () => {
      latestImages.current.forEach((image) => {
        if (image.file) URL.revokeObjectURL(image.previewUrl);
      });
    },
    [],
  );

  const syncImages = async (postId: string) => {
    setImageSaveState("saving");
    setImageSaveError("");
    const supabase = createSupabaseBrowserClient();
    const desiredImages = supportsListingImages(postType) ? images : [];
    const uploadedPaths: string[] = [];
    const resolvedImages: ListingImageDraft[] = [];
    let metadataSaved = false;

    try {
      for (const image of desiredImages) {
        if (image.path) {
          resolvedImages.push(image);
          continue;
        }

        if (!image.file || validateListingImageFile(image.file)) {
          throw new Error("One or more selected images are no longer valid.");
        }

        const path = listingImagePath(authUserId, postId, image.file);
        const { error } = await supabase.storage
          .from(LISTING_IMAGE_BUCKET)
          .upload(path, image.file, {
            cacheControl: "3600",
            contentType: image.file.type,
            upsert: false,
          });

        if (error) {
          console.error("Listing image upload failed", error);
          throw new Error(
            "A photo could not be uploaded. Check its format and size, then try again.",
          );
        }

        uploadedPaths.push(path);
        resolvedImages.push({ ...image, path });
      }

      setImages(resolvedImages);
      const finalPaths = resolvedImages.flatMap((image) =>
        image.path ? [image.path] : [],
      );
      const result = await updateCommunityPostImagesAction(postId, finalPaths);
      if (!result.success) throw new Error(result.message);
      metadataSaved = true;

      const removedPaths = originalImagePaths.current.filter(
        (path) => !finalPaths.includes(path),
      );
      if (removedPaths.length) {
        const { error } = await supabase.storage
          .from(LISTING_IMAGE_BUCKET)
          .remove(removedPaths);
        if (error) {
          console.error("Listing image removal failed", error);
          throw new Error(
            "Your post was saved, but an old photo could not be removed. Try again to finish cleanup.",
          );
        }
      }

      originalImagePaths.current = finalPaths;
      resolvedImages.forEach((image) => {
        if (image.file) URL.revokeObjectURL(image.previewUrl);
      });
      setImageSaveState("complete");
    } catch (error) {
      if (uploadedPaths.length && !metadataSaved) {
        await supabase.storage.from(LISTING_IMAGE_BUCKET).remove(uploadedPaths);
        const uploadedPathSet = new Set(uploadedPaths);
        setImages((current) =>
          current.map((image) =>
            image.path && uploadedPathSet.has(image.path)
              ? { ...image, path: undefined }
              : image,
          ),
        );
      }
      setImageSaveError(
        error instanceof Error
          ? error.message
          : "We could not save the listing photos. Please try again.",
      );
      setImageSaveState("error");
    }
  };

  useEffect(() => {
    if (
      !actionState.success ||
      !actionState.postId ||
      syncingPostId.current === actionState.postId
    ) {
      return;
    }
    syncingPostId.current = actionState.postId;
    void syncImages(actionState.postId);
    // The submitted image snapshot should run exactly once per successful post save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionState.postId, actionState.success]);

  const updateField = (field: CommunityPostFormField, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setClientErrors((current) => ({ ...current, [field]: undefined }));
    setIgnoreServerErrors(true);
  };

  const choosePostType = (value: CommunityPostCategory) => {
    setValues((current) => ({
      ...current,
      postType: value,
      housingType: current.postType === value ? current.housingType : "",
      housingFeature: current.postType === value ? current.housingFeature : "",
    }));
    setIgnoreServerErrors(true);
  };

  const handleCityChange = (city: string) => {
    setSelectedCity(city);
    updateField(
      "communityId",
      locations.find((location) => location.city === city)?.id ?? "",
    );
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = validateCommunityPost(values);
    if (!parsed.success) {
      setClientErrors(parsed.errors);
      setIgnoreServerErrors(true);
      if (listingDetailFields.some((field) => parsed.errors[field])) {
        setHomeDetailsOpen(true);
      }
      const firstInvalidField = Object.keys(parsed.errors)[0];
      requestAnimationFrame(() => document.getElementById(firstInvalidField)?.focus());
      return;
    }

    setClientErrors({});
    setIgnoreServerErrors(false);
    startTransition(() => dispatch(values));
  };

  if (actionState.success && config && imageSaveState === "complete") {
    return (
      <div className="surface-card mx-auto max-w-2xl px-6 py-12 text-center sm:px-10 sm:py-16">
        <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
          <CheckCircle2 aria-hidden="true" className="size-8" />
        </span>
        <p className="mt-6 text-sm font-semibold text-primary">
          {initialPost ? "Post updated" : "Post published"}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
          {initialPost ? "Your changes are live" : "Your post is live"}
        </h1>
        <p className="mx-auto mt-4 max-w-lg text-base leading-7 text-muted-foreground">
          {actionState.message} Community members can now find it in the real locality feed.
        </p>
        <Link href={returnPath} className={cn(buttonVariants({ size: "lg" }), "mt-8")}>
          View Locality Community
        </Link>
      </div>
    );
  }

  if (actionState.success && actionState.postId) {
    return (
      <div className="surface-card mx-auto max-w-2xl px-6 py-12 text-center sm:px-10 sm:py-16">
        <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
          {imageSaveState === "error" ? (
            <AlertCircle aria-hidden="true" className="size-8 text-destructive" />
          ) : (
            <LoaderCircle aria-hidden="true" className="size-8 animate-spin" />
          )}
        </span>
        <h1 className="mt-6 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
          {imageSaveState === "error"
            ? "The post is saved"
            : "Finishing your listing"}
        </h1>
        <p className="mx-auto mt-4 max-w-lg text-base leading-7 text-muted-foreground">
          {imageSaveState === "error"
            ? imageSaveError
            : "We’re securely attaching your selected photos. Keep this page open for a moment."}
        </p>
        {imageSaveState === "error" ? (
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <Button
              type="button"
              size="lg"
              onClick={() => void syncImages(actionState.postId!)}
            >
              Try Photo Upload Again
            </Button>
            <Link
              href={`/community/post/${encodeURIComponent(actionState.postId)}/edit`}
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
              )}
            >
              Edit Later
            </Link>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <Link href={returnPath} className="inline-flex items-center gap-2 rounded-lg text-sm font-semibold text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/25">
        <ArrowLeft aria-hidden="true" className="size-4" />
        Back to Locality Community
      </Link>

      {!initialPost ? (
        <div className="mt-7 flex items-center gap-3" aria-label={`Step ${step} of 2`}>
          {[1, 2].map((item) => (
            <div key={item} className={cn("h-1.5 flex-1 rounded-full", item <= step ? "bg-primary" : "bg-muted")} />
          ))}
        </div>
      ) : null}

      {step === 1 ? (
        <section className="mt-8">
          <p className="text-sm font-semibold text-primary">Step 1 of 2</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em] sm:text-5xl">What would you like to post?</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">Choose the option that best matches your housing need.</p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {postTypeOptions.map((option) => {
              const Icon = option.icon;
              const isSelected = postType === option.value;
              return (
                <button key={option.value} type="button" aria-pressed={isSelected} onClick={() => choosePostType(option.value)} className={cn("group relative flex min-h-44 flex-col items-start rounded-2xl border bg-card p-5 text-left shadow-sm outline-none transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg focus-visible:ring-3 focus-visible:ring-ring/25 sm:p-6", isSelected && "border-primary bg-primary/[0.035] ring-1 ring-primary/15")}>
                  <span className={cn("flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground", isSelected && "bg-primary text-primary-foreground")}><Icon aria-hidden="true" className="size-5" /></span>
                  <span className="mt-5 text-lg font-semibold">{option.label}</span>
                  <span className="mt-2 text-sm leading-6 text-muted-foreground">{option.description}</span>
                  {isSelected ? <span className="absolute right-4 top-4 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check aria-hidden="true" className="size-3.5" /></span> : null}
                </button>
              );
            })}
          </div>
          <div className="mt-7 flex justify-end">
            <Button type="button" size="lg" className="w-full sm:w-auto" disabled={!config} onClick={() => setStep(2)}>Continue</Button>
          </div>
        </section>
      ) : config ? (
        <section className="mt-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-primary">{initialPost ? "Edit community post" : "Step 2 of 2"}</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em] sm:text-5xl">{initialPost ? "Update your post" : "Add your post details"}</h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">Clear details help the right people respond with confidence.</p>
            </div>
            {!initialPost ? (
              <button type="button" onClick={() => setStep(1)} className="inline-flex w-fit items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2 text-sm font-semibold shadow-xs outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/25">
                <config.icon aria-hidden="true" className="size-4 text-primary" />{config.label}<span className="text-xs font-medium text-muted-foreground">Change</span>
              </button>
            ) : null}
          </div>

          <form noValidate onSubmit={handleSubmit} className="surface-card mt-8 p-5 sm:p-7">
            {actionState.message && !actionState.success && !ignoreServerErrors ? (
              <FormAlert title="We couldn’t save your post" message={actionState.message} />
            ) : Object.keys(clientErrors).length ? (
              <FormAlert title="Please review the form" message="Complete the highlighted fields before publishing." />
            ) : null}

            <div className="grid gap-x-5 gap-y-6 sm:grid-cols-2">
              {lockedCommunity ? (
                <div className="rounded-2xl border border-primary/15 bg-primary/[0.035] p-4 sm:col-span-2">
                  <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-primary">
                    <MapPin aria-hidden="true" className="size-3.5" />
                    Posting in
                  </p>
                  <p className="mt-2 text-lg font-semibold">{lockedCommunity.locality}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{lockedCommunity.city}</p>
                </div>
              ) : (
                <>
                  <SelectField id="city" label="City" value={selectedCity} onChange={handleCityChange} icon={MapPin} options={cityOptions.map((city) => ({ value: city, label: city }))} />
                  <SelectField id="communityId" label="Locality" value={values.communityId} onChange={(value) => updateField("communityId", value)} icon={MapPin} options={localityOptions.map((location) => ({ value: location.id, label: location.locality }))} error={errors.communityId} placeholder="Choose locality" />
                </>
              )}
              <TextField id="title" label="Post title" value={values.title} onChange={(value) => updateField("title", value)} icon={Type} placeholder="A clear summary of what you’re looking for or offering" error={errors.title} maxLength={140} wide />
              <TextField id="amount" label={config.amountLabel} value={values.amount} onChange={(value) => updateField("amount", value)} icon={IndianRupee} placeholder="e.g. 18000" error={errors.amount} type="number" />
              <TextField id="moveInDate" label={config.dateLabel} value={values.moveInDate} onChange={(value) => updateField("moveInDate", value)} icon={CalendarDays} error={errors.moveInDate} type="date" />
              <SelectField id="genderPreference" label="Gender preference" value={values.genderPreference} onChange={(value) => updateField("genderPreference", value)} icon={UsersRound} options={["Any gender", "Women only", "Men only"].map((value) => ({ value, label: value }))} error={errors.genderPreference} placeholder="Choose preference" />
              <SelectField id="housingType" label={config.housingTypeLabel} value={values.housingType} onChange={(value) => updateField("housingType", value)} icon={Home} options={HOUSING_OPTIONS[postType].housingTypes.map((value) => ({ value, label: value }))} error={errors.housingType} placeholder="Choose option" />
              <SelectField id="housingFeature" label={config.housingFeatureLabel} value={values.housingFeature} onChange={(value) => updateField("housingFeature", value)} icon={BedDouble} options={HOUSING_OPTIONS[postType].housingFeatures.map((value) => ({ value, label: value }))} error={errors.housingFeature} placeholder="Choose option" wide />

              {supportsListingImages(postType) ? (
                <section className="rounded-2xl border border-border/80 bg-muted/25 p-4 sm:col-span-2 sm:p-5">
                  <button
                    type="button"
                    aria-expanded={homeDetailsOpen}
                    aria-controls="listing-home-details"
                    onClick={() => setHomeDetailsOpen((open) => !open)}
                    className="flex w-full items-center gap-3 rounded-xl text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/25"
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                      <NotebookTabs aria-hidden="true" className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-base font-semibold">Home details</span>
                      <span className="mt-1 block text-sm leading-6 text-muted-foreground">
                        Add optional details that help people understand the space.
                      </span>
                    </span>
                    <span className="hidden rounded-full bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground sm:inline-flex">
                      Optional
                    </span>
                    <ChevronDown
                      aria-hidden="true"
                      className={cn(
                        "size-5 shrink-0 text-muted-foreground transition-transform",
                        homeDetailsOpen && "rotate-180",
                      )}
                    />
                  </button>

                  {homeDetailsOpen ? (
                  <div id="listing-home-details" className="mt-5 grid gap-x-4 gap-y-5 border-t border-border/70 pt-5 sm:grid-cols-2">
                    <SelectField id="furnishingStatus" label="Furnishing" optional value={values.furnishingStatus} onChange={(value) => updateField("furnishingStatus", value)} icon={Armchair} options={FURNISHING_OPTIONS.map((value) => ({ value, label: value }))} error={errors.furnishingStatus} placeholder="Not specified" />
                    <SelectField id="preferredOccupant" label={postType === "PG Available" ? "Preferred tenant" : "Preferred tenant / flatmate"} optional value={values.preferredOccupant} onChange={(value) => updateField("preferredOccupant", value)} icon={UserRoundCheck} options={PREFERRED_OCCUPANT_OPTIONS.map((value) => ({ value, label: value }))} error={errors.preferredOccupant} placeholder="No preference" />
                    <TextField id="securityDeposit" label="Security deposit" optional value={values.securityDeposit} onChange={(value) => updateField("securityDeposit", value)} icon={ShieldCheck} placeholder="e.g. 36000" error={errors.securityDeposit} type="number" min={0} />
                    <TextField id="maintenanceAmount" label="Monthly maintenance" optional value={values.maintenanceAmount} onChange={(value) => updateField("maintenanceAmount", value)} icon={Wrench} placeholder="e.g. 2500" error={errors.maintenanceAmount} type="number" min={0} />
                    <SelectField id="attachedBathroom" label="Attached bathroom" optional value={values.attachedBathroom} onChange={(value) => updateField("attachedBathroom", value)} icon={Bath} options={ATTACHED_BATHROOM_OPTIONS.map((value) => ({ value, label: value }))} error={errors.attachedBathroom} placeholder="Not specified" />
                    <SelectField id="parkingType" label="Parking" optional value={values.parkingType} onChange={(value) => updateField("parkingType", value)} icon={Car} options={PARKING_OPTIONS.map((value) => ({ value, label: value }))} error={errors.parkingType} placeholder="Not specified" />
                    <TextField id="amenities" label="Amenities" optional value={values.amenities} onChange={(value) => updateField("amenities", value)} icon={Sparkles} placeholder="Wi-Fi, power backup, washing machine" error={errors.amenities} help="Separate up to 8 amenities with commas." wide />
                  </div>
                  ) : null}
                </section>
              ) : null}
              <TextField id="tags" label="Helpful tags" optional value={values.tags} onChange={(value) => updateField("tags", value)} icon={Tags} placeholder="e.g. No brokerage, Metro nearby, Pet friendly" error={errors.tags} help="Separate up to 5 tags with commas. Housing details are added automatically." wide />

              {supportsListingImages(postType) ? (
                <PostImageUploader
                  images={images}
                  onChange={setImages}
                  disabled={isPending}
                />
              ) : null}

              <div className="space-y-2 sm:col-span-2">
                <label htmlFor="description" className={labelClassName}>Description <span className="text-primary">*</span></label>
                <div className="relative">
                  <MessageSquareText aria-hidden="true" className="pointer-events-none absolute left-3.5 top-3.5 size-4 text-muted-foreground" />
                  <textarea id="description" rows={6} maxLength={2000} value={values.description} onChange={(event) => updateField("description", event.target.value)} placeholder={config.descriptionPlaceholder} aria-invalid={Boolean(errors.description)} aria-describedby={errors.description ? "description-error" : undefined} className={cn(inputClassName, "h-auto min-h-36 resize-y py-3 pl-10 leading-6")} />
                </div>
                <div className="flex items-start justify-between gap-4"><FieldError id="description-error" message={errors.description} /><p className="ml-auto shrink-0 text-xs text-muted-foreground">{values.description.length}/2000</p></div>
              </div>
            </div>

            <div className="mt-7 flex flex-col-reverse gap-3 border-t border-border/70 pt-6 sm:flex-row sm:justify-end">
              {!initialPost ? <Button type="button" variant="outline" size="lg" onClick={() => setStep(1)} disabled={isPending}>Back</Button> : null}
              <Button type="submit" size="lg" disabled={isPending}>
                {isPending ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : null}
                {isPending ? "Saving..." : initialPost ? "Save Changes" : "Publish Post"}
              </Button>
            </div>
          </form>
        </section>
      ) : null}
    </div>
  );
}

function FormAlert({ title, message }: { title: string; message: string }) {
  return (
    <div role="alert" className="mb-6 flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/7 p-4 text-sm text-destructive">
      <AlertCircle aria-hidden="true" className="mt-0.5 size-4.5 shrink-0" />
      <div><p className="font-semibold">{title}</p><p className="mt-1 text-destructive/85">{message}</p></div>
    </div>
  );
}

type FieldIcon = typeof MapPin;

function TextField({ id, label, optional, value, onChange, icon: Icon, placeholder, error, help, maxLength, min, type = "text", wide }: { id: CommunityPostFormField; label: string; optional?: boolean; value: string; onChange: (value: string) => void; icon: FieldIcon; placeholder?: string; error?: string; help?: string; maxLength?: number; min?: number; type?: string; wide?: boolean }) {
  const errorId = `${id}-error`;
  return (
    <div className={cn("space-y-2", wide && "sm:col-span-2")}>
      <label htmlFor={id} className={labelClassName}>{label} {optional ? <span className="font-normal text-muted-foreground">(optional)</span> : <span className="text-primary">*</span>}</label>
      <div className="relative"><Icon aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input id={id} type={type} min={min ?? (type === "number" ? 1 : undefined)} inputMode={type === "number" ? "numeric" : undefined} maxLength={maxLength} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : help ? `${id}-help` : undefined} className={cn(inputClassName, "pl-10")} /></div>
      {help ? <p id={`${id}-help`} className="text-xs text-muted-foreground">{help}</p> : null}
      <FieldError id={errorId} message={error} />
    </div>
  );
}

function SelectField({ id, label, optional, value, onChange, icon: Icon, options, error, placeholder, wide }: { id: string; label: string; optional?: boolean; value: string; onChange: (value: string) => void; icon: FieldIcon; options: { value: string; label: string }[]; error?: string; placeholder?: string; wide?: boolean }) {
  const errorId = `${id}-error`;
  return (
    <div className={cn("space-y-2", wide && "sm:col-span-2")}>
      <label htmlFor={id} className={labelClassName}>{label} {optional ? <span className="font-normal text-muted-foreground">(optional)</span> : <span className="text-primary">*</span>}</label>
      <div className="relative"><Icon aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><select id={id} value={value} onChange={(event) => onChange(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} className={cn(inputClassName, "appearance-none pl-10 pr-9")}>{placeholder ? <option value="">{placeholder}</option> : null}{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /></div>
      <FieldError id={errorId} message={error} />
    </div>
  );
}
