import { useState } from "react";

type ProfileAvatarProps = {
  name: string;
  imageUrl: string | null;
  className?: string;
  size?: "small" | "medium" | "large";
};

export default function ProfileAvatar({
  name,
  imageUrl,
  className = "",
  size = "medium",
}: ProfileAvatarProps) {
  const [failedUrl, setFailedUrl] = useState("");
  const initials =
    name
      .trim()
      .split(/\s+/)
      .map((part) => part.charAt(0))
      .join("")
      .slice(0, 2)
      .toUpperCase() || "G";

  return (
    <span
      className={`avatar profile-avatar profile-avatar-${size} ${className}`.trim()}
      aria-label={name ? `${name} profile picture` : "Profile picture"}
    >
      {imageUrl && failedUrl !== imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setFailedUrl(imageUrl)}
        />
      ) : (
        initials
      )}
    </span>
  );
}
