import { cn } from "@/lib/utils";

type Props = {
  fullName?: string | null;
  imageUrl?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
};

const SIZES: Record<NonNullable<Props["size"]>, string> = {
  sm: "w-8 h-8 text-xs",
  md: "w-10 h-10 text-sm",
  lg: "w-16 h-16 text-lg",
  xl: "w-24 h-24 text-2xl",
};

function initials(name?: string | null): string {
  if (!name) return "U";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "U";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export function ProfileAvatar({
  fullName,
  imageUrl,
  size = "md",
  className,
}: Props) {
  const base = cn(
    "rounded-full flex items-center justify-center overflow-hidden shrink-0 ring-1 ring-border bg-primary/15 text-primary font-semibold",
    SIZES[size],
    className,
  );
  if (imageUrl) {
    return (
      <div className={base}>
        <img
          src={imageUrl}
          alt={fullName ?? "Profile"}
          className="w-full h-full object-cover"
        />
      </div>
    );
  }
  return <div className={base}>{initials(fullName)}</div>;
}
