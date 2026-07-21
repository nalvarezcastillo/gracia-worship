import { PrimaryButton, SecondaryButton } from "@/components/ui/action-button";

export function SongResourceButtons({ songId }: { songId: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <PrimaryButton className="w-full" href={`/viewer?type=pdf&song=${songId}`}>
        View Sheet Music
      </PrimaryButton>
      <SecondaryButton className="w-full" href={`/viewer?type=video&song=${songId}`}>
        Watch Video
      </SecondaryButton>
    </div>
  );
}
